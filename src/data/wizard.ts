import { EXLIB, MUSCLE_TARGETS, TRAINING_MULT, planRepDefault } from './exercises';
import { mkEx, clamp } from './program';
import type { Muscle, ProgramDays, ProgramExercise, TrainingType, WizardCustomDay } from './types';

export type WizardPrefill = 'recommended' | 'scratch';

export const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export const DAY_TYPE_LABELS: Record<string, string> = {
  push: 'Push Day', pull: 'Pull Day', legs: 'Leg Day', upper: 'Upper Day', lower: 'Lower Day',
  full_body: 'Full Body Day', chest: 'Chest Day', back: 'Back Day', shoulders: 'Shoulder Day', arms: 'Arm Day', rest: 'Rest Day'
};

export const DAY_TYPE_THEME: Record<string, Muscle[]> = {
  push: ['Chest', 'Shoulders', 'Triceps'], pull: ['Back', 'Biceps', 'Rear Delts', 'Core'],
  legs: ['Quads', 'Hamstrings', 'Glutes', 'Calves', 'Core'], upper: ['Chest', 'Back', 'Shoulders', 'Biceps', 'Triceps', 'Rear Delts', 'Core'],
  lower: ['Quads', 'Hamstrings', 'Glutes', 'Calves', 'Core'], full_body: Object.keys(MUSCLE_TARGETS) as Muscle[],
  chest: ['Chest', 'Triceps'], back: ['Back', 'Biceps'], shoulders: ['Shoulders', 'Rear Delts'], arms: ['Biceps', 'Triceps'], rest: []
};

// every day type's exercise list is chosen so its full theme (see DAY_TYPE_THEME above) gets at
// least one exercise — otherwise a split built entirely from a subset of these day types (e.g.
// Upper/Lower, which never uses "legs" or "pull") can leave a muscle permanently at 0%.
export const DAY_TYPE_EXERCISES: Record<string, string[]> = {
  push: ['bench_press', 'overhead_press', 'incline_db_press', 'triceps_pushdown', 'lateral_raise'],
  pull: ['deadlift', 'lat_pulldown', 'seated_row', 'barbell_curl', 'face_pull', 'plank'],
  legs: ['back_squat', 'leg_curl', 'leg_press', 'hip_thrust', 'calf_raise', 'plank'],
  upper: ['pullup', 'db_shoulder_press', 'cable_fly', 'hammer_curl', 'triceps_pushdown', 'face_pull'],
  lower: ['rdl', 'leg_press', 'hip_thrust', 'calf_raise', 'plank'],
  // full_body's theme is every muscle (see DAY_TYPE_THEME.full_body below), so — unlike the other
  // day types, which only need to cover a 2-5 muscle theme — this list needs one exercise per
  // muscle in MUSCLE_TARGETS or four of them silently sit at 0% volume forever (Biceps, Rear
  // Delts, Triceps, Glutes had no primary-muscle exercise here previously). Isolation moves with
  // short rest are used for the added slots to keep the session from ballooning in length.
  full_body: ['back_squat', 'bench_press', 'seated_row', 'overhead_press', 'leg_curl', 'hip_thrust', 'hammer_curl', 'triceps_pushdown', 'face_pull', 'calf_raise', 'plank'],
  chest: ['bench_press', 'incline_db_press', 'cable_fly', 'dip', 'triceps_pushdown'],
  back: ['deadlift', 'lat_pulldown', 'seated_row', 'barbell_curl'],
  shoulders: ['overhead_press', 'lateral_raise', 'rear_delt_fly', 'front_raise'],
  arms: ['barbell_curl', 'hammer_curl', 'triceps_pushdown', 'skull_crusher'],
  rest: []
};

export interface SplitPreset {
  id: string;
  label: string;
  desc: string;
  days: { type: string }[];
}

export const SPLIT_PRESETS: SplitPreset[] = [
  { id: 'ppl6', label: 'Push / Pull / Legs', desc: '6 training days, 1 rest — classic high-frequency PPL.',
    days: [{ type: 'push' }, { type: 'pull' }, { type: 'legs' }, { type: 'push' }, { type: 'pull' }, { type: 'legs' }, { type: 'rest' }] },
  { id: 'upper_lower', label: 'Upper / Lower', desc: '4 training days, 3 rest — balanced upper/lower frequency.',
    days: [{ type: 'upper' }, { type: 'lower' }, { type: 'rest' }, { type: 'upper' }, { type: 'lower' }, { type: 'rest' }, { type: 'rest' }] },
  { id: 'full_body', label: 'Full Body', desc: '3 training days, 4 rest — efficient full-body frequency.',
    days: [{ type: 'full_body' }, { type: 'rest' }, { type: 'full_body' }, { type: 'rest' }, { type: 'full_body' }, { type: 'rest' }, { type: 'rest' }] },
  { id: 'bro_split', label: 'Body-Part Split', desc: '5 training days, 2 rest — one muscle group per day.',
    days: [{ type: 'chest' }, { type: 'back' }, { type: 'legs' }, { type: 'shoulders' }, { type: 'arms' }, { type: 'rest' }, { type: 'rest' }] },
  { id: 'ppl_rest', label: 'PPL with Rest Between', desc: '3 training days, 4 rest — full recovery between each session.',
    days: [{ type: 'push' }, { type: 'rest' }, { type: 'pull' }, { type: 'rest' }, { type: 'legs' }, { type: 'rest' }, { type: 'rest' }] },
  { id: 'ppl_ul_hybrid', label: 'PPL + Upper/Lower Hybrid', desc: '5 training days, 2 rest — push/pull/legs then upper/lower.',
    days: [{ type: 'push' }, { type: 'pull' }, { type: 'legs' }, { type: 'rest' }, { type: 'upper' }, { type: 'lower' }, { type: 'rest' }] }
];

// All exercise ids that appear anywhere in DAY_TYPE_EXERCISES, grouped by muscle — the vetted
// base pool used by dedupeWeekExerciseIds() below to substitute a same-muscle alternate for a
// repeated exercise, rather than introducing an entirely new, unvetted pick.
const POOL_BY_MUSCLE: Record<string, string[]> = {};
Object.values(DAY_TYPE_EXERCISES).forEach(ids => {
  ids.forEach(id => {
    const m = EXLIB[id].muscle;
    if (!POOL_BY_MUSCLE[m]) POOL_BY_MUSCLE[m] = [];
    if (!POOL_BY_MUSCLE[m].includes(id)) POOL_BY_MUSCLE[m].push(id);
  });
});
// A handful of muscles only have one or two exercises across all of DAY_TYPE_EXERCISES combined
// (e.g. Core is only ever represented by 'plank'), which isn't enough alternates to de-duplicate
// splits where that muscle is trained 3-4x in one week (full_body x3, ppl6's pull+legs both
// touching Core, etc). These extend the substitution pool for exactly those muscles with other
// solid, well-known exercises from the wider library — Rear Delts is left alone since face_pull
// and rear_delt_fly are the *only* two Rear-Delts-primary exercises in the entire library, so a
// third occurrence in the same week has no possible alternate and will legitimately repeat.
const EXTRA_POOL_MUSCLES: Partial<Record<string, string[]>> = {
  Core: ['hanging_leg_raise', 'cable_crunch', 'ab_wheel_rollout'],
  Calves: ['seated_calf_raise', 'calf_press'],
  Glutes: ['glute_bridge', 'single_leg_glute_bridge'],
  Quads: ['front_squat', 'leg_extension'],
  Hamstrings: ['back_extension'],
  Biceps: ['incline_curl'],
  Triceps: ['overhead_triceps_ext'],
  // "pull" alone has 3 Back slots (deadlift/lat_pulldown/seated_row) and occurs twice in the PPL6
  // split, so 6 distinct Back picks are needed in that one week — the base pool only has 4.
  Back: ['barbell_row', 'chinup']
};
Object.entries(EXTRA_POOL_MUSCLES).forEach(([m, ids]) => {
  (POOL_BY_MUSCLE[m] = POOL_BY_MUSCLE[m] || []).push(...(ids || []).filter(id => !POOL_BY_MUSCLE[m].includes(id)));
});

// Walks a week's day types in order and returns each day's exercise id list with same-muscle
// substitutions applied wherever an id would otherwise repeat within the week — so e.g. a 6-day
// PPL split's two Push days no longer land on the exact same five exercises, and a hybrid split
// mixing day types (e.g. push + upper, both of which include triceps_pushdown) doesn't repeat an
// exercise across two different-themed days either. Substitutions always come from
// POOL_BY_MUSCLE for the *same* muscle the original exercise targeted, so day themes and the
// per-muscle set-count balancing above are unaffected — only which specific exercise fills a
// slot changes. Tracks used-this-day separately from used-across-week so that substituting one
// colliding slot can never collide with a *different* slot still to come later in the same day
// (a day type can have more than one exercise for the same muscle, e.g. "arms" has two Biceps
// slots — swapping the first for the pool's other Biceps pick must not leave the second slot,
// which was already that same pick, duplicated within that single day). Falls back to the
// original id if every same-muscle alternate is already spoken for (can happen for a muscle with
// very few library exercises, like Rear Delts), so a slot is never left without an exercise.
function dedupeWeekExerciseIds(weekDayTypes: string[]): string[][] {
  const usedAcrossWeek = new Set<string>();
  return weekDayTypes.map(type => {
    const ids = DAY_TYPE_EXERCISES[type] || [];
    const usedThisDay = new Set<string>();
    return ids.map(id => {
      if (!usedAcrossWeek.has(id) && !usedThisDay.has(id)) {
        usedAcrossWeek.add(id); usedThisDay.add(id);
        return id;
      }
      const m = EXLIB[id].muscle;
      const alt = (POOL_BY_MUSCLE[m] || []).find(cand => !usedAcrossWeek.has(cand) && !usedThisDay.has(cand));
      const chosen = alt || id;
      usedAcrossWeek.add(chosen); usedThisDay.add(chosen);
      return chosen;
    });
  });
}

// "recommended" prefill calibrates each exercise's set count so that, added up across every
// training day in the week that also hits the same primary muscle, the week lands close to
// that muscle's target volume for the chosen training type — rather than always defaulting to
// a flat 3 sets regardless of how many days/exercises are already hitting that muscle. The
// per-exercise split below is only a starting guess (rounding/clamping it to a sane per-exercise
// set count can drift the weekly sum away from target); balanceWeeklyVolume() below reconciles
// the whole week's actual totals against target afterward.
//
// exerciseIds is passed in already deduped for the week (see dedupeWeekExerciseIds) rather than
// read directly from DAY_TYPE_EXERCISES[type], but occurrencesThisWeek below still keys off
// DAY_TYPE_EXERCISES[dt] (the type's canonical muscle composition) since substitution never
// changes which muscle a slot targets, only which specific exercise fills it.
function generateRecommendedDayExercises(exerciseIds: string[], trainingType: TrainingType, weekDayTypes: string[]): ProgramExercise[] {
  const byMuscle: Record<string, string[]> = {};
  exerciseIds.forEach(id => { const m = EXLIB[id].muscle; (byMuscle[m] = byMuscle[m] || []).push(id); });
  const mult = TRAINING_MULT[trainingType];
  return exerciseIds.map(id => {
    const lib = EXLIB[id];
    const m = lib.muscle;
    const occurrencesThisWeek = weekDayTypes.filter(dt => (DAY_TYPE_EXERCISES[dt] || []).some(eid => EXLIB[eid].muscle === m)).length;
    const perOccurrenceTarget = (MUSCLE_TARGETS[m] * mult) / Math.max(1, occurrencesThisWeek);
    const setsPerExercise = clamp(Math.round(perOccurrenceTarget / byMuscle[m].length), 1, 6);
    return mkEx(id, setsPerExercise, 0, { weight: 0, reps: planRepDefault(trainingType, lib), hitTop: true });
  });
}

// MIN/MAX_SETS_PER_EXERCISE: sane per-exercise bounds so a correction never produces something
// silly like a 1-set or 12-set exercise, even when a muscle only has one dedicated exercise
// across the whole week (e.g. Calves on a once-a-week body-part split).
const MIN_SETS_PER_EXERCISE = 1;
const MAX_SETS_PER_EXERCISE = 8;
// acceptable band (relative to muscleStatus()'s 70%/120% "under"/"over" cutoffs in state/logic.ts)
// with a little inward margin so the result doesn't sit right at the edge of tipping "over"/"under"
// after later weight-based recalculation.
const BALANCE_LOW_PCT = 85;
const BALANCE_HIGH_PCT = 115;
// soft ceiling on a single day's estimated time (seconds) that the balancer won't push past when
// adding sets to fix an under-trained muscle — mirrors estimateDayTime()'s per-set cost
// (40s work + rest) at Standard pacing.
const MAX_DAY_TIME_SEC = 65 * 60;
// hard ceiling enforced regardless of source (initial generation or balancing) — a "recommended"
// default should never hand a new user something in the neighborhood of a 3-hour workout, even
// for demanding split/training-type combos (e.g. Full Body x Endurance) the balancer can't help.
const HARD_MAX_DAY_TIME_SEC = 90 * 60;

function estimateDaySetTimeSec(days: ProgramDays, dayKey: string): number {
  const day = days[dayKey];
  let sec = day.exercises.length * 30;
  day.exercises.forEach(ex => { sec += ex.sets * (40 + EXLIB[ex.id].restBase); });
  return sec;
}

// Last-resort trim: whatever generation + balancing produced, no single day is allowed to exceed
// HARD_MAX_DAY_TIME_SEC — trims sets from whichever exercise has the most, one at a time, until
// under the cap or every exercise is down to its floor.
function capDayTime(days: ProgramDays, dayOrder: string[]): void {
  dayOrder.forEach(dayKey => {
    const day = days[dayKey];
    if ((day.kind || 'training') === 'rest' || !day.exercises.length) return;
    for (let guard = 0; guard < 200 && estimateDaySetTimeSec(days, dayKey) > HARD_MAX_DAY_TIME_SEC; guard++) {
      const trimmable = day.exercises.filter(ex => ex.sets > MIN_SETS_PER_EXERCISE);
      if (!trimmable.length) break;
      trimmable.sort((a, b) => b.sets - a.sets);
      trimmable[0].sets -= 1;
    }
  });
}

// Reconciles each muscle's actual weekly total (summed across every training day/exercise that
// hits it) against its target, nudging individual exercises' set counts up or down. Needed
// because the per-exercise estimate above is computed in isolation per day and, once rounded and
// clamped, the week-wide sum routinely drifts well outside the target band (see the "everything
// above 100%" onboarding bug this was written to fix).
function balanceWeeklyVolume(days: ProgramDays, dayOrder: string[], trainingType: TrainingType): void {
  const mult = TRAINING_MULT[trainingType];
  const trainingDayKeys = dayOrder.filter(k => (days[k].kind || 'training') !== 'rest');
  (Object.keys(MUSCLE_TARGETS) as Muscle[]).forEach(m => {
    const target = MUSCLE_TARGETS[m] * mult;
    if (target <= 0) return;
    const slots: { dayKey: string; exIndex: number }[] = [];
    trainingDayKeys.forEach(dayKey => {
      days[dayKey].exercises.forEach((ex, exIndex) => { if (EXLIB[ex.id].muscle === m) slots.push({ dayKey, exIndex }); });
    });
    if (!slots.length) return;
    const setsOf = (s: { dayKey: string; exIndex: number }) => days[s.dayKey].exercises[s.exIndex].sets;
    const totalSets = () => slots.reduce((a, s) => a + setsOf(s), 0);
    for (let guard = 0; guard < 40; guard++) {
      const pct = (totalSets() / target) * 100;
      if (pct < BALANCE_LOW_PCT) {
        const candidates = slots.filter(s => setsOf(s) < MAX_SETS_PER_EXERCISE && estimateDaySetTimeSec(days, s.dayKey) < MAX_DAY_TIME_SEC);
        if (!candidates.length) break;
        candidates.sort((a, b) => setsOf(a) - setsOf(b));
        days[candidates[0].dayKey].exercises[candidates[0].exIndex].sets += 1;
      } else if (pct > BALANCE_HIGH_PCT) {
        const candidates = slots.filter(s => setsOf(s) > MIN_SETS_PER_EXERCISE);
        if (!candidates.length) break;
        candidates.sort((a, b) => setsOf(b) - setsOf(a));
        days[candidates[0].dayKey].exercises[candidates[0].exIndex].sets -= 1;
      } else break;
    }
  });
}

export function buildProgramFromPreset(preset: SplitPreset, trainingType: TrainingType, prefill: WizardPrefill = 'recommended'): { days: ProgramDays; dayOrder: string[] } {
  const days: ProgramDays = {}; const dayOrder: string[] = [];
  const weekDayTypes = preset.days.map(d => d.type).filter(t => t !== 'rest');
  const dedupedIdsByTrainingDay = dedupeWeekExerciseIds(weekDayTypes);
  let trainingDayIdx = 0;
  preset.days.forEach((d, i) => {
    const key = preset.id + '_' + i;
    const isRest = d.type === 'rest';
    const dayExerciseIds = isRest ? [] : dedupedIdsByTrainingDay[trainingDayIdx++];
    days[key] = {
      key, label: DAY_TYPE_LABELS[d.type] || 'Training Day', dow: WEEKDAYS[i % 7],
      kind: isRest ? 'rest' : 'training', skipped: false,
      theme: DAY_TYPE_THEME[d.type] || (Object.keys(MUSCLE_TARGETS) as Muscle[]),
      exercises: (isRest || prefill === 'scratch') ? [] : generateRecommendedDayExercises(dayExerciseIds, trainingType, weekDayTypes)
    };
    dayOrder.push(key);
  });
  if (prefill !== 'scratch') {
    balanceWeeklyVolume(days, dayOrder, trainingType);
    capDayTime(days, dayOrder);
  }
  return { days, dayOrder };
}

export function buildCustomProgram(customDays: WizardCustomDay[]): { days: ProgramDays; dayOrder: string[] } {
  const days: ProgramDays = {}; const dayOrder: string[] = [];
  customDays.forEach((d, i) => {
    const key = 'custom_' + i;
    days[key] = {
      key, label: d.label || ('Day ' + (i + 1)), dow: WEEKDAYS[i % 7],
      kind: d.kind, skipped: false, theme: d.kind === 'rest' ? [] : (Object.keys(MUSCLE_TARGETS) as Muscle[]),
      exercises: []
    };
    dayOrder.push(key);
  });
  return { days, dayOrder };
}
