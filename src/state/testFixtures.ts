// Shared builders for unit tests (*.test.ts). Pure data helpers only — no vitest imports, so
// tsc -b typechecks this file with the app whether or not tests are running.
import { createInitialState } from '../data/initialState';
import { mkEx } from '../data/program';
import type {
  AppState, ExerciseHistoryEntry, HistoryEntry, ProgramDay, ProgramExercise, TrainingType
} from '../data/types';

export function testState(overrides: Partial<AppState> = {}): AppState {
  return { ...createInitialState(), ...overrides };
}

let histSeq = 0;
/** A completed session row. `id` carries a real timestamp ('h' + ms) because
 *  historyTimestamp()/consistencyData() parse it back out. */
export function histEntry(overrides: Partial<HistoryEntry> = {}): HistoryEntry {
  histSeq += 1;
  return {
    id: 'h' + (Date.now() - histSeq * 86400000),
    day: 'Push Day',
    program: 'Test Program',
    date: 'Mon, Jan 1',
    volumeKg: 1000,
    durationMin: 50,
    avgRestSec: 90,
    weekNumber: 1,
    status: 'completed',
    exercises: [],
    ...overrides
  };
}

export function exEntry(overrides: Partial<ExerciseHistoryEntry> = {}): ExerciseHistoryEntry {
  const base: ExerciseHistoryEntry = {
    date: 'Mon, Jan 1',
    weight: 100,
    reps: 8,
    day: 'Push Day',
    equip: 'barbell'
  };
  const merged = { ...base, ...overrides };
  if (!merged.sets) merged.sets = [{ weight: merged.weight, reps: merged.reps }];
  return merged;
}

export function trainingDay(key: string, exercises: ProgramExercise[], overrides: Partial<ProgramDay> = {}): ProgramDay {
  return { key, label: key, dow: 'Monday', kind: 'training', skipped: false, exercises, ...overrides };
}

export function restDay(key: string): ProgramDay {
  return { key, label: 'Rest Day', dow: 'Sunday', kind: 'rest', skipped: false, exercises: [] };
}

/** A program slot with a real logged `last` (mkEx copies it into baseline too). */
export function slot(id: string, sets: number, equipIdx: number, weight: number, reps: number, hitTop = false): ProgramExercise {
  return mkEx(id, sets, equipIdx, { weight, reps, hitTop });
}

/** State pre-wired for deload/plateau tests: one program day holding the given exercises. */
export function stateWithProgram(exercises: ProgramExercise[], overrides: Partial<AppState> = {}): AppState {
  return testState({
    program: { d1: trainingDay('d1', exercises) },
    dayOrder: ['d1'],
    ...overrides
  });
}

export type { TrainingType };
