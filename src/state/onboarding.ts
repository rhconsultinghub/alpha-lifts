/**
 * Client half of AI onboarding. Sends the new user's answers to the Worker's /onboard endpoint,
 * which returns a tailored split + training style + a personal welcome message. If that call can't
 * happen — accounts not configured, offline, the Worker errors, or the account already used its one
 * onboarding — this falls back to a deterministic mapping (answers → split/style) plus a warm
 * templated welcome, so onboarding ALWAYS completes and always ends on a personal note.
 *
 * The result feeds the existing wizard build path (buildProgramFromPreset) via finishOnboarding in
 * useApp — the AI only *chooses* the split/style, it never invents exercises, so every generated
 * plan is a real, valid program.
 */

import { COACH_API_URL, COACH_CONFIGURED, buildCatalog, resolveExerciseId } from './coach';
import { mkEx } from '../data/program';
import type { ProgramDays, TrainingType } from '../data/types';

export type Experience = 'beginner' | 'intermediate' | 'advanced';
export type Goal = 'muscle' | 'strength' | 'general' | 'endurance';
export type Equipment = 'full_gym' | 'home_basic' | 'minimal';
export type Diet = 'build' | 'lean' | 'maintain' | 'unsure';

/** A gym-tailored exercise substitution, by exercise name (resolved to ids when applied). */
export interface ExerciseSwap {
  from: string;
  to: string;
}

export interface OnboardingAnswers {
  name: string;
  experience: Experience;
  goal: Goal;
  days: number; // 3..6
  equipment: Equipment;
  diet: Diet;
  units: 'kg' | 'lb';
  /** Optional free-text gym/franchise name for equipment-aware tailoring. */
  gym?: string;
}

export interface OnboardingPlan {
  splitId: string;
  trainingType: TrainingType;
  /** Program name. */
  name: string;
  /** The personal welcome message shown on the reveal screen. */
  welcome: string;
  /** Gym-tailored exercise swaps to apply to the built program (empty for the fallback). */
  swaps: ExerciseSwap[];
  /** 'ai' when the Worker generated it, 'fallback' when built locally. */
  source: 'ai' | 'fallback';
}

function getAuthToken(): string | null {
  try {
    return localStorage.getItem('alpha-lifts-auth-token');
  } catch {
    return null;
  }
}

/**
 * Ask the Worker to generate a tailored plan + welcome. Falls back to a local plan on any failure
 * so the caller never has to handle an error — it always gets a usable OnboardingPlan.
 */
export async function generateOnboardingPlan(answers: OnboardingAnswers): Promise<OnboardingPlan> {
  const token = getAuthToken();
  if (COACH_CONFIGURED && token) {
    try {
      const res = await fetch(`${COACH_API_URL}/onboard`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        // The catalog lets the AI name real exercises for gym-appropriate swaps.
        body: JSON.stringify({ ...answers, catalog: answers.gym ? buildCatalog() : undefined })
      });
      if (res.ok) {
        const data = (await res.json()) as {
          split?: string;
          trainingType?: string;
          name?: string | null;
          welcome?: string;
          swaps?: ExerciseSwap[];
        };
        if (data.split && data.trainingType && data.welcome) {
          return {
            splitId: data.split,
            trainingType: data.trainingType as TrainingType,
            name: (data.name && data.name.trim()) || defaultProgramName(answers),
            welcome: data.welcome,
            swaps: Array.isArray(data.swaps) ? data.swaps : [],
            source: 'ai'
          };
        }
      }
      // Non-OK (already_onboarded, bad_plan, upstream_error, …) → fall through to the local plan.
    } catch {
      // network/offline → fall through
    }
  }
  return fallbackPlan(answers);
}

// --- deterministic fallback -----------------------------------------------------------------

/** Map answers → split id, mirroring the reasoning the AI is told to use: match the day count, but
 *  keep beginners on recoverable full-body/upper-lower even if they picked a lot of days. */
function fallbackSplit(answers: OnboardingAnswers): string {
  const { days, experience } = answers;
  if (experience === 'beginner') return days <= 3 ? 'full_body' : 'upper_lower';
  if (days <= 3) return 'full_body';
  if (days === 4) return 'upper_lower';
  if (days === 5) return 'ppl_ul_hybrid';
  return 'ppl6';
}

function fallbackTrainingType(goal: Goal): TrainingType {
  switch (goal) {
    case 'strength':
      return 'strength';
    case 'endurance':
      return 'endurance';
    case 'general':
      return 'general';
    case 'muscle':
    default:
      return 'progressive_overload';
  }
}

/** "Ryan's Program" — also what loadInitial() reads back to recover a userName for accounts
 *  onboarded before that field existed, so keep the possessive shape if this changes. */
export function defaultProgramName(answers: Pick<OnboardingAnswers, 'name'>): string {
  const first = answers.name.trim().split(/\s+/)[0];
  return first ? `${first}'s Program` : 'My Program';
}

const GOAL_LABEL: Record<Goal, string> = {
  muscle: 'building muscle',
  strength: 'getting stronger',
  general: 'overall fitness',
  endurance: 'building endurance'
};

const SPLIT_LABEL: Record<string, string> = {
  ppl6: 'a 6-day Push/Pull/Legs split',
  upper_lower: 'a 4-day Upper/Lower split',
  full_body: 'a 3-day full-body plan',
  bro_split: 'a 5-day body-part split',
  ppl_rest: 'a 3-day Push/Pull/Legs plan with rest between',
  ppl_ul_hybrid: 'a 5-day PPL + Upper/Lower hybrid'
};

const DIET_TIP: Record<Diet, string> = {
  build:
    'Since you’re eating to build, aim for a small daily surplus and roughly 1.6–2.2 g of protein per kg of bodyweight — that’s the biggest lever for turning training into muscle.',
  lean:
    'To lean out, keep protein high (around 1.6–2.2 g per kg of bodyweight) in a modest calorie deficit — that protects your hard-earned muscle while the fat comes off. Steady beats drastic.',
  maintain:
    'To maintain, eat around your usual intake and keep protein steady (about 1.6–2.2 g per kg of bodyweight) so you keep building even without chasing the scale.',
  unsure:
    'On nutrition, the simplest place to start is protein — around 1.6–2.2 g per kg of bodyweight a day — and eating roughly at maintenance while you find your rhythm.'
};

/** A warm, non-AI welcome so the fallback still feels personal. */
function fallbackWelcome(answers: OnboardingAnswers, splitId: string): string {
  const first = answers.name.trim().split(/\s+/)[0];
  const hello = first ? `Welcome, ${first}!` : 'Welcome!';
  const split = SPLIT_LABEL[splitId] ?? 'your plan';
  const goal = GOAL_LABEL[answers.goal] ?? 'your goals';
  const p1 = `${hello} Your plan is ready. Based on training ${answers.days} days a week with a focus on ${goal}, we set you up with ${split} — enough frequency to make real progress without more than you can recover from.`;
  const p2 = DIET_TIP[answers.diet];
  const p3 = 'Everything here is yours to adjust anytime, and your AI coach can tweak the plan whenever you ask. Let’s get after it. 💪';
  return `${p1}\n\n${p2}\n\n${p3}`;
}

/**
 * Apply gym-tailored swaps to a freshly built program (mutates `days`). Each swap's `from`/`to`
 * names are resolved against the real exercise library; a swap is applied wherever its resolved
 * `from` id appears across the week. Anything that doesn't resolve, or whose `from` isn't in the
 * program, is skipped — so a hallucinated or irrelevant swap degrades to a no-op rather than
 * corrupting the plan. Swapped entries are rebuilt with `mkEx` (equipIdx reset to 0, valid for any
 * exercise) preserving the original set count.
 */
export function applyExerciseSwaps(days: ProgramDays, swaps: ExerciseSwap[]): void {
  for (const swap of swaps) {
    const fromId = resolveExerciseId(swap.from);
    const toId = resolveExerciseId(swap.to);
    if (!fromId || !toId || fromId === toId) continue;
    for (const key of Object.keys(days)) {
      const day = days[key];
      if (!day.exercises) continue;
      day.exercises = day.exercises.map(ex => (ex.id === fromId ? mkEx(toId, ex.sets, 0, ex.last) : ex));
    }
  }
}

function fallbackPlan(answers: OnboardingAnswers): OnboardingPlan {
  const splitId = fallbackSplit(answers);
  return {
    splitId,
    trainingType: fallbackTrainingType(answers.goal),
    name: defaultProgramName(answers),
    welcome: fallbackWelcome(answers, splitId),
    // No AI = no gym-tailored swaps; the deterministic preset stands as-is.
    swaps: [],
    source: 'fallback'
  };
}
