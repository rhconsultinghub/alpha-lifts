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
  full_body: ['back_squat', 'bench_press', 'seated_row', 'overhead_press', 'leg_curl', 'calf_raise', 'plank'],
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

// "recommended" prefill calibrates each exercise's set count so that, added up across every
// training day in the week that also hits the same primary muscle, the week lands close to
// that muscle's target volume for the chosen training type — rather than always defaulting to
// a flat 3 sets regardless of how many days/exercises are already hitting that muscle.
function generateRecommendedDayExercises(type: string, trainingType: TrainingType, weekDayTypes: string[]): ProgramExercise[] {
  const exerciseIds = DAY_TYPE_EXERCISES[type] || [];
  const byMuscle: Record<string, string[]> = {};
  exerciseIds.forEach(id => { const m = EXLIB[id].muscle; (byMuscle[m] = byMuscle[m] || []).push(id); });
  const mult = TRAINING_MULT[trainingType];
  return exerciseIds.map(id => {
    const lib = EXLIB[id];
    const m = lib.muscle;
    const occurrencesThisWeek = weekDayTypes.filter(dt => (DAY_TYPE_EXERCISES[dt] || []).some(eid => EXLIB[eid].muscle === m)).length;
    const perOccurrenceTarget = (MUSCLE_TARGETS[m] * mult) / Math.max(1, occurrencesThisWeek);
    const setsPerExercise = clamp(Math.round(perOccurrenceTarget / byMuscle[m].length), 2, 6);
    return mkEx(id, setsPerExercise, 0, { weight: 0, reps: planRepDefault(trainingType, lib), hitTop: true });
  });
}

export function buildProgramFromPreset(preset: SplitPreset, trainingType: TrainingType, prefill: WizardPrefill = 'recommended'): { days: ProgramDays; dayOrder: string[] } {
  const days: ProgramDays = {}; const dayOrder: string[] = [];
  const weekDayTypes = preset.days.map(d => d.type).filter(t => t !== 'rest');
  preset.days.forEach((d, i) => {
    const key = preset.id + '_' + i;
    days[key] = {
      key, label: DAY_TYPE_LABELS[d.type] || 'Training Day', dow: WEEKDAYS[i % 7],
      kind: d.type === 'rest' ? 'rest' : 'training', skipped: false,
      theme: DAY_TYPE_THEME[d.type] || (Object.keys(MUSCLE_TARGETS) as Muscle[]),
      exercises: (d.type === 'rest' || prefill === 'scratch') ? [] : generateRecommendedDayExercises(d.type, trainingType, weekDayTypes)
    };
    dayOrder.push(key);
  });
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
