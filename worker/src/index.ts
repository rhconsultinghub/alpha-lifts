/**
 * Alpha Lifts AI coach — Cloudflare Worker.
 *
 * The app is a static PWA on GitHub Pages, so it cannot call the Anthropic API directly:
 * the key would ship inside the JS bundle. This Worker is the only thing that holds the key.
 *
 * Contract: POST / with {messages, context, userId} -> {reply, usage} | {error}
 */

import Anthropic from '@anthropic-ai/sdk';
import { buildSystem, sanitizeContext, type CoachContext } from './prompt';
import { COACH_TOOLS, isCompleteToolInput } from './tools';
import { isEntitled } from './access';
import { checkBudget, costMicroUsd, recordSpend } from './usage';
import { corsHeaders, json } from './http';
import { authenticate, sessionTokenVersion } from './auth';
import { findUserById, userTokenVersion } from './db';
import {
  allowRate,
  clientIp,
  readJsonCapped,
  sanitizeId,
  MAX_AI_BODY_BYTES,
  type RateLimiter
} from './guard';
import { handleOnboard } from './onboard';
import { handlePushConfig, handlePushSubscribe, handlePushUnsubscribe, sweepPushReminders } from './push';
import { handleShareCreate, handleShareGet } from './share';
import { handleParsePlan } from './parsePlan';
import {
  handleChangePassword,
  handleGetState,
  handleLogin,
  handleMe,
  handlePutState,
  handleRequestReset,
  handleResendVerification,
  handleResetPage,
  handleResetSubmit,
  handleSignup,
  handleVerify,
  handleVerifySubmit
} from './handlers';

export interface Env {
  ANTHROPIC_API_KEY: string;
  ALLOWED_ORIGINS: string;
  // KV namespace backing both the per-device monthly spend cap (usage.ts) and the access
  // allowlist (access.ts). Optional so the Worker still runs without it.
  USAGE?: KVNamespace;
  // "true" enforces the coach access allowlist (access.ts). Unset/anything else = gate off.
  REQUIRE_ALLOWLIST?: string;
  // D1 database backing user accounts + synced state (db.ts / handlers.ts). Optional so the
  // coach still runs on a build that hasn't created the database yet — the account routes 503
  // ("accounts_not_configured") when it's absent.
  DB?: D1Database;
  // HMAC secret that signs session tokens (auth.ts). Set via `wrangler secret put SESSION_SECRET`.
  // Absent = account routes 503, same as a missing DB.
  SESSION_SECRET?: string;
  // Email verification via Resend (email.ts). RESEND_API_KEY is a secret; when present, signup
  // requires email confirmation before login. Absent = verification off (signup verifies instantly).
  RESEND_API_KEY?: string;
  RESEND_FROM?: string;
  // "true" = keep blocking unverified logins even without the Resend key (see email.ts).
  REQUIRE_EMAIL_VERIFICATION?: string;
  // Where the /auth/verify landing page links back to. Set in wrangler.toml; defaults to the app.
  APP_URL?: string;
  // Per-IP rate limiters ([[ratelimits]] in wrangler.toml). Optional — absent bindings fail open
  // (guard.ts), since the hard gates (session auth, entitlement, budget) fail closed on their own.
  AUTH_LIMITER?: RateLimiter;
  AI_LIMITER?: RateLimiter;
  // Web Push workout reminders (push.ts). VAPID_PRIVATE_JWK is a secret (the ES256 signing key
  // as a JWK JSON string — `node scripts/gen-vapid.mjs`, then `wrangler secret put`);
  // VAPID_PUBLIC_KEY (base64url uncompressed P-256 point) lives in wrangler.toml — it ships to
  // every browser anyway. Both absent = push routes 503 and the cron sweep no-ops.
  VAPID_PRIVATE_JWK?: string;
  VAPID_PUBLIC_KEY?: string;
  VAPID_SUBJECT?: string;
}

import { MODEL } from './usage';

/**
 * Fitness answers are short. This is a hard ceiling on cost-per-message, not a target.
 *
 * Raised from 1024 after a real bug: adaptive thinking, the prose reply, AND every propose_* tool
 * call's input JSON all come out of this one budget. A multi-change request ("update my exercises")
 * emits several tool calls, and running out mid-JSON yields a tool_use block with missing fields —
 * which surfaced client-side as a nonsense `"" isn't in the exercise library.` card. The headroom
 * is the real fix; dropping truncated calls below is the safety net.
 */
const MAX_TOKENS = 2048;

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

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const origin = request.headers.get('Origin');
    const cors = corsHeaders(origin, env);

    // Everything below runs inside one containment net: an uncaught error (a D1 hiccup, a bug)
    // used to escape to Cloudflare's bare 500 with NO CORS headers, which the browser reports as
    // an opaque CORS failure instead of the real error. Catch it here and answer in our own
    // shape, with CORS, so the client sees an actionable `internal_error`.
    try {
      if (request.method === 'OPTIONS') {
        return new Response(null, { status: 204, headers: cors });
      }

      const path = new URL(request.url).pathname.replace(/\/+$/, '') || '/';
      const method = request.method;

      // /auth/verify and /auth/reset are top-level browser navigations from email links (their
      // POSTs are those pages' own same-origin form submits) — no allowlisted Origin header, so
      // they bypass the CORS-origin gate below and return HTML pages, not JSON. Both flows are
      // GET-shows-a-confirm-button / POST-does-the-work, so a mail scanner prefetching the GET
      // can't consume the single-use token. They still get the auth rate limiter, applied here
      // since they route before the shared block below.
      if (path === '/auth/verify' || path === '/auth/reset') {
        if (!(await allowRate(env.AUTH_LIMITER, clientIp(request)))) {
          return new Response('Too many attempts — try again in a minute.', { status: 429 });
        }
        if (path === '/auth/verify' && method === 'GET') return await handleVerify(request, env);
        if (path === '/auth/verify' && method === 'POST') return await handleVerifySubmit(request, env);
        if (path === '/auth/reset' && method === 'GET') return await handleResetPage(request, env);
        if (path === '/auth/reset' && method === 'POST') return await handleResetSubmit(request, env);
      }

      // An empty `cors` map means the Origin wasn't on the allowlist. Reject outright rather
      // than serving the request with no CORS header — the browser would block the *response*,
      // but only after we'd already done the work. Applies to every route below.
      if (Object.keys(cors).length === 0) {
        return json({ error: 'Origin not allowed' }, 403, {});
      }

      // Per-IP rate limiting, before any datastore or API work. Auth routes get the tight
      // limiter (password guessing, signup/resend email spam); AI-calling routes get a looser
      // one that still stops a runaway loop from burning the Anthropic budget.
      const ip = clientIp(request);
      if (path.startsWith('/auth/') && method === 'POST') {
        if (!(await allowRate(env.AUTH_LIMITER, ip))) return json({ error: 'rate_limited' }, 429, cors);
      }
      const isAiRoute = (path === '/' && method === 'POST') || path === '/onboard' || path === '/parse-plan';
      if (isAiRoute && !(await allowRate(env.AI_LIMITER, ip))) {
        return json({ error: 'rate_limited' }, 429, cors);
      }

      // Route by path. `/` (POST) is the coach — the original behaviour — and everything under
      // /auth and /state is accounts + cloud sync (handlers.ts).

      if (path === '/auth/signup' && method === 'POST') return await handleSignup(request, env, cors, ctx);
      if (path === '/auth/login' && method === 'POST') return await handleLogin(request, env, cors);
      if (path === '/auth/me' && method === 'GET') return await handleMe(request, env, cors);
      if (path === '/auth/resend-verification' && method === 'POST') return await handleResendVerification(request, env, cors, ctx);
      if (path === '/auth/change-password' && method === 'POST') return await handleChangePassword(request, env, cors);
      if (path === '/auth/request-reset' && method === 'POST') return await handleRequestReset(request, env, cors, ctx);
      if (path === '/state' && method === 'GET') return await handleGetState(request, env, cors);
      if (path === '/state' && method === 'PUT') return await handlePutState(request, env, cors);
      if (path === '/onboard' && method === 'POST') return await handleOnboard(request, env, cors);
      if (path === '/parse-plan' && method === 'POST') return await handleParsePlan(request, env, cors);

      // Web Push reminders. Config is public (the VAPID public key ships in every browser);
      // subscribe/unsubscribe require a session — a subscription is account-scoped data.
      if (path === '/push/config' && method === 'GET') return handlePushConfig(env, cors);
      if ((path === '/push/subscribe' || path === '/push/unsubscribe') && method === 'POST') {
        if (!env.SESSION_SECRET || !env.DB) return json({ error: 'push_not_configured' }, 503, cors);
        const session = await authenticate(request, env.SESSION_SECRET);
        if (!session) return json({ error: 'unauthorized' }, 401, cors);
        const user = await findUserById(env.DB, session.sub);
        if (!user || userTokenVersion(user) !== sessionTokenVersion(session)) {
          return json({ error: 'unauthorized' }, 401, cors);
        }
        const read = await readJsonCapped<Record<string, unknown>>(request, 8 * 1024);
        if (!read.ok) return json({ error: 'Invalid JSON' }, 400, cors);
        return path === '/push/subscribe'
          ? await handlePushSubscribe(session.sub, read.value, env, cors)
          : await handlePushUnsubscribe(session.sub, read.value, env, cors);
      }

      // Plan share links. Creating one requires a session (and rides the auth rate limiter to
      // stop share-spam); fetching by id is public — the unguessable id IS the capability, and
      // the payload is a plan the recipient still has to confirm-import client-side.
      if (path === '/share' && method === 'POST') {
        if (!env.SESSION_SECRET || !env.DB) return json({ error: 'share_not_configured' }, 503, cors);
        if (!(await allowRate(env.AUTH_LIMITER, ip))) return json({ error: 'rate_limited' }, 429, cors);
        const session = await authenticate(request, env.SESSION_SECRET);
        if (!session) return json({ error: 'unauthorized' }, 401, cors);
        const user = await findUserById(env.DB, session.sub);
        if (!user || userTokenVersion(user) !== sessionTokenVersion(session)) {
          return json({ error: 'unauthorized' }, 401, cors);
        }
        const read = await readJsonCapped<{ plan?: unknown }>(request, 80 * 1024);
        if (!read.ok) {
          return read.reason === 'too_large' ? json({ error: 'plan_too_large' }, 413, cors) : json({ error: 'Invalid JSON' }, 400, cors);
        }
        return await handleShareCreate(session.sub, read.value, env, cors);
      }
      if (path.startsWith('/share/') && method === 'GET') {
        return await handleShareGet(path.slice('/share/'.length), env, cors);
      }

      // The coach lives at POST / (unchanged contract).
      if (path !== '/') return json({ error: 'Not found' }, 404, cors);
      if (method !== 'POST') return json({ error: 'Method not allowed' }, 405, cors);

      return await handleCoach(request, env, cors);
    } catch (err) {
      console.error('Unhandled error', err);
      return json({ error: 'internal_error' }, 500, cors);
    }
  },

  // Cron sweep ([triggers] in wrangler.toml): sends due workout-reminder pushes. Runs every 10
  // minutes; each subscription fires at most once per user-local day (push.ts).
  async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(sweepPushReminders(env));
  }
};

/** Estimated worst-case cost of one coach exchange, pre-charged to the budget before the API
 *  call and settled to the real cost after (see recordSpend). Sized so that even a parallel
 *  burst of requests racing the KV counter each pre-pay their way toward the cap. */
const COACH_RESERVE_MICRO_USD = 30_000; // $0.03

async function handleCoach(request: Request, env: Env, cors: Record<string, string>): Promise<Response> {
    const read = await readJsonCapped<ChatRequest>(request, MAX_AI_BODY_BYTES);
    if (!read.ok) {
      return read.reason === 'too_large'
        ? json({ error: 'body_too_large' }, 413, cors)
        : json({ error: 'Invalid JSON' }, 400, cors);
    }
    const body = read.value;

    // Identity for entitlement + budget, derived from the verified session token — so spend and
    // access follow the *account* across devices, and a client can't claim to be a different
    // account by editing the body. When accounts are configured, a session is REQUIRED: the old
    // body.userId fallback let an unauthenticated caller name any pro account's UUID (not a
    // secret — /auth/me returns it) and inherit its entitlement, or mint fresh ids to reset the
    // spend counter. The real app always has a session here (the coach UI sits behind AuthGate
    // whenever the coach is configured), so nothing user-facing changes. The device-UUID path
    // survives only for accounts-unconfigured builds (no SESSION_SECRET), where there are no
    // subscriptions to steal and the KV allowlist is the sole gate.
    const session = env.SESSION_SECRET ? await authenticate(request, env.SESSION_SECRET) : null;
    if (env.SESSION_SECRET && !session) {
      return json({ error: 'unauthorized' }, 401, cors);
    }
    // Honour per-user revocation (token_version bump on password change/reset) when the DB is
    // available to check it against.
    if (session && env.DB) {
      const user = await findUserById(env.DB, session.sub);
      if (!user || userTokenVersion(user) !== sessionTokenVersion(session)) {
        return json({ error: 'unauthorized' }, 401, cors);
      }
    }
    const userId = session ? session.sub : sanitizeId(body.userId);

    // Entitlement, evaluated once and reused for both the status probe and the real request.
    const entitled = await isEntitled(env, userId, { viaSession: session != null });

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

    // Reserve-then-settle: pre-charge the estimate so parallel requests racing the KV counter
    // each pay up front, then correct to the real cost (or refund on failure) below.
    await recordSpend(env, userId, COACH_RESERVE_MICRO_USD);

    const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

    let response;
    try {
      response = await client.messages.create({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        // Note the system prompt is built here from the request's *context* only — passed
        // through sanitizeContext, which caps every array and string, so a forged request can't
        // stuff unbounded (billed) text into the prompt. Whatever the client may have put in a
        // `system` field is not read anywhere in this file.
        system: buildSystem(sanitizeContext(body.context)),
        thinking: { type: 'adaptive' },
        output_config: { effort: 'low' },
        // The coach can propose app changes via tools. These are deliberately single-turn:
        // a tool_use block is a *proposal* the client will confirm-and-apply locally, so we
        // never send a tool_result back for another (billed) round trip. See tools.ts.
        tools: COACH_TOOLS,
        messages
      });
    } catch (err) {
      await recordSpend(env, userId, -COACH_RESERVE_MICRO_USD); // refund the reservation
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
    await recordSpend(env, userId, microUsd - COACH_RESERVE_MICRO_USD);

    if (response.stop_reason === 'refusal') {
      // 502, not the 200 it used to be — every other error in this file is a non-2xx, and a
      // client checking res.ok saw "success" with no reply. (The app's copy keys off the error
      // code, so its message is unchanged.)
      return json({ error: 'refused' }, 502, cors);
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
    //
    // A call whose input is missing a schema-required field is dropped rather than forwarded: it
    // can't resolve to anything, so the only card it could produce is a broken one. `dropped` is
    // reported so the client can say the answer came back incomplete instead of silently showing
    // fewer changes than were described in the prose.
    const toolBlocks = response.content.filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use');
    const proposals = toolBlocks
      .filter(b => isCompleteToolInput(b.name, b.input))
      .map(b => ({ tool: b.name, input: b.input }));
    const droppedProposals = toolBlocks.length - proposals.length;

    return json(
      {
        reply,
        proposals,
        droppedProposals,
        truncated: response.stop_reason === 'max_tokens',
        usage: { microUsd, inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens }
      },
      200,
      cors
    );
}
