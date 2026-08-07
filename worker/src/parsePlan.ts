/**
 * AI plan reader — POST /parse-plan.
 *
 * Takes a block of free-text (a workout plan pasted from notes, a spreadsheet, a coach, anywhere)
 * and returns a structured program the client can stage as an import. Like /onboard it forces a
 * single enum-constrained tool call so the output is always shaped and the model can only pick
 * from the app's real muscle/equipment taxonomy — it never invents categories, and exercise-name
 * resolution + custom-exercise creation happen client-side.
 *
 * Unlike /onboard (which is free — it's the first-run experience), this is a PREMIUM feature, so it
 * is gated by isEntitled() exactly like the coach send. Path: authenticate -> isEntitled -> API.
 */

import Anthropic from '@anthropic-ai/sdk';
import { authenticate, sessionTokenVersion } from './auth';
import { findUserById, userTokenVersion } from './db';
import { isEntitled } from './access';
import { json } from './http';
import { checkBudget, costMicroUsd, recordSpend } from './usage';
import { readJsonCapped, sanitizeCatalog, MAX_AI_BODY_BYTES } from './guard';

const MODEL = 'claude-opus-4-8';

/** Pre-charged cost estimate, settled to the real cost after the call (see usage.ts). Higher
 *  than the coach's: max_tokens 8000 of Opus output alone is ~$0.20, so this is the honest
 *  worst-case a single parse can bill. */
const PARSE_RESERVE_MICRO_USD = 200_000; // $0.20

// Kept in sync with the client's Muscle union (src/data/types.ts) and EQUIP_CATALOG v-values
// (src/data/exercises.ts). The model may only emit these, so a hallucinated muscle/equipment
// can't corrupt the import.
const MUSCLES = [
  'Back', 'Biceps', 'Rear Delts', 'Chest', 'Triceps', 'Forearms', 'Shoulders',
  'Quads', 'Hamstrings', 'Glutes', 'Calves', 'Core'
] as const;
const EQUIPMENT = [
  'barbell', 'dumbbell', 'smith', 'cable', 'machine', 'ezbar', 'band', 'trapbar',
  'bodyweight', 'assisted', 'kettlebell'
] as const;
const TRAINING_TYPES = ['progressive_overload', 'strength', 'hit', 'endurance', 'general'] as const;

const MAX_TEXT_CHARS = 8000;

export interface ParsePlanEnv {
  ANTHROPIC_API_KEY: string;
  SESSION_SECRET?: string;
  USAGE?: KVNamespace;
  REQUIRE_ALLOWLIST?: string;
  DB?: D1Database;
}

interface ParsePlanBody {
  text?: string;
  catalog?: { muscle: string; names: string[] }[];
}

const EXTRACT_TOOL: Anthropic.Tool = {
  name: 'extract_plan',
  description:
    'Convert the user-pasted workout plan into structured training days. Always call this exactly once.',
  input_schema: {
    type: 'object',
    properties: {
      program_name: { type: 'string', description: 'A short name for the plan (use one from the text if given, else invent a fitting one).' },
      training_type: {
        type: 'string',
        enum: TRAINING_TYPES as unknown as string[],
        description:
          'The overall rep/volume style: progressive_overload = standard hypertrophy; strength = low reps near max; ' +
          'hit = "Low Volume / High Effort", fewer sets taken at or near failure; endurance = higher reps; general = balanced. ' +
          'Infer from the text; default progressive_overload.'
      },
      days: {
        type: 'array',
        description: 'One entry per training day in the plan, in order.',
        items: {
          type: 'object',
          properties: {
            label: { type: 'string', description: 'The day\'s name, e.g. "Push", "Upper A", "Leg Day".' },
            exercises: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  name: {
                    type: 'string',
                    description:
                      'The exercise name. If it matches one in the provided catalog, use that EXACT catalog name so it ' +
                      'links to the app library; otherwise use the name as written.'
                  },
                  muscle: { type: 'string', enum: MUSCLES as unknown as string[], description: 'Primary muscle worked.' },
                  equipment: { type: 'string', enum: EQUIPMENT as unknown as string[], description: 'Main equipment used.' },
                  sets: { type: 'integer', minimum: 1, maximum: 8, description: 'Working sets (default 3 if unstated).' },
                  reps: { type: 'integer', minimum: 1, maximum: 100, description: 'Target reps per set (default 10 if unstated).' }
                },
                required: ['name', 'muscle', 'equipment']
              }
            }
          },
          required: ['label', 'exercises']
        }
      }
    },
    required: ['days']
  }
};

const SYSTEM = `You convert a pasted workout plan into structured training days for Alpha Lifts, a
strength-training app. Read the text and extract each training day and its exercises with sets and
reps. Preserve the day order and the exercise order within each day.

You are given a catalog of the app's real exercise names grouped by muscle. When an exercise in the
text clearly matches a catalog entry (allowing for wording differences, e.g. "BB Bench" = "Bench
Press"), use that EXACT catalog name so it links to the library. When it doesn't match anything in
the catalog, keep the name as written and give your best-judgement muscle and equipment for it.

Only include actual training days with exercises. Ignore rest days, notes, warmups written as prose,
and anything that isn't a liftable exercise with sets/reps. If sets or reps aren't stated, use
sensible defaults (3 sets, 10 reps). Call extract_plan exactly once.`;

function describe(body: ParsePlanBody): string {
  let catalog = '';
  if (body.catalog?.length) {
    const lines = body.catalog.map(g => `- ${g.muscle}: ${g.names.join(', ')}`).join('\n');
    catalog = `\n\nExercise catalog (prefer these EXACT names when an exercise matches):\n${lines}`;
  }
  const text = (body.text || '').slice(0, MAX_TEXT_CHARS);
  return `Convert this pasted workout plan into structured days:\n\n"""\n${text}\n"""${catalog}`;
}

export async function handleParsePlan(request: Request, env: ParsePlanEnv, cors: Record<string, string>): Promise<Response> {
  if (!env.ANTHROPIC_API_KEY) return json({ error: 'not_configured' }, 503, cors);

  // Identity from the token, never the body — same discipline as onboard/coach. Also honour
  // per-user revocation (token_version) when the DB is bound.
  const session = env.SESSION_SECRET ? await authenticate(request, env.SESSION_SECRET) : null;
  if (!session) return json({ error: 'unauthorized' }, 401, cors);
  if (env.DB) {
    const user = await findUserById(env.DB, session.sub);
    if (!user || userTokenVersion(user) !== sessionTokenVersion(session)) {
      return json({ error: 'unauthorized' }, 401, cors);
    }
  }
  const userId = session.sub;

  // Premium gate — this is the Pro feature, unlike the free onboarding route. Identity here is
  // always session-verified (401 above), so the D1 subscription branch may be consulted.
  if (!(await isEntitled(env, userId, { viaSession: true }))) return json({ error: 'not_entitled' }, 403, cors);

  const read = await readJsonCapped<ParsePlanBody>(request, MAX_AI_BODY_BYTES);
  if (!read.ok) {
    return read.reason === 'too_large'
      ? json({ error: 'body_too_large' }, 413, cors)
      : json({ error: 'invalid_json' }, 400, cors);
  }
  const body: ParsePlanBody = {
    text: typeof read.value?.text === 'string' ? read.value.text : undefined,
    catalog: sanitizeCatalog(read.value?.catalog)
  };
  if (!body.text || !body.text.trim()) return json({ error: 'empty' }, 400, cors);

  // Same monthly spend cap as the coach — this was the one AI route that recorded spend but
  // never enforced the limit, at the highest max_tokens in the Worker.
  const budget = await checkBudget(env, userId);
  if (!budget.allowed) {
    return json({ error: 'budget_exhausted', spent: budget.spent, limit: budget.limit }, 402, cors);
  }
  await recordSpend(env, userId, PARSE_RESERVE_MICRO_USD);

  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  let response: Anthropic.Message;
  try {
    response = await client.messages.create({
      // A full week of ~40 exercises, each an object with name/muscle/equipment/sets/reps, is a
      // lot of structured output — 1500 truncated the tool JSON mid-array on real plans, which
      // arrives as invalid/partial input and reads to the user as "couldn't parse it". Only the
      // tokens actually emitted are billed, so a high ceiling costs nothing on small plans.
      max_tokens: 8000,
      model: MODEL,
      system: SYSTEM,
      tools: [EXTRACT_TOOL],
      tool_choice: { type: 'tool', name: 'extract_plan' },
      messages: [{ role: 'user', content: describe(body) }]
    });
  } catch (err) {
    await recordSpend(env, userId, -PARSE_RESERVE_MICRO_USD); // refund the reservation
    if (err instanceof Anthropic.APIError) {
      console.error('ParsePlan API error', err.status, err.message);
      return json({ error: 'upstream_error' }, 502, cors);
    }
    console.error('ParsePlan unexpected error', err);
    return json({ error: 'internal_error' }, 500, cors);
  }

  await recordSpend(env, userId, costMicroUsd(MODEL, response.usage) - PARSE_RESERVE_MICRO_USD);

  const toolUse = response.content.find(
    (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use' && b.name === 'extract_plan'
  );
  const input = toolUse?.input as
    | { program_name?: string; training_type?: string; days?: unknown }
    | undefined;

  if (!input || !Array.isArray(input.days) || input.days.length === 0) {
    // A hit token ceiling means the JSON was cut off, which parses to partial/empty input — tell
    // the client that specifically so it can suggest splitting the plan rather than "try again".
    if (response.stop_reason === 'max_tokens') return json({ error: 'too_long' }, 502, cors);
    return json({ error: 'bad_plan' }, 502, cors);
  }

  // Return the raw structured plan; the client resolves exercise names to library ids, creates
  // custom exercises for unmatched ones, and stages the whole thing behind a confirm.
  return json(
    {
      program_name: typeof input.program_name === 'string' ? input.program_name.slice(0, 80) : null,
      training_type: input.training_type,
      days: input.days
    },
    200,
    cors
  );
}
