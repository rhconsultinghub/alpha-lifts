import { describe, it, expect } from 'vitest';
import {
  backstopFor, fatigueRead, deloadPlan, advanceDeloadForWeek, activeDeloadPct, isDeloadEntry,
  DELOAD_BACKSTOP_WEEKS
} from './deload';
import { testState, histEntry, exEntry, slot, stateWithProgram } from './testFixtures';
import type { AppState } from '../data/types';

// Two flat compounds — enough for deloadSuggestion (the plateau signal) to fire on its own.
function plateauState(overrides: Partial<AppState> = {}): AppState {
  const flat = () => [exEntry({ weight: 100 }), exEntry({ weight: 100 }), exEntry({ weight: 100 })];
  return stateWithProgram([slot('bench_press', 3, 0, 100, 8), slot('back_squat', 3, 0, 140, 8)], {
    exerciseHistory: { bench_press: flat(), back_squat: flat() },
    deloadEnabled: true,
    ...overrides
  });
}

describe('backstopFor', () => {
  it('derives from training type when nothing is pinned', () => {
    expect(backstopFor(testState({ trainingType: 'strength', deloadCadenceWeeks: null }))).toBe(DELOAD_BACKSTOP_WEEKS.strength);
    expect(backstopFor(testState({ trainingType: 'progressive_overload', deloadCadenceWeeks: null }))).toBe(9);
    expect(backstopFor(testState({ trainingType: 'endurance', deloadCadenceWeeks: null }))).toBe(12);
  });
  it('clamps a legacy short cadence pin up to the 6-week floor', () => {
    expect(backstopFor(testState({ deloadCadenceWeeks: 3 }))).toBe(6);
    expect(backstopFor(testState({ deloadCadenceWeeks: 8 }))).toBe(8);
  });
});

describe('isDeloadEntry', () => {
  it('only matches the explicit flag', () => {
    expect(isDeloadEntry(exEntry({ deload: true }))).toBe(true);
    expect(isDeloadEntry(exEntry())).toBe(false);
  });
});

describe('fatigueRead', () => {
  it('reads zero on a quiet state', () => {
    const read = fatigueRead(testState());
    expect(read.score).toBe(0);
    expect(read.reasons).toEqual([]);
  });

  it('a compound plateau alone clears the trigger threshold', () => {
    const read = fatigueRead(plateauState());
    expect(read.score).toBeGreaterThanOrEqual(0.6);
    expect(read.reasons.join(' ')).toContain('flat');
  });

  it('sets averaging RIR ≤ 1 clear the threshold alone (needs 6+ logged RIRs)', () => {
    const mk = (rir: number) => exEntry({ sets: [{ weight: 100, reps: 8, rir }, { weight: 100, reps: 8, rir }] });
    const state = testState({
      exerciseHistory: { bench_press: [mk(0), mk(1)], back_squat: [mk(1)] } // 6 RIR samples avg ≈0.67
    });
    const read = fatigueRead(state);
    expect(read.score).toBeGreaterThanOrEqual(0.6);
  });

  it('near-failure RIR is only a corroborator on the high-effort style', () => {
    const mk = (rir: number) => exEntry({ sets: [{ weight: 100, reps: 8, rir }, { weight: 100, reps: 8, rir }] });
    const state = testState({
      trainingType: 'hit',
      exerciseHistory: { bench_press: [mk(0), mk(0)], back_squat: [mk(0)] }
    });
    expect(fatigueRead(state).score).toBe(0.25);
  });

  it('an RIR average between 1 and 1.5 scores as soft evidence', () => {
    const mk = (rir: number) => exEntry({ sets: [{ weight: 100, reps: 8, rir }, { weight: 100, reps: 8, rir }] });
    const state = testState({
      exerciseHistory: { bench_press: [mk(1), mk(1)], back_squat: [mk(2)] } // avg ≈1.33
    });
    expect(fatigueRead(state).score).toBe(0.35);
  });

  it('volume trending down more than 8% scores as a corroborator', () => {
    const state = testState({
      // newest-first: three ~80 kg sessions after three ~100 kg sessions
      history: [
        histEntry({ volumeKg: 80 }), histEntry({ volumeKg: 80 }), histEntry({ volumeKg: 80 }),
        histEntry({ volumeKg: 100 }), histEntry({ volumeKg: 100 }), histEntry({ volumeKg: 100 })
      ]
    });
    const read = fatigueRead(state);
    expect(read.score).toBe(0.35);
    expect(read.reasons.join(' ')).toContain('volume');
  });

  it('ignores deload entries in the RIR sample', () => {
    const mk = (rir: number) => exEntry({ deload: true, sets: [{ weight: 60, reps: 8, rir }, { weight: 60, reps: 8, rir }] });
    const state = testState({
      exerciseHistory: { bench_press: [mk(0), mk(0)], back_squat: [mk(0)] }
    });
    expect(fatigueRead(state).score).toBe(0);
  });
});

describe('deloadPlan', () => {
  it('is inert while the feature is off', () => {
    const plan = deloadPlan(plateauState({ deloadEnabled: false, weekNumber: 5 }));
    expect(plan.enabled).toBe(false);
    expect(plan.isDue).toBe(false);
  });

  it('proposes a fatigue deload once the signals trip and the floor has passed', () => {
    const plan = deloadPlan(plateauState({ weekNumber: 5, deloadAnchorWeek: 0 }));
    expect(plan.isDue).toBe(true);
    expect(plan.trigger).toBe('fatigue');
    expect(plan.reasons.length).toBeGreaterThan(0);
  });

  it('holds fire within the 2-week floor after the last deload', () => {
    const plan = deloadPlan(plateauState({ weekNumber: 5, deloadAnchorWeek: 4 }));
    expect(plan.isDue).toBe(false);
    expect(plan.suppressed).toBe(true);
  });

  it('respects a defer/skip window even when signals are firing', () => {
    const plan = deloadPlan(plateauState({ weekNumber: 5, deloadAnchorWeek: 0, deloadDeferUntilWeek: 8 }));
    expect(plan.isDue).toBe(false);
    expect(plan.suppressed).toBe(true);
  });

  it('falls back to the backstop when no signal ever fires', () => {
    const plan = deloadPlan(testState({ deloadEnabled: true, weekNumber: 9, deloadAnchorWeek: 0 })); // PO backstop = 9
    expect(plan.isDue).toBe(true);
    expect(plan.trigger).toBe('backstop');
  });

  it('names the training reason when both fatigue and backstop would fire', () => {
    const plan = deloadPlan(plateauState({ weekNumber: 20, deloadAnchorWeek: 0 }));
    expect(plan.trigger).toBe('fatigue');
  });

  it('reports the active week instead of proposing while one is running', () => {
    const plan = deloadPlan(plateauState({ weekNumber: 5, deloadActiveWeek: 5 }));
    expect(plan.isActive).toBe(true);
    expect(plan.isDue).toBe(false);
  });
});

describe('advanceDeloadForWeek', () => {
  it('closes out a finished deload: anchor moves, active clears', () => {
    const state = testState({ deloadEnabled: true, deloadActiveWeek: 5, deloadAnchorWeek: 0, deloadDeferUntilWeek: null, deloadHistory: [{ week: 5, reason: 'fatigue' }] });
    const fields = advanceDeloadForWeek(state, 6);
    expect(fields.deloadActiveWeek).toBeNull();
    expect(fields.deloadAnchorWeek).toBe(5);
    expect(fields.deloadHistory.length).toBe(1); // history written at open, not close
  });

  it('opens a deload on the new week when it is due', () => {
    const state = plateauState({ weekNumber: 4, deloadAnchorWeek: 0 });
    const fields = advanceDeloadForWeek(state, 5);
    expect(fields.deloadActiveWeek).toBe(5);
    expect(fields.deloadHistory[fields.deloadHistory.length - 1]).toEqual({ week: 5, reason: 'fatigue' });
  });

  it('records the backstop reason when the counter ran out', () => {
    const state = testState({ deloadEnabled: true, weekNumber: 8, deloadAnchorWeek: 0 });
    const fields = advanceDeloadForWeek(state, 9);
    expect(fields.deloadActiveWeek).toBe(9);
    expect(fields.deloadHistory[0].reason).toBe('backstop');
  });

  it('does nothing while the feature is off', () => {
    const state = plateauState({ deloadEnabled: false, weekNumber: 4 });
    const fields = advanceDeloadForWeek(state, 5);
    expect(fields.deloadActiveWeek).toBeNull();
    expect(fields.deloadHistory).toEqual([]);
  });
});

describe('activeDeloadPct', () => {
  it('returns the clamped multiplier only while this week is the deload', () => {
    expect(activeDeloadPct(testState({ deloadEnabled: true, weekNumber: 5, deloadActiveWeek: 5, deloadIntensityPct: 60 }))).toBe(0.6);
    expect(activeDeloadPct(testState({ deloadEnabled: true, weekNumber: 5, deloadActiveWeek: 5, deloadIntensityPct: 90 }))).toBe(0.8);
    expect(activeDeloadPct(testState({ deloadEnabled: true, weekNumber: 5, deloadActiveWeek: 5, deloadIntensityPct: 40 }))).toBe(0.5);
    expect(activeDeloadPct(testState({ deloadEnabled: true, weekNumber: 5, deloadActiveWeek: 6 }))).toBeNull();
    expect(activeDeloadPct(testState({ deloadEnabled: false, weekNumber: 5, deloadActiveWeek: 5 }))).toBeNull();
  });
});
