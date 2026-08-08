import { describe, it, expect } from 'vitest';
import { SPLIT_PRESETS, buildProgramFromPreset, buildCustomProgram, WEEKDAYS } from './wizard';
import { EXLIB, MUSCLES, MUSCLE_VOLUME } from './exercises';
import { restForExercise } from '../state/logic';
import type { ProgramDays, TrainingType } from './types';

const TRAINING_TYPES: TrainingType[] = ['progressive_overload', 'strength', 'hit', 'endurance', 'general'];

// Mirrors the wizard's internal estimateDaySetTimeSec (Standard pacing, no per-set RIR) — the
// number its two day-time ceilings are enforced against.
function daySeconds(days: ProgramDays, key: string, trainingType: TrainingType): number {
  const day = days[key];
  let sec = day.exercises.length * 30;
  day.exercises.forEach(ex => { sec += ex.sets * (40 + restForExercise(ex.id, 'Standard', trainingType)); });
  return sec;
}

function weeklyMuscleSets(days: ProgramDays, dayOrder: string[]): Record<string, number> {
  const vols: Record<string, number> = {};
  dayOrder.forEach(k => {
    const day = days[k];
    if ((day.kind || 'training') === 'rest') return;
    day.exercises.forEach(ex => {
      const m = EXLIB[ex.id].muscle;
      vols[m] = (vols[m] || 0) + ex.sets;
    });
  });
  return vols;
}

describe('buildProgramFromPreset — every split × training type', () => {
  for (const preset of SPLIT_PRESETS) {
    for (const type of TRAINING_TYPES) {
      describe(`${preset.id} × ${type}`, () => {
        const { days, dayOrder } = buildProgramFromPreset(preset, type);

        it('produces a full week with rest days empty and training days filled', () => {
          expect(dayOrder.length).toBe(preset.days.length);
          dayOrder.forEach((k, i) => {
            const day = days[k];
            expect(day.dow).toBe(WEEKDAYS[i % 7]);
            if (preset.days[i].type === 'rest') {
              expect(day.kind).toBe('rest');
              expect(day.exercises.length).toBe(0);
            } else {
              expect(day.kind).toBe('training');
              expect(day.exercises.length).toBeGreaterThan(0);
            }
          });
        });

        it('never repeats an exercise within a day', () => {
          dayOrder.forEach(k => {
            const ids = days[k].exercises.map(ex => ex.id);
            expect(new Set(ids).size).toBe(ids.length);
          });
        });

        it('keeps every exercise between 1 and 8 sets', () => {
          dayOrder.forEach(k => days[k].exercises.forEach(ex => {
            expect(ex.sets).toBeGreaterThanOrEqual(1);
            expect(ex.sets).toBeLessThanOrEqual(8);
          }));
        });

        it('keeps every day under the 90-minute hard cap', () => {
          dayOrder.forEach(k => {
            if ((days[k].kind || 'training') === 'rest') return;
            expect(daySeconds(days, k, type)).toBeLessThanOrEqual(90 * 60);
          });
        });

        it('programs every muscle, and never over MAV', () => {
          const vols = weeklyMuscleSets(days, dayOrder);
          MUSCLES.forEach(m => {
            expect(vols[m] ?? 0, `${m} has no volume`).toBeGreaterThan(0);
            expect(vols[m], `${m} above MAV`).toBeLessThanOrEqual(MUSCLE_VOLUME[m].mav);
          });
        });
      });
    }
  }

  it('deduplicates repeated day types across the week (ppl6 two push days differ)', () => {
    const preset = SPLIT_PRESETS.find(p => p.id === 'ppl6')!;
    const { days } = buildProgramFromPreset(preset, 'progressive_overload');
    const push1 = days['ppl6_0'].exercises.map(ex => ex.id);
    const push2 = days['ppl6_3'].exercises.map(ex => ex.id);
    const overlap = push1.filter(id => push2.includes(id));
    expect(overlap).toEqual([]);
  });

  it('scratch prefill leaves every day empty', () => {
    const preset = SPLIT_PRESETS.find(p => p.id === 'upper_lower')!;
    const { days, dayOrder } = buildProgramFromPreset(preset, 'progressive_overload', 'scratch');
    dayOrder.forEach(k => expect(days[k].exercises.length).toBe(0));
  });
});

describe('buildCustomProgram', () => {
  it('builds days with cycling weekdays, defaulted labels, and empty exercise lists', () => {
    const { days, dayOrder } = buildCustomProgram([
      { label: 'Heavy Upper', kind: 'training' },
      { label: '', kind: 'rest' },
      { label: 'Lower', kind: 'training' }
    ]);
    expect(dayOrder).toEqual(['custom_0', 'custom_1', 'custom_2']);
    expect(days.custom_0.label).toBe('Heavy Upper');
    expect(days.custom_1.label).toBe('Day 2');
    expect(days.custom_1.kind).toBe('rest');
    expect(days.custom_0.dow).toBe('Monday');
    expect(days.custom_2.dow).toBe('Wednesday');
    dayOrder.forEach(k => expect(days[k].exercises).toEqual([]));
  });
});
