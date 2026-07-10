import type { ProgramDays, ProgramExercise, ExerciseLast } from './types';
import { DAY_ORDER } from './exercises';

export function mkEx(id: string, sets: number, equipIdx: number, last: ExerciseLast): ProgramExercise {
  return { id, sets, equipIdx, last, baseline: { weight: last.weight, reps: last.reps } };
}

export function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

export function roundTo(v: number, step: number): number {
  return Math.round(v / step) * step;
}

// deterministic 0..1 "random" from a string seed — used for illustrative historical variance
// so re-renders never flicker.
export function seededFrac(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) { h = (h * 31 + str.charCodeAt(i)) >>> 0; }
  return (h % 1000) / 1000;
}

export function slugify(name: string): string {
  return name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'exercise';
}

export function defaultProgram(): ProgramDays {
  return {
    push: { key: 'push', label: 'Push Day', dow: 'Monday', skipped: false, exercises: [
      mkEx('bench_press', 4, 0, { weight: 80, reps: 8, hitTop: true }),
      mkEx('overhead_press', 3, 0, { weight: 40, reps: 10, hitTop: true }),
      mkEx('incline_db_press', 3, 0, { weight: 24, reps: 11, hitTop: false }),
      mkEx('triceps_pushdown', 3, 0, { weight: 25, reps: 12, hitTop: true }),
      mkEx('lateral_raise', 3, 0, { weight: 10, reps: 15, hitTop: true })
    ] },
    pull: { key: 'pull', label: 'Pull Day', dow: 'Tuesday', skipped: false, exercises: [
      mkEx('deadlift', 4, 0, { weight: 97.5, reps: 8, hitTop: true }),
      mkEx('lat_pulldown', 3, 0, { weight: 50, reps: 12, hitTop: true }),
      mkEx('seated_row', 3, 0, { weight: 47.5, reps: 11, hitTop: false }),
      mkEx('barbell_curl', 3, 0, { weight: 25, reps: 12, hitTop: true }),
      mkEx('face_pull', 3, 0, { weight: 18, reps: 15, hitTop: true }),
      mkEx('plank', 3, 0, { weight: 0, reps: 40, hitTop: true })
    ] },
    legs: { key: 'legs', label: 'Leg Day', dow: 'Wednesday', skipped: false, exercises: [
      mkEx('back_squat', 4, 0, { weight: 90, reps: 8, hitTop: true }),
      mkEx('leg_curl', 3, 0, { weight: 35, reps: 12, hitTop: true }),
      mkEx('hip_thrust', 3, 0, { weight: 55, reps: 11, hitTop: true })
    ] },
    upper: { key: 'upper', label: 'Upper Day', dow: 'Friday', skipped: false, exercises: [
      mkEx('pullup', 3, 0, { weight: 0, reps: 10, hitTop: true }),
      mkEx('db_shoulder_press', 3, 0, { weight: 22, reps: 11, hitTop: false }),
      mkEx('cable_fly', 3, 0, { weight: 20, reps: 15, hitTop: true }),
      mkEx('hammer_curl', 3, 0, { weight: 14, reps: 12, hitTop: true }),
      mkEx('triceps_pushdown', 3, 0, { weight: 22, reps: 12, hitTop: true }),
      mkEx('face_pull', 3, 0, { weight: 16, reps: 15, hitTop: true })
    ] },
    lower: { key: 'lower', label: 'Lower Day', dow: 'Saturday', skipped: false, exercises: [
      mkEx('rdl', 3, 0, { weight: 70, reps: 10, hitTop: true }),
      mkEx('leg_press', 4, 0, { weight: 140, reps: 12, hitTop: true }),
      mkEx('hip_thrust', 3, 0, { weight: 60, reps: 11, hitTop: false }),
      mkEx('calf_raise', 4, 0, { weight: 40, reps: 15, hitTop: true })
    ] }
  };
}

// alternate program: same slots, dumbbell/home-gym-friendly equipment picked where available
export function dumbbellProgram(): ProgramDays {
  const p = defaultProgram();
  p.push.exercises[0].equipIdx = 1; // bench_press -> dumbbell
  p.push.exercises[1].equipIdx = 1; // overhead_press -> dumbbell
  p.upper.exercises[1].equipIdx = 0; // db_shoulder_press already dumbbell
  p.lower.exercises[0].equipIdx = 1; // rdl -> dumbbell
  return p;
}

export { DAY_ORDER };
