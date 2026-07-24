/**
 * Alpha Lifts AI coach — Cloudflare Worker.
 *
 * The app is a static PWA on GitHub Pages, so it cannot call the Anthropic API directly:
 * the key would ship inside the JS bundle. This Worker is the only thing that holds the key.
 *
 * Contract: POST / with {messages, context, userId} -> {reply, usage} | {error}
 */

import Anthropic from '@anthropic-ai/sdk';
import { buildSystem, type CoachContext } from './prompt';
import { COACH_TOOLS } from './tools';
import { isEntitled } from './access';
import { checkBudget, costMicroUsd, recordSpend } from './usage';

export interface Env {
  ANTHROPIC_API_KEY: string;
  ALLOWED_ORIGINS: string;
  // KV namespace backing both the per-device monthly spend cap (usage.ts) and the access
  // allowlist (access.ts). Optional so the Worker still runs without it.
  USAGE?: KVNamespace;
  // "true" enforces the coach access allowlist (access.ts). Unset/anything else = gate off.
  REQUIRE_ALLOWLIST?: string;
}

const MODEL = 'claude-opus-4-8';

/** Fitness answers are short. This is a hard ceiling on cost-per-message, not a target. */
const MAX_TOKENS = 1024;

/** Longest single user message we'll forward, in characters. */
const MAX_MESSAGE_CHARS = 2000;

/**
 * How many turns of history to forward. The whole history is re-sent on every request and
 * billed as input each time, so an uncapped conversation's cost grows quadratically — this
 * is the main thing standing between a long chat and a surprising bill.
 */
const MAX_HISTORY_MESSAGES = 20;

interface ChatRequest {
  messages?: { role: string; content: string }[];
  context?: CoachContext;
  userId?: string;
  // "status" = a lightweight entitlement/budget probe with no Anthropic call (and no cost),
  // used by the app to decide whether to show the coach or a locked/upsell screen. Anything
  // else (incl. absent) is a normal chat request.
  op?: string;
}

function corsHeaders(origin: string | null, env: Env): Record<string, string> {
  const allowed = env.ALLOWED_ORIGINS.split(',').map(s => s.trim()).filter(Boolean);
  // Echo the origin only when it's on the list — never `*`. A wildcard here would let any
  // page on the internet spend this key.
  if (!origin || !allowed.includes(origin)) return {};
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin'
  };
}

function json(body: unknown, status: number, cors: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...cors }
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const origin = request.headers.get('Origin');
    const cors = corsHeaders(origin, env);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors });
    }
    if (request.method !== 'POST') {
      return json({ error: 'Method not allowed' }, 405, cors);
    }
    // An empty `cors` map means the Origin wasn't on the allowlist. Reject outright rather
    // than serving the request with no CORS header — the browser would block the *response*,
    // but only after we'd already paid for the API call.
    if (Object.keys(cors).length === 0) {
      return json({ error: 'Origin not allowed' }, 403, {});
    }

    let body: ChatRequest;
    try {
      body = (await request.json()) as ChatRequest;
    } catch {
      return json({ error: 'Invalid JSON' }, 400, cors);
    }

    const userId = typeof body.userId === 'string' ? body.userId.slice(0, 128) : 'anonymous';

    // Entitlement, evaluated once and reused for both the status probe and the real request.
    const entitled = await isEntitled(env, userId);

    // Status probe: report whether this caller may use the coach, without an Anthropic call. The
    // app calls this on opening the Coach tab to decide chat-vs-locked screen. `entitled` here is
    // advisory UI state only — the real block still happens server-side on the actual send below,
    // so a spoofed "entitled: true" buys nothing.
    if (body.op === 'status') {
      const b = await checkBudget(env, userId);
      return json({ entitled, budgetOk: b.allowed, spent: b.spent, limit: b.limit }, 200, cors);
    }

    const incoming = Array.isArray(body.messages) ? body.messages : [];
    const messages = incoming
      .filter(m => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
      .map(m => ({ role: m.role as 'user' | 'assistant', content: m.content.slice(0, MAX_MESSAGE_CHARS) }))
      .slice(-MAX_HISTORY_MESSAGES);

    if (messages.length === 0) {
      return json({ error: 'No messages' }, 400, cors);
    }
    // The API requires the conversation to end on a user turn.
    if (messages[messages.length - 1].role !== 'user') {
      return json({ error: 'Last message must be from the user' }, 400, cors);
    }

    // Access gate (allowlist today; a subscription/receipt check later — same seam). Checked
    // before the budget so an un-approved caller is rejected without touching KV spend or the API.
    if (!entitled) {
      return json({ error: 'not_entitled' }, 403, cors);
    }

    const budget = await checkBudget(env, userId);
    if (!budget.allowed) {
      return json(
        { error: 'budget_exhausted', spent: budget.spent, limit: budget.limit },
        402,
        cors
      );
    }

    const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

    let response;
    try {
      response = await client.messages.create({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        // Note the system prompt is built here from the request's *context* only. Whatever
        // the client may have put in a `system` field is not read anywhere in this file.
        system: buildSystem(body.context),
        thinking: { type: 'adaptive' },
        output_config: { effort: 'low' },
        // The coach can propose app changes via tools. These are deliberately single-turn:
        // a tool_use block is a *proposal* the client will confirm-and-apply locally, so we
        // never send a tool_result back for another (billed) round trip. See tools.ts.
        tools: COACH_TOOLS,
        messages
      });
    } catch (err) {
      if (err instanceof Anthropic.RateLimitError) {
        return json({ error: 'rate_limited' }, 429, cors);
      }
      if (err instanceof Anthropic.APIError) {
        console.error('Anthropic API error', err.status, err.message);
        return json({ error: 'upstream_error' }, 502, cors);
      }
      console.error('Unexpected error', err);
      return json({ error: 'internal_error' }, 500, cors);
    }

    const microUsd = costMicroUsd(MODEL, response.usage);
    await recordSpend(env, userId, microUsd);

    if (response.stop_reason === 'refusal') {
      return json({ error: 'refused' }, 200, cors);
    }

    const reply = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map(b => b.text)
      .join('')
      .trim();

    // Each tool_use block becomes a proposal for the client to confirm and apply locally. We
    // forward only the tool name and its input — the client validates both (resolving names to
    // ids, checking the day/exercise exists) before it ever shows an Apply button, so a
    // hallucinated tool name or bad argument degrades to a dismissable "couldn't do that" card
    // rather than anything executing.
    const proposals = response.content
      .filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use')
      .map(b => ({ tool: b.name, input: b.input }));

    return json(
      {
        reply,
        proposals,
        truncated: response.stop_reason === 'max_tokens',
        usage: { microUsd, inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens }
      },
      200,
      cors
    );
  }
};
