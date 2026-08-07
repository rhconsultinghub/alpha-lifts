/**
 * One-time AI onboarding. A brand-new account POSTs its onboarding answers here; the Worker makes
 * a single Anthropic call that (a) picks the best-fit split + training style from the answers and
 * (b) writes a warm, personal welcome message including light, goal-appropriate nutrition guidance.
 *
 * Deliberately its own endpoint rather than the coach route because it is:
 *  - **Free and un-gated by entitlement.** It's the first-run experience — a brand-new account has
 *    no subscription yet — so it must run before the paywall. Abuse is bounded by requiring a valid
 *    session (a real signed-up account) AND a one-per-account KV flag: each account gets exactly one
 *    onboarding generation, and account creation is the throttle.
 *  - **Structured.** The plan must be a valid split/training-type the client can build, so output is
 *    forced through a single tool call with enum-constrained fields; the welcome rides along in the
 *    tool input (a forced tool call suppresses free text).
 *
 * The client always has a deterministic fallback (map answers → split locally), so if this call
 * fails, is offline, or the account already onboarded, onboarding still completes — just without the
 * AI-written copy.
 */

import Anthropic from '@anthropic-ai/sdk';
import { authenticate, sessionTokenVersion } from './auth';
import { findUserById, userTokenVersion } from './db';
import { json } from './http';
import { checkBudget, costMicroUsd, recordSpend, MODEL } from './usage';
import { SPLIT_IDS, TRAINING_TYPES } from './tools';
import { capNum, capStr, readJsonCapped, sanitizeCatalog, MAX_AI_BODY_BYTES } from './guard';


/** Pre-charged cost estimate, settled to the real cost after the call (see usage.ts). */
const ONBOARD_RESERVE_MICRO_USD = 30_000; // $0.03

// Kept in sync with the client's SPLIT_PRESETS ids (src/data/wizard.ts) and TrainingType — same
// enums the coach's propose_build_program tool uses.

export interface OnboardEnv {
  ANTHROPIC_API_KEY: string;
  SESSION_SECRET?: string;
  USAGE?: KVNamespace;
  DB?: D1Database;
}

interface OnboardAnswers {
  name?: string;
  experience?: string; // beginner | intermediate | advanced
  goal?: string; // muscle | strength | general | endurance
  days?: number; // 3..6
  equipment?: string; // full_gym | home_basic | minimal
  diet?: string; // build | lean | maintain | unsure
  units?: string; // kg | lb
  gym?: string; // free-text gym/franchise name, e.g. "Planet Fitness" (optional)
  // Exercise catalog (names grouped by muscle) so the model can name real exercises for gym swaps.
  catalog?: { muscle: string; names: string[] }[];
}

const ONBOARD_TOOL: Anthropic.Tool = {
  name: 'create_onboarding_plan',
  description:
    "Create the new user's starting training program and a personal welcome message, tailored to " +
    'their onboarding answers. Always call this exactly once.',
  input_schema: {
    type: 'object',
    properties: {
      split: {
        type: 'string',
        enum: SPLIT_IDS as unknown as string[],
        description:
          'The weekly split, chosen to fit their available days and experience: ' +
          'ppl6 = 6-day Push/Pull/Legs; upper_lower = 4-day Upper/Lower; full_body = 3-day full body; ' +
          'bro_split = 5-day one-muscle-per-day; ppl_rest = 3-day PPL with rest between; ' +
          'ppl_ul_hybrid = 5-day PPL then Upper/Lower. Prefer full_body or upper_lower for beginners; ' +
          'match the day count to how many days they can train.'
      },
      training_type: {
        type: 'string',
        enum: TRAINING_TYPES as unknown as string[],
        description:
          'The rep/volume style, chosen from their goal and experience: ' +
          'progressive_overload = standard hypertrophy volume (best default for building muscle); ' +
          'strength = low reps near max; hit = "Low Volume / High Effort", fewer sets taken at or near failure ' +
          '(for someone short on time or who prefers hard, brief sessions — not for a beginner); ' +
          'endurance = higher reps, more volume; general = balanced maintenance.'
      },
      program_name: {
        type: 'string',
        description: 'A short, motivating program name personalised to them (e.g. "Alex — Upper/Lower Strength").'
      },
      exercise_swaps: {
        type: 'array',
        description:
          'Optional. ONLY when the user named a specific gym: a list of exercise substitutions that adapt the ' +
          "default plan to that gym's typical equipment. Each entry replaces a commonly-programmed movement with a " +
          'better-available alternative there (e.g. at a Planet-Fitness-style gym with no barbells/racks, swap ' +
          '"Barbell Bench Press" → "Machine Chest Press" and "Barbell Back Squat" → "Leg Press"). Use EXACT names ' +
          'from the exercise catalog for BOTH from and to. Omit or leave empty if no gym was given or no swaps are ' +
          'warranted (a well-equipped gym needs none).',
        items: {
          type: 'object',
          properties: {
            from: { type: 'string', description: 'Exact catalog name of the exercise to replace.' },
            to: { type: 'string', description: 'Exact catalog name of the gym-appropriate replacement.' }
          },
          required: ['from', 'to']
        }
      },
      welcome: {
        type: 'string',
        description:
          "A warm, personal welcome message, 2-3 short paragraphs of plain text (no markdown). Greet them by " +
          'name if given. Explain in plain language why this split and style suit what they told you (their ' +
          'experience, goal, days, and equipment). Include 2-3 sentences of practical, everyday nutrition ' +
          'guidance aligned to their eating goal — protein and overall intake in general terms. Keep it ' +
          'encouraging and specific to them, not generic. End on one motivating line about getting started.'
      }
    },
    required: ['split', 'training_type', 'welcome']
  }
};

const ONBOARD_SYSTEM = `You are the onboarding coach for Alpha Lifts, a mobile strength-training app.
A brand-new user has just answered a few setup questions. Your job is to build the starting training
plan that best fits them and to welcome them so the app feels made for them personally.

Choose the split and training style with real judgement about THIS person's answers — a beginner who
picked 6 days is better served by a 3-4 day full-body or upper/lower plan they can recover from than a
6-day bro split; match the day count to what they can actually train; factor in their equipment.

If they named a specific gym, use what that franchise TYPICALLY stocks to adapt the plan via
exercise_swaps: the default plans lean on common barbell, dumbbell, machine, and cable movements, so
propose swaps only where the gym's usual equipment differs (e.g. a Planet-Fitness-style gym has no
barbells, squat racks, or deadlift platforms — route around them with Smith machine, dumbbell, and
plate-loaded/selectorized machine alternatives; a well-stocked commercial or hardcore gym needs few or
no swaps). Only swap when you're reasonably confident about that gym's equipment; when unsure, leave it
alone rather than guess. Use EXACT names from the exercise catalog for both sides of every swap, and
mention the gym naturally in the welcome.

Write the welcome like a knowledgeable coach who just read their answers: warm, specific, and concise.
Reference what they told you. Explain your choices in plain language, not jargon.

Nutrition is in scope as everyday guidance tied to their goal — general advice on protein and calorie
intake for building muscle, leaning out, or maintaining. Do NOT give very-low-calorie plans, anything
eating-disorder-adjacent, or specific supplement doses; if their goal is aggressive fat loss, steer
toward a sensible, sustainable approach. This is general guidance, not medical or clinical advice.

Call the create_onboarding_plan tool exactly once with your choices and the welcome message.`;

/** Rebuild the client-supplied answers with hard caps on every field — they flow into the
 *  (billed) prompt, so nothing unbounded may pass (same reasoning as prompt.ts sanitizeContext). */
function sanitizeAnswers(raw: unknown): OnboardAnswers {
  if (!raw || typeof raw !== 'object') return {};
  const a = raw as Record<string, unknown>;
  return {
    name: capStr(a.name, 80),
    experience: capStr(a.experience, 40),
    goal: capStr(a.goal, 40),
    days: capNum(a.days, 1, 7),
    equipment: capStr(a.equipment, 40),
    diet: capStr(a.diet, 40),
    units: capStr(a.units, 10),
    gym: capStr(a.gym, 100),
    catalog: sanitizeCatalog(a.catalog)
  };
}

function describeAnswers(a: OnboardAnswers): string {
  const parts: string[] = [];
  parts.push(a.name ? `Name: ${a.name}` : 'Name: (not given)');
  if (a.experience) parts.push(`Experience: ${a.experience}`);
  if (a.goal) parts.push(`Primary goal: ${a.goal}`);
  if (a.days) parts.push(`Days per week they can train: ${a.days}`);
  if (a.equipment) parts.push(`Equipment / location: ${a.equipment}`);
  if (a.gym) parts.push(`Gym / franchise they train at: ${a.gym}`);
  if (a.diet) parts.push(`Eating goal: ${a.diet}`);
  if (a.units) parts.push(`Units: ${a.units}`);

  let catalog = '';
  if (a.catalog?.length) {
    const lines = a.catalog.map(g => `- ${g.muscle}: ${g.names.join(', ')}`).join('\n');
    catalog = `\n\nExercise catalog (use these EXACT names for any exercise_swaps):\n${lines}`;
  }
  return `Here are the new user's onboarding answers:\n\n${parts.join('\n')}${catalog}\n\nBuild their starting plan and welcome them.`;
}

export async function handleOnboard(request: Request, env: OnboardEnv, cors: Record<string, string>): Promise<Response> {
  if (!env.ANTHROPIC_API_KEY) return json({ error: 'not_configured' }, 503, cors);

  // Must be a real signed-in account (identity from the token, never the body). Also honour
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

  // One AI onboarding per account. The flag has no expiry — onboarding is genuinely once-per-account
  // (the client also skips this route entirely once the account's synced state says onboarded).
  //
  // The flag is CLAIMED here, before the API call — a read-at-the-top/write-at-the-bottom version
  // let N parallel requests from one account all pass the check and all bill an API call. Claiming
  // up front (and rolling back on failure below) closes that; KV's eventual consistency can still
  // let a tight race through, but it's one extra call, not N. If a crash lands between claim and
  // rollback the account loses its one AI shot — acceptable, since the client always has the
  // deterministic local fallback.
  const kv = env.USAGE;
  const onboardedKey = `onboarded:${userId}`;
  if (kv) {
    if (await kv.get(onboardedKey)) return json({ error: 'already_onboarded' }, 409, cors);
    await kv.put(onboardedKey, '1');
  }
  const rollbackClaim = async () => {
    if (kv) await kv.delete(onboardedKey).catch(() => {});
  };

  const read = await readJsonCapped<unknown>(request, MAX_AI_BODY_BYTES);
  if (!read.ok) {
    await rollbackClaim();
    return read.reason === 'too_large'
      ? json({ error: 'body_too_large' }, 413, cors)
      : json({ error: 'invalid_json' }, 400, cors);
  }
  const answers = sanitizeAnswers(read.value);

  // Same monthly spend cap as the coach — this route is free of the *entitlement* gate (it must
  // run before the paywall), but it was never meant to be free of the budget.
  const budget = await checkBudget(env, userId);
  if (!budget.allowed) {
    await rollbackClaim();
    return json({ error: 'budget_exhausted' }, 402, cors);
  }
  await recordSpend(env, userId, ONBOARD_RESERVE_MICRO_USD);

  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  let response: Anthropic.Message;
  try {
    response = await client.messages.create({
      model: MODEL,
      max_tokens: 900,
      system: ONBOARD_SYSTEM,
      tools: [ONBOARD_TOOL],
      // Force the single structured call so we always get a buildable plan + the welcome.
      tool_choice: { type: 'tool', name: 'create_onboarding_plan' },
      messages: [{ role: 'user', content: describeAnswers(answers) }]
    });
  } catch (err) {
    await recordSpend(env, userId, -ONBOARD_RESERVE_MICRO_USD);
    await rollbackClaim();
    if (err instanceof Anthropic.APIError) {
      console.error('Onboard API error', err.status, err.message);
      return json({ error: 'upstream_error' }, 502, cors);
    }
    console.error('Onboard unexpected error', err);
    return json({ error: 'internal_error' }, 500, cors);
  }

  await recordSpend(env, userId, costMicroUsd(MODEL, response.usage) - ONBOARD_RESERVE_MICRO_USD);

  const toolUse = response.content.find(
    (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use' && b.name === 'create_onboarding_plan'
  );
  const input = toolUse?.input as
    | { split?: string; training_type?: string; program_name?: string; welcome?: string; exercise_swaps?: unknown }
    | undefined;

  if (
    !input ||
    !SPLIT_IDS.includes(input.split as (typeof SPLIT_IDS)[number]) ||
    !TRAINING_TYPES.includes(input.training_type as (typeof TRAINING_TYPES)[number]) ||
    typeof input.welcome !== 'string'
  ) {
    // Malformed — let the client fall back to its deterministic mapping rather than shipping
    // junk, and release the claim so the account's one AI shot isn't burned on a bad response.
    await rollbackClaim();
    return json({ error: 'bad_plan' }, 502, cors);
  }

  // Sanitize swaps: keep only well-formed {from,to} string pairs, cap the count. The client
  // resolves these names against its real library and ignores any that don't match, so a bad
  // swap degrades to a no-op rather than a broken program.
  const swaps = Array.isArray(input.exercise_swaps)
    ? input.exercise_swaps
        .filter(
          (s): s is { from: string; to: string } =>
            !!s && typeof (s as { from?: unknown }).from === 'string' && typeof (s as { to?: unknown }).to === 'string'
        )
        .slice(0, 20)
        .map(s => ({ from: s.from.slice(0, 80), to: s.to.slice(0, 80) }))
    : [];

  // (The onboarded flag was already claimed before the API call; every failure path above rolled
  // it back, so reaching here means the claim correctly stands.)
  return json(
    {
      split: input.split,
      trainingType: input.training_type,
      name: typeof input.program_name === 'string' ? input.program_name.slice(0, 80) : null,
      welcome: input.welcome.slice(0, 4000),
      swaps
    },
    200,
    cors
  );
}
