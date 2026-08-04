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
import { authenticate } from './auth';
import { json } from './http';
import { costMicroUsd, recordSpend } from './usage';

const MODEL = 'claude-opus-4-8';

// Kept in sync with the client's SPLIT_PRESETS ids (src/data/wizard.ts) and TrainingType — same
// enums the coach's propose_build_program tool uses.
const SPLIT_IDS = ['ppl6', 'upper_lower', 'full_body', 'bro_split', 'ppl_rest', 'ppl_ul_hybrid'] as const;
const TRAINING_TYPES = ['progressive_overload', 'strength', 'hit', 'endurance', 'general'] as const;

export interface OnboardEnv {
  ANTHROPIC_API_KEY: string;
  SESSION_SECRET?: string;
  USAGE?: KVNamespace;
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

  // Must be a real signed-in account (identity from the token, never the body).
  const session = env.SESSION_SECRET ? await authenticate(request, env.SESSION_SECRET) : null;
  if (!session) return json({ error: 'unauthorized' }, 401, cors);
  const userId = session.sub;

  // One AI onboarding per account. The flag has no expiry — onboarding is genuinely once-per-account
  // (the client also skips this route entirely once the account's synced state says onboarded).
  const kv = env.USAGE;
  const onboardedKey = `onboarded:${userId}`;
  if (kv && (await kv.get(onboardedKey))) {
    return json({ error: 'already_onboarded' }, 409, cors);
  }

  let answers: OnboardAnswers;
  try {
    answers = (await request.json()) as OnboardAnswers;
  } catch {
    return json({ error: 'invalid_json' }, 400, cors);
  }

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
    if (err instanceof Anthropic.APIError) {
      console.error('Onboard API error', err.status, err.message);
      return json({ error: 'upstream_error' }, 502, cors);
    }
    console.error('Onboard unexpected error', err);
    return json({ error: 'internal_error' }, 500, cors);
  }

  await recordSpend(env, userId, costMicroUsd(MODEL, response.usage));

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
    // Malformed — let the client fall back to its deterministic mapping rather than shipping junk.
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

  // Mark done only after a valid plan, so a failed attempt doesn't burn the account's one shot.
  if (kv) await kv.put(onboardedKey, '1');

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
