/**
 * Tool definitions for the AI coach.
 *
 * These are all "propose" tools, and that word is load-bearing: calling one does NOT mutate the
 * user's data. The Worker treats a tool call as a *terminal* result — it does not send a
 * tool_result back for another round trip. The tool's input is forwarded to the client as a
 * proposal, the client renders a confirm card, and the real mutation only runs locally when the
 * user taps Apply. See worker/src/index.ts (single-turn, no agentic loop) and the client's
 * askCoach()/applyCoachProposal().
 *
 * Consequences of that design worth keeping in mind:
 * - The Worker never needs the exercise library or app state; it only relays intent.
 * - Cost stays close to the read-only coach's, since there's no second billed API call to
 *   resolve a tool_result. The propose call IS the answer.
 * - Exercises and days are referenced by their human names (exactly as they appear in the
 *   context the client sends), not machine ids — the client resolves names to ids/day-keys with
 *   the same normalized-name lookup the rest of the app uses. An unresolvable name just yields a
 *   "couldn't find that" card rather than a wrong mutation.
 */

import type Anthropic from '@anthropic-ai/sdk';

// Kept in sync with the client's SPLIT_PRESETS ids (src/data/wizard.ts) and TrainingType.
const SPLIT_IDS = ['ppl6', 'upper_lower', 'full_body', 'bro_split', 'ppl_rest', 'ppl_ul_hybrid'] as const;
const TRAINING_TYPES = ['progressive_overload', 'strength', 'hit', 'endurance', 'general'] as const;
const SCREENS = ['program', 'progress', 'exercises', 'achievements'] as const;

export const COACH_TOOLS: Anthropic.Tool[] = [
  {
    name: 'propose_add_exercise',
    description:
      "Propose adding an exercise to one of the user's program days. Use when the user asks to add a lift. " +
      'Reference the day by its exact name from the weekly split, and the exercise by its exact name from the exercise catalog above.',
    input_schema: {
      type: 'object',
      properties: {
        day: { type: 'string', description: 'The exact day name from the weekly split, e.g. "Monday — Push Day".' },
        exercise: { type: 'string', description: 'The exact exercise name from the catalog, e.g. "Incline DB Press".' },
        sets: { type: 'integer', description: 'Working sets (1-8). Optional; defaults to 3.', minimum: 1, maximum: 8 },
        reps: { type: 'integer', description: 'Target reps. Optional; defaults to the exercise\'s programmed range.' }
      },
      required: ['day', 'exercise']
    }
  },
  {
    name: 'propose_swap_exercise',
    description:
      'Propose replacing one exercise on a program day with another. Use when the user wants to substitute a lift.',
    input_schema: {
      type: 'object',
      properties: {
        day: { type: 'string', description: 'The exact day name from the weekly split.' },
        from_exercise: { type: 'string', description: 'The exact name of the exercise currently on that day to replace.' },
        to_exercise: { type: 'string', description: 'The exact name of the replacement exercise from the catalog.' }
      },
      required: ['day', 'from_exercise', 'to_exercise']
    }
  },
  {
    name: 'propose_remove_exercise',
    description: 'Propose removing an exercise from a program day.',
    input_schema: {
      type: 'object',
      properties: {
        day: { type: 'string', description: 'The exact day name from the weekly split.' },
        exercise: { type: 'string', description: 'The exact name of the exercise to remove.' }
      },
      required: ['day', 'exercise']
    }
  },
  {
    name: 'propose_set_exercise_params',
    description:
      'Propose changing the working sets and/or reps for an exercise already on a program day. ' +
      'Do not use this to add a new exercise — use propose_add_exercise for that.',
    input_schema: {
      type: 'object',
      properties: {
        day: { type: 'string', description: 'The exact day name from the weekly split.' },
        exercise: { type: 'string', description: 'The exact name of the exercise to adjust.' },
        sets: { type: 'integer', description: 'New working set count (1-8). Optional.', minimum: 1, maximum: 8 },
        reps: { type: 'integer', description: 'New target reps. Optional.' }
      },
      required: ['day', 'exercise']
    }
  },
  {
    name: 'propose_build_program',
    description:
      'Propose building a brand-new training program from scratch using the app\'s program wizard. ' +
      'This replaces the current active program with a new one (the old one is kept in saved programs). ' +
      'Use when the user asks for a whole new plan, split, or routine. Pick the split and training style that best match what they describe.',
    input_schema: {
      type: 'object',
      properties: {
        split: {
          type: 'string',
          enum: SPLIT_IDS as unknown as string[],
          description:
            'ppl6 = 6-day Push/Pull/Legs; upper_lower = 4-day Upper/Lower; full_body = 3-day full body; ' +
            'bro_split = 5-day one-muscle-per-day; ppl_rest = 3-day PPL with rest between; ppl_ul_hybrid = 5-day PPL then Upper/Lower.'
        },
        training_type: {
          type: 'string',
          enum: TRAINING_TYPES as unknown as string[],
          description:
            'progressive_overload = standard hypertrophy volume; strength = low reps near max; hit = every set to failure, low volume; ' +
            'endurance = higher reps, more volume; general = maintenance.'
        },
        name: { type: 'string', description: 'A short program name. Optional; defaults to a name based on the split.' }
      },
      required: ['split', 'training_type']
    }
  },
  {
    name: 'propose_log_bodyweight',
    description: "Propose logging a bodyweight entry for today. The value is in the user's current display units.",
    input_schema: {
      type: 'object',
      properties: {
        value: { type: 'number', description: "Bodyweight in the user's display units (kg or lb, per the context).", exclusiveMinimum: 0 }
      },
      required: ['value']
    }
  },
  {
    name: 'propose_navigate',
    description:
      'Propose taking the user to a screen or a specific program day in the app. Use when the user asks to open, go to, or see part of the app.',
    input_schema: {
      type: 'object',
      properties: {
        screen: {
          type: 'string',
          enum: SCREENS as unknown as string[],
          description: 'program = today/weekly overview; progress = charts & stats; exercises = exercise library; achievements = badges.'
        },
        day: { type: 'string', description: 'Alternatively, the exact name of a program day to open its Day View. Provide either screen or day, not both.' }
      }
    }
  }
];
