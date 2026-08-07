import type { ProgramExercise, ExerciseLast } from './types';

// NOTE: this file once held the seeded demo programs (defaultProgram/dumbbellProgram) — deleted
// as confirmed-dead code in the 2026-08 hardening round (nothing imported them; fresh installs
// build programs via wizard.ts). What remains are small shared utilities that are very much live.

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

