import { describe, it, expect } from 'vitest';
import {
  fmtWeight, fmtBodyWeight, platesBreakdown, setCredit, estimatedOneRepMax, bestSetScore,
  rirRestFactor, restForExercise, effectiveLast, similarExerciseReference, recommendation,
  muscleVolumes, muscleStatus, isWeekComplete, warmupInfo, deloadSuggestion,
  bestEverStreak, cleanWeekCount, totalPRCount, consistencyData,
  nextIncompleteIndex, isWorkoutFullyDone, estimateDayTime, formatSetTime, formatElapsed,
  fmtMeasurement, measurementUnitLabel, measurementChartData
} from './logic';
import { EXLIB, KG_PER_LB_STEP } from '../data/exercises';
import { testState, histEntry, exEntry, trainingDay, restDay, slot, stateWithProgram } from './testFixtures';

describe('fmtWeight / fmtBodyWeight', () => {
  it('rounds kg to 0.5 and lb to a 5-lb grid', () => {
    expect(fmtWeight(100, 'kg')).toBe('100 kg');
    expect(fmtWeight(101.3, 'kg')).toBe('101.5 kg');
    expect(fmtWeight(100, 'lb')).toBe('220 lb');   // 220.462 → nearest 5
    expect(fmtWeight(1, 'lb')).toBe('0 lb');       // below the 5-lb grid
  });
  it('bodyweight keeps 0.1 precision so small changes stay visible', () => {
    expect(fmtBodyWeight(81.65, 'lb')).toBe('180 lb');
    expect(fmtBodyWeight(80.24, 'kg')).toBe('80.2 kg');
    expect(fmtBodyWeight(1, 'lb')).toBe('2.2 lb'); // fmtWeight would render this as "0 lb"
  });
});

describe('platesBreakdown', () => {
  it('computes a per-side greedy breakdown in display units', () => {
    expect(platesBreakdown(225, 'lb')).toEqual([45, 45]);
    expect(platesBreakdown(135, 'lb')).toEqual([45]);
    expect(platesBreakdown(100, 'kg')).toEqual([25, 15]);
    expect(platesBreakdown(50, 'lb')).toEqual([2.5]);
  });
  it('returns null at or below bar weight', () => {
    expect(platesBreakdown(45, 'lb')).toBeNull();
    expect(platesBreakdown(20, 'kg')).toBeNull();
    expect(platesBreakdown(44, 'lb')).toBeNull();
  });
  it('returns null when the remainder is smaller than the smallest plate', () => {
    expect(platesBreakdown(47.5, 'lb')).toBeNull(); // 1.25/side < 2.5 lb smallest plate
  });
});

describe('estimatedOneRepMax / bestSetScore', () => {
  it('uses the Epley formula', () => {
    expect(estimatedOneRepMax(100, 10)).toBeCloseTo(133.333, 2);
    expect(estimatedOneRepMax(100, 1)).toBeCloseTo(103.333, 2);
    expect(estimatedOneRepMax(100, 0)).toBe(0);
  });
  it('scores time and bodyweight sets on reps/seconds, weighted sets on e1RM', () => {
    expect(bestSetScore(0, 60, true, false)).toBe(60);
    expect(bestSetScore(0, 12, false, true)).toBe(12);
    expect(bestSetScore(100, 10, false, false)).toBeCloseTo(133.333, 2);
    // a heavier lower-rep set can beat a lighter higher-rep one
    expect(bestSetScore(120, 5, false, false)).toBeGreaterThan(bestSetScore(100, 8, false, false));
  });
});

describe('setCredit', () => {
  it('gives full credit when RIR is unlogged', () => {
    expect(setCredit(undefined, 'progressive_overload')).toBe(1);
    expect(setCredit(null, 'hit')).toBe(1);
  });
  it('gives full credit inside the style tolerance', () => {
    expect(setCredit(3, 'progressive_overload')).toBe(1);
    expect(setCredit(1, 'hit')).toBe(1);
    expect(setCredit(5, 'endurance')).toBe(1);
  });
  it('discounts past tolerance, floored at 0.5', () => {
    expect(setCredit(4, 'progressive_overload')).toBeCloseTo(0.85);
    expect(setCredit(2, 'hit')).toBeCloseTo(0.85);
    expect(setCredit(10, 'progressive_overload')).toBe(0.5);
  });
});

describe('rest timing', () => {
  it('rirRestFactor maps proximity-to-failure to a multiplier', () => {
    expect(rirRestFactor(undefined)).toBe(1);
    expect(rirRestFactor(0)).toBe(1.25);
    expect(rirRestFactor(1)).toBe(1.15);
    expect(rirRestFactor(2)).toBe(1);
    expect(rirRestFactor(3)).toBe(0.9);
    expect(rirRestFactor(4)).toBe(0.8);
    expect(rirRestFactor(7)).toBe(0.8);
  });
  it('restForExercise stacks restBase × training × RIR × pacing', () => {
    // bench restBase 120: strength (1.4) at failure (1.25) = 210s
    expect(restForExercise('bench_press', 'Standard', 'strength', 0)).toBe(210);
    // neutral everything = restBase itself
    expect(restForExercise('bench_press', 'Standard', 'progressive_overload')).toBe(120);
  });
  it('clamps to the 30s–300s window', () => {
    // deadlift 180 × 1.4 × 1.25 × 1.3 = 409.5 → 300
    expect(restForExercise('deadlift', 'Relaxed', 'strength', 0)).toBe(300);
    // pushdown 60 × 0.6 × 0.8 × 0.7 = 20.2 → 30
    expect(restForExercise('triceps_pushdown', 'Aggressive', 'endurance', 4)).toBe(30);
  });
});

describe('effectiveLast', () => {
  it('prefers a manual quick-edit target over everything', () => {
    const ex = { ...slot('bench_press', 3, 0, 80, 8), manualTarget: { weight: 100, reps: 6 } };
    const hist = [exEntry({ weight: 90, reps: 8 })];
    expect(effectiveLast(ex, hist)).toEqual({ weight: 100, reps: 6, hitTop: false });
  });
  it('uses the latest history entry scoped to the slot equipment variant', () => {
    const ex = slot('bench_press', 3, 0, 60, 8); // equipIdx 0 = barbell
    const hist = [
      exEntry({ weight: 100, reps: 8, equip: 'barbell' }),
      exEntry({ weight: 40, reps: 10, equip: 'dumbbell' }) // newer, but wrong tool
    ];
    const last = effectiveLast(ex, hist);
    expect(last.weight).toBe(100);
  });
  it('reports hitTop only when every set reached repHi', () => {
    const ex = slot('bench_press', 3, 0, 60, 8); // bench repHi = 8
    const allHit = [exEntry({ sets: [{ weight: 100, reps: 8 }, { weight: 100, reps: 8 }] })];
    const oneShort = [exEntry({ sets: [{ weight: 100, reps: 8 }, { weight: 100, reps: 7 }] })];
    expect(effectiveLast(ex, allHit).hitTop).toBe(true);
    expect(effectiveLast(ex, oneShort).hitTop).toBe(false);
  });
  it('skips deload entries unless nothing else exists', () => {
    const ex = slot('bench_press', 3, 0, 60, 8);
    const withReal = [exEntry({ weight: 100 }), exEntry({ weight: 60, deload: true })];
    expect(effectiveLast(ex, withReal).weight).toBe(100);
    const onlyDeload = [exEntry({ weight: 60, deload: true })];
    expect(effectiveLast(ex, onlyDeload).weight).toBe(60);
  });
  it('falls back to the slot own last with no history', () => {
    const ex = slot('bench_press', 3, 0, 77, 8);
    expect(effectiveLast(ex, undefined).weight).toBe(77);
    expect(effectiveLast(ex, []).weight).toBe(77);
  });
});

describe('similarExerciseReference', () => {
  it('prefers a same-pattern exercise (true variant) over same-muscle', () => {
    // deadlift & rdl share pattern 'hinge'; cable_fly shares nothing with them
    const allHistory = {
      rdl: [exEntry({ weight: 120, reps: 8 })],
      cable_fly: [exEntry({ weight: 20, reps: 15 })]
    };
    const ref = similarExerciseReference('deadlift', allHistory);
    expect(ref?.name).toBe(EXLIB.rdl.name);
    expect(ref?.sameVariant).toBe(true);
  });
  it('falls back to same primary muscle', () => {
    const allHistory = { cable_fly: [exEntry({ weight: 20, reps: 15 })] };
    const ref = similarExerciseReference('bench_press', allHistory); // both Chest
    expect(ref?.name).toBe(EXLIB.cable_fly.name);
    expect(ref?.sameVariant).toBe(false);
  });
  it('returns null when nothing related has been logged', () => {
    expect(similarExerciseReference('bench_press', { plank: [exEntry({ weight: 0, reps: 60 })] })).toBeNull();
    expect(similarExerciseReference('bench_press', {})).toBeNull();
  });
});

describe('recommendation', () => {
  const bench = () => slot('bench_press', 3, 0, 100, 8);

  it('shows first-time baseline advice for a never-logged exercise', () => {
    const rec = recommendation(bench(), 'kg');
    expect(rec.title.toLowerCase()).toContain('first time');
    expect(rec.note).toContain('No history yet');
  });
  it('references the same lift on another tool for a first time on a new variant', () => {
    const allHistory = { bench_press: [exEntry({ weight: 40, reps: 10, equip: 'dumbbell' })] };
    const rec = recommendation(bench(), 'kg', 'Encouraging', [], allHistory);
    expect(rec.note).toContain('Dumbbell');
    expect(rec.weight).toBe(40);
  });
  it('cuts to the deload percentage, rounded to a loadable increment', () => {
    const hist = [exEntry({ weight: 100, reps: 8 })];
    const rec = recommendation(bench(), 'kg', 'Encouraging', hist, undefined, 0.6);
    expect(rec.weight).toBe(60); // 60% of 100, on the 2.5 kg barbell grid
    expect(rec.title).toContain('Deload');
  });
  it('holds the weight after a hit-top set at RIR 0 (non-hit styles)', () => {
    const hist = [exEntry({ sets: [{ weight: 100, reps: 8, rir: 0 }] })];
    const rec = recommendation(bench(), 'kg', 'Encouraging', hist, undefined, null, 'progressive_overload');
    expect(rec.weight).toBe(100);
    expect(rec.note).toContain('RIR 0');
  });
  it('still progresses at RIR 0 on the low-volume/high-effort style', () => {
    const hist = [exEntry({ sets: [{ weight: 100, reps: 8, rir: 0 }] })];
    const rec = recommendation(bench(), 'kg', 'Encouraging', hist, undefined, null, 'hit');
    expect(rec.weight).toBe(102.5);
  });
  it('adds the equipment increment after a normal hit-top session', () => {
    const hist = [exEntry({ sets: [{ weight: 100, reps: 8, rir: 2 }] })];
    const rec = recommendation(bench(), 'kg', 'Encouraging', hist);
    expect(rec.weight).toBe(102.5);
  });
  it('uses a flat 5 lb increment in lb mode', () => {
    const hist = [exEntry({ sets: [{ weight: 100, reps: 8, rir: 2 }] })];
    const rec = recommendation(bench(), 'lb', 'Encouraging', hist);
    expect(rec.weight).toBeCloseTo(100 + KG_PER_LB_STEP, 5);
  });
  it('repeats the weight when the rep target was missed', () => {
    const hist = [exEntry({ sets: [{ weight: 100, reps: 6 }] })];
    const rec = recommendation(bench(), 'kg', 'Encouraging', hist);
    expect(rec.weight).toBe(100);
    expect(rec.reps).toBe(EXLIB.bench_press.repHi);
  });
  it('progresses bodyweight work by reps and time work by seconds', () => {
    const pullup = slot('pullup', 3, 0, 0, 10); // bodyweight, repHi 10
    const hitTopHist = [exEntry({ weight: 0, reps: 10, equip: 'bodyweight', sets: [{ weight: 0, reps: 10 }] })];
    expect(recommendation(pullup, 'kg', 'Encouraging', hitTopHist).reps).toBe(11);

    const plank = slot('plank', 2, 0, 0, 60); // time-tracked, repHi 60
    const plankHist = [exEntry({ weight: 0, reps: 60, equip: 'bodyweight', sets: [{ weight: 0, reps: 60 }] })];
    expect(recommendation(plank, 'kg', 'Encouraging', plankHist).reps).toBe(65);
  });
  it('cuts reps instead of weight when deloading bodyweight work', () => {
    const pullup = slot('pullup', 3, 0, 0, 10);
    const hist = [exEntry({ weight: 0, reps: 10, equip: 'bodyweight', sets: [{ weight: 0, reps: 10 }] })];
    const rec = recommendation(pullup, 'kg', 'Encouraging', hist, undefined, 0.6);
    expect(rec.weight).toBe(0);
    expect(rec.reps).toBe(6);
  });
});

describe('muscleVolumes', () => {
  it('counts planned sets toward the primary muscle only', () => {
    const program = { d1: trainingDay('d1', [slot('bench_press', 3, 0, 100, 8), slot('plank', 2, 0, 0, 60)]) };
    const vols = muscleVolumes(program, ['d1'], 'progressive_overload');
    expect(vols.Chest).toBe(3);
    expect(vols.Core).toBe(2);
    expect(vols.Triceps).toBeUndefined(); // bench secondary earns no credit
  });
  it('skips rest days and skipped days', () => {
    const program = {
      d1: restDay('d1'),
      d2: trainingDay('d2', [slot('bench_press', 5, 0, 100, 8)], { skipped: true })
    };
    expect(muscleVolumes(program, ['d1', 'd2'], 'progressive_overload')).toEqual({});
  });
  it('excludes exercises the last session never reached', () => {
    const program = {
      d1: trainingDay('d1', [slot('bench_press', 3, 0, 100, 8), slot('cable_fly', 3, 0, 20, 15)], {
        exercisesDoneMask: [true, false]
      })
    };
    const vols = muscleVolumes(program, ['d1'], 'progressive_overload');
    expect(vols.Chest).toBe(3);
  });
  it('discounts sets by the last logged RIR', () => {
    const program = { d1: trainingDay('d1', [slot('bench_press', 4, 0, 100, 8)]) };
    const history = { bench_press: [exEntry({ sets: [{ weight: 100, reps: 8, rir: 4 }] })] };
    const vols = muscleVolumes(program, ['d1'], 'progressive_overload', history);
    expect(vols.Chest).toBeCloseTo(4 * 0.85);
  });
});

describe('muscleStatus', () => {
  it('flags under below MEV, over above MAV, good inside the band', () => {
    expect(muscleStatus(5, 10, 22).status).toBe('under');
    expect(muscleStatus(25, 10, 22).status).toBe('over');
    expect(muscleStatus(15, 10, 22).status).toBe('good');
    expect(muscleStatus(10, 10, 22).status).toBe('good'); // boundaries inclusive
    expect(muscleStatus(22, 10, 22).status).toBe('good');
  });
});

describe('isWeekComplete', () => {
  const weekStart = new Date('2026-01-05T00:00:00Z').toISOString();
  it('is true once every training day is completed or skipped since week start', () => {
    const program = {
      d1: trainingDay('d1', [], { lastCompletedAt: new Date('2026-01-06T00:00:00Z').toISOString() }),
      d2: trainingDay('d2', [], { skipped: true }),
      d3: restDay('d3')
    };
    expect(isWeekComplete(program, ['d1', 'd2', 'd3'], weekStart)).toBe(true);
  });
  it('is false when a training day is outstanding or completed before the week started', () => {
    const stale = trainingDay('d1', [], { lastCompletedAt: new Date('2026-01-01T00:00:00Z').toISOString() });
    expect(isWeekComplete({ d1: stale }, ['d1'], weekStart)).toBe(false);
    expect(isWeekComplete({ d1: trainingDay('d1', []) }, ['d1'], weekStart)).toBe(false);
  });
  it('is false with no training days at all', () => {
    expect(isWeekComplete({ d1: restDay('d1') }, ['d1'], weekStart)).toBe(false);
  });
});

describe('warmupInfo', () => {
  const bench = () => slot('bench_press', 3, 0, 0, 8);
  it('ramps off the working weight passed in', () => {
    const info = warmupInfo(bench(), 'Standard', 100);
    expect(info?.sets).toEqual([{ weight: 40, reps: 8 }, { weight: 65, reps: 5 }]);
  });
  it('Cautious style adds a third, gentler set at a lower threshold', () => {
    const info = warmupInfo(bench(), 'Cautious', 100);
    expect(info?.sets).toEqual([{ weight: 30, reps: 10 }, { weight: 50, reps: 8 }, { weight: 70, reps: 5 }]);
    expect(warmupInfo(bench(), 'Cautious', 30)).not.toBeNull();  // 30 ≥ 25 threshold
    expect(warmupInfo(bench(), 'Standard', 30)).toBeNull();       // 30 < 40 threshold
  });
  it('is skipped for Minimal style, isolation moves, and bodyweight work', () => {
    expect(warmupInfo(bench(), 'Minimal', 100)).toBeNull();
    expect(warmupInfo(slot('triceps_pushdown', 3, 0, 30, 12), 'Standard', 100)).toBeNull();
    expect(warmupInfo(slot('pullup', 3, 0, 0, 10), 'Standard', 100)).toBeNull();
  });
});

describe('deloadSuggestion', () => {
  const flat = () => [exEntry({ weight: 100 }), exEntry({ weight: 100 }), exEntry({ weight: 100 })];
  const progressing = () => [exEntry({ weight: 100 }), exEntry({ weight: 105 }), exEntry({ weight: 112.5 })];

  it('fires when at least half the considered compounds are flat', () => {
    const state = stateWithProgram([slot('bench_press', 3, 0, 100, 8), slot('back_squat', 3, 0, 140, 8)], {
      exerciseHistory: { bench_press: flat(), back_squat: flat() }
    });
    const s = deloadSuggestion(state);
    expect(s.show).toBe(true);
    expect(s.names).toContain('Bench Press');
  });
  it('stays quiet while lifts are progressing', () => {
    const state = stateWithProgram([slot('bench_press', 3, 0, 100, 8), slot('back_squat', 3, 0, 140, 8)], {
      exerciseHistory: { bench_press: progressing(), back_squat: progressing() }
    });
    expect(deloadSuggestion(state).show).toBe(false);
  });
  it('needs at least two compounds with 3+ sessions to have an opinion', () => {
    const state = stateWithProgram([slot('bench_press', 3, 0, 100, 8)], {
      exerciseHistory: { bench_press: flat() }
    });
    expect(deloadSuggestion(state).show).toBe(false);
  });
  it('ignores deload entries when reading the trend', () => {
    // real history progresses; a trailing deload week must not read as a plateau
    const withDeload = [...progressing(), exEntry({ weight: 60, deload: true })];
    const state = stateWithProgram([slot('bench_press', 3, 0, 100, 8), slot('back_squat', 3, 0, 140, 8)], {
      exerciseHistory: { bench_press: withDeload, back_squat: [...progressing(), exEntry({ weight: 80, deload: true })] }
    });
    expect(deloadSuggestion(state).show).toBe(false);
  });
});

describe('history-derived stats', () => {
  it('bestEverStreak finds the longest run anywhere, not just the current one', () => {
    const state = testState({
      history: [
        histEntry({ status: 'skipped' }),
        histEntry(), histEntry(), histEntry(),   // best run of 3
        histEntry({ status: 'skipped' }),
        histEntry()
      ]
    });
    expect(bestEverStreak(state)).toBe(3);
  });
  it('consistencyData streak counts consecutive completions from the front', () => {
    const state = testState({
      history: [histEntry(), histEntry(), histEntry({ status: 'skipped' }), histEntry()]
    });
    expect(consistencyData(state).streak).toBe(2);
  });
  it('cleanWeekCount counts weeks with entries and no skips', () => {
    const state = testState({
      history: [
        histEntry({ weekNumber: 1 }), histEntry({ weekNumber: 1 }),
        histEntry({ weekNumber: 2 }), histEntry({ weekNumber: 2, status: 'skipped' }),
        histEntry({ weekNumber: 3 })
      ]
    });
    expect(cleanWeekCount(state)).toBe(2);
  });
  it('totalPRCount reads the isPR flags stored on history rows', () => {
    const state = testState({
      history: [
        histEntry({ exercises: [{ name: 'Bench', resultText: '', badgeText: 'Logged', badgeBg: '', badgeColor: '', isPR: true }] }),
        histEntry({ exercises: [{ name: 'Squat', resultText: '', badgeText: 'Logged', badgeBg: '', badgeColor: '', isPR: true }, { name: 'Row', resultText: '', badgeText: 'Logged', badgeBg: '', badgeColor: '' }] })
      ]
    });
    expect(totalPRCount(state)).toBe(2);
  });
});

describe('workout navigation helpers', () => {
  const exercises = [slot('bench_press', 2, 0, 100, 8), slot('cable_fly', 2, 0, 20, 15), slot('plank', 1, 0, 0, 60)];
  const done = (n: number) => Array.from({ length: n }, () => ({ done: true }));
  const notDone = (n: number) => Array.from({ length: n }, () => ({ done: false }));

  it('nextIncompleteIndex advances to the next unfinished exercise, wrapping around', () => {
    expect(nextIncompleteIndex(exercises, { 0: done(2), 1: notDone(2), 2: done(1) }, 0)).toBe(1);
    expect(nextIncompleteIndex(exercises, { 0: notDone(2), 1: done(2), 2: done(1) }, 1)).toBe(0); // wraps
    expect(nextIncompleteIndex(exercises, { 0: done(2), 1: done(2), 2: done(1) }, 0)).toBeNull();
  });
  it('isWorkoutFullyDone requires every set of every exercise', () => {
    expect(isWorkoutFullyDone(exercises, { 0: done(2), 1: done(2), 2: done(1) })).toBe(true);
    expect(isWorkoutFullyDone(exercises, { 0: done(2), 1: done(2) })).toBe(false);
  });
});

describe('estimateDayTime', () => {
  it('uses the static formula when no logged samples exist', () => {
    // bench 3 sets, last.weight 0 → no warm-up block: 30 + 3×(40+120) = 510s
    const state = stateWithProgram([slot('bench_press', 3, 0, 0, 8)]);
    expect(estimateDayTime(state, 'd1')).toBe(510);
  });
  it('adds the warm-up block for a heavy compound', () => {
    const state = stateWithProgram([slot('bench_press', 3, 0, 100, 8)]);
    expect(estimateDayTime(state, 'd1')).toBe(660);
  });
});

describe('measurements', () => {
  it('formats cm for kg users and inches for lb users', () => {
    expect(fmtMeasurement(91.44, 'kg')).toBe('91.4 cm');
    expect(fmtMeasurement(91.44, 'lb')).toBe('36 in');
    expect(measurementUnitLabel('kg')).toBe('cm');
    expect(measurementUnitLabel('lb')).toBe('in');
  });
  it('charts only the selected type, sorted by date, with a delta', () => {
    const state = testState({
      units: 'kg',
      measurementLog: [
        { date: '2026-08-05', type: 'waist', valueCm: 88 },
        { date: '2026-08-01', type: 'waist', valueCm: 90 },
        { date: '2026-08-03', type: 'chest', valueCm: 105 }
      ]
    });
    const d = measurementChartData(state, 'waist');
    expect(d.hasData).toBe(true);
    expect(d.points.length).toBe(2);
    expect(d.latestText).toBe('88 cm');
    expect(d.deltaText).toContain('-2 cm since 2026-08-01');
    expect(measurementChartData(state, 'thigh').hasData).toBe(false);
  });
});

describe('formatters', () => {
  it('formatSetTime renders seconds and minutes', () => {
    expect(formatSetTime(45)).toBe('45s');
    expect(formatSetTime(90)).toBe('1:30');
  });
  it('formatElapsed renders mm:ss and h:mm:ss', () => {
    expect(formatElapsed(5000)).toBe('00:05');
    expect(formatElapsed(3661000)).toBe('1:01:01');
    expect(formatElapsed(-50)).toBe('00:00');
  });
});
