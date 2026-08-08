import { describe, it, expect } from 'vitest';
import { buildWorkoutCsv, escapeCsv } from './csv';
import { testState, histEntry, exEntry } from '../state/testFixtures';

const T = new Date('2026-08-01T12:00:00Z').getTime();

describe('escapeCsv', () => {
  it('passes plain fields through and quotes the ones that need it', () => {
    expect(escapeCsv('Bench Press')).toBe('Bench Press');
    expect(escapeCsv(42)).toBe('42');
    expect(escapeCsv(null)).toBe('');
    expect(escapeCsv('Mon, Jan 1')).toBe('"Mon, Jan 1"');
    expect(escapeCsv('say "hi"')).toBe('"say ""hi"""');
  });
});

describe('buildWorkoutCsv', () => {
  it('emits one row per set with real per-set data joined from exerciseHistory', () => {
    const state = testState({
      units: 'kg',
      history: [histEntry({
        id: 'h' + T, date: 'Sat, Aug 1', day: 'Push Day', program: 'PPL', weekNumber: 3, durationMin: 55,
        exercises: [{ name: 'Bench Press', resultText: '100 kg × 8/8/6', badgeText: 'Logged', badgeBg: '', badgeColor: '', isPR: true }]
      })],
      exerciseHistory: {
        bench_press: [exEntry({
          date: 'Sat, Aug 1', day: 'Push Day', equip: 'barbell',
          sets: [{ weight: 100, reps: 8, rir: 2 }, { weight: 100, reps: 8, rir: 1 }, { weight: 100, reps: 6, rir: 0 }]
        })]
      }
    });
    const lines = buildWorkoutCsv(state).trim().split('\r\n');
    expect(lines[0]).toBe('Date,Workout,Program,Week,Duration (min),Exercise,Equipment,Set,Weight,Unit,Reps,Seconds,RIR,PR,Deload');
    expect(lines.length).toBe(4); // header + 3 sets
    expect(lines[1]).toBe('2026-08-01,Push Day,PPL,3,55,Bench Press,Barbell,1,100,kg,8,,2,Yes,');
    expect(lines[3]).toBe('2026-08-01,Push Day,PPL,3,55,Bench Press,Barbell,3,100,kg,6,,0,Yes,');
  });

  it('converts joined weights to the current display unit', () => {
    const state = testState({
      units: 'lb',
      history: [histEntry({
        id: 'h' + T, date: 'Sat, Aug 1', day: 'Push Day',
        exercises: [{ name: 'Bench Press', resultText: '', badgeText: 'Logged', badgeBg: '', badgeColor: '' }]
      })],
      exerciseHistory: {
        bench_press: [exEntry({ date: 'Sat, Aug 1', day: 'Push Day', sets: [{ weight: 100, reps: 8 }] })]
      }
    });
    const row = buildWorkoutCsv(state).trim().split('\r\n')[1].split(',');
    expect(row[8]).toBe('220.5'); // 100 kg → 220.5 lb at 0.1 precision
    expect(row[9]).toBe('lb');
  });

  it('falls back to parsing resultText for sessions aged out of the per-set cap', () => {
    const state = testState({
      history: [histEntry({
        id: 'h' + T, date: 'Sat, Aug 1', day: 'Push Day',
        exercises: [{ name: 'Bench Press', resultText: '220 lb × 8/8/6', badgeText: 'Logged', badgeBg: '', badgeColor: '' }]
      })],
      exerciseHistory: {} // nothing to join against
    });
    const lines = buildWorkoutCsv(state).trim().split('\r\n');
    expect(lines.length).toBe(4);
    const row = lines[1].split(',');
    expect(row[7]).toBe('1');   // set number
    expect(row[8]).toBe('220'); // weight as logged
    expect(row[9]).toBe('lb');  // unit as logged, not current setting
    expect(row[10]).toBe('8');
    expect(row[12]).toBe('');   // RIR unknown on fallback rows
  });

  it('puts time-tracked work in the Seconds column with no weight', () => {
    const state = testState({
      history: [histEntry({
        id: 'h' + T, date: 'Sat, Aug 1', day: 'Pull Day',
        exercises: [{ name: 'Plank', resultText: '0 kg × 60/45', badgeText: 'Logged', badgeBg: '', badgeColor: '' }]
      })],
      exerciseHistory: {
        plank: [exEntry({ date: 'Sat, Aug 1', day: 'Pull Day', equip: 'bodyweight', sets: [{ weight: 0, reps: 60 }, { weight: 0, reps: 45 }] })]
      }
    });
    const lines = buildWorkoutCsv(state).trim().split('\r\n');
    const row = lines[1].split(',');
    expect(row[8]).toBe('');   // no weight
    expect(row[10]).toBe('');  // no reps
    expect(row[11]).toBe('60'); // seconds
  });

  it('marks deload rows and skips skipped exercises and skipped sessions', () => {
    const state = testState({
      history: [
        histEntry({ id: 'h' + (T + 1), status: 'skipped', date: 'Sun, Aug 2', day: 'Pull Day' }),
        histEntry({
          id: 'h' + T, date: 'Sat, Aug 1', day: 'Push Day',
          exercises: [
            { name: 'Bench Press', resultText: '60 kg × 8', badgeText: 'Logged', badgeBg: '', badgeColor: '' },
            { name: 'Cable Fly', resultText: '3 sets planned', badgeText: 'Skipped', badgeBg: '', badgeColor: '' }
          ]
        })
      ],
      exerciseHistory: {
        bench_press: [exEntry({ date: 'Sat, Aug 1', day: 'Push Day', deload: true, sets: [{ weight: 60, reps: 8 }] })]
      }
    });
    const lines = buildWorkoutCsv(state).trim().split('\r\n');
    expect(lines.length).toBe(2); // header + the one logged deload set
    expect(lines[1].endsWith(',Yes')).toBe(true); // deload flag in the last column
    expect(buildWorkoutCsv(state)).not.toContain('Cable Fly');
  });

  it('exports oldest session first', () => {
    const mk = (t: number, day: string, name: string, text: string) => histEntry({
      id: 'h' + t, date: 'd', day,
      exercises: [{ name, resultText: text, badgeText: 'Logged', badgeBg: '', badgeColor: '' }]
    });
    const state = testState({
      history: [ // newest-first, as the app stores it
        mk(T + 86400000, 'Pull Day', 'Deadlift', '140 kg × 5'),
        mk(T, 'Push Day', 'Bench Press', '100 kg × 8')
      ]
    });
    const lines = buildWorkoutCsv(state).trim().split('\r\n');
    expect(lines[1]).toContain('Bench Press');
    expect(lines[2]).toContain('Deadlift');
  });
});
