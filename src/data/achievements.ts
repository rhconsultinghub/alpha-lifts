import type { AppState } from './types';
import { MUSCLE_TARGETS } from './exercises';
import {
  completedWorkoutCount, lifetimeVolumeKg, bestEverStreak, cleanWeekCount, totalPRCount,
  distinctExercisesLoggedCount, distinctMusclesTrainedCount, hasLoggedTimeExercise, customExerciseCount,
  fmtWeight
} from '../state/logic';

export type AchievementCategory = 'consistency' | 'records' | 'volume' | 'variety';

// A single rung of a badge family. The badge as a whole is never "done" until every tier is
// reached, so there's always a next target to chase (the whole point of tiering these — see
// viewModel's achievementsVM for how the current tier / next tier / progress are derived).
export interface AchievementTier {
  // number, or a function of state for tiers whose threshold depends on the unit setting (volume).
  threshold: number | ((state: AppState) => number);
  points: number;
  name: string;
}

export interface AchievementFamily {
  id: string;
  title: string;
  category: AchievementCategory;
  icon: string;
  metric: (state: AppState) => number;
  tiers: AchievementTier[];        // strictly ascending by threshold
  noun: string;                    // for progress text, e.g. "50 / 100 workouts"
  // overrides raw-number formatting of the metric/threshold in progress text (volume -> "1,250 kg").
  formatValue?: (v: number, state: AppState) => string;
}

const bool = (fn: (state: AppState) => boolean) => (state: AppState) => (fn(state) ? 1 : 0);
const ALL_MUSCLES = Object.keys(MUSCLE_TARGETS).length;

// Volume thresholds are round numbers *in the user's own unit* (2,000 lb / 1,000 kg …) rather than
// one kg number converted into an odd lb figure. lifetimeVolumeKg is always kg, so we compare
// against the kg-equivalent of the display unit's round number.
const vol = (kg: number, lb: number) => (state: AppState) => (state.units === 'lb' ? lb / 2.20462 : kg);
const volFmt = (v: number, state: AppState) => fmtWeight(v, state.units);

export const ACHIEVEMENT_FAMILIES: AchievementFamily[] = [
  // ---------- consistency & streaks ----------
  {
    id: 'streak', title: 'Streak', category: 'consistency', icon: '🔥', metric: bestEverStreak, noun: 'in a row',
    tiers: [
      { threshold: 3, points: 25, name: 'On a Roll' },
      { threshold: 7, points: 60, name: 'Week Warrior' },
      { threshold: 14, points: 130, name: 'Fortnight' },
      { threshold: 30, points: 300, name: 'Unbroken' },
      { threshold: 60, points: 600, name: 'Relentless' }
    ]
  },
  {
    id: 'clean-weeks', title: 'Clean Weeks', category: 'consistency', icon: '✅', metric: cleanWeekCount, noun: 'clean weeks',
    tiers: [
      { threshold: 1, points: 30, name: 'Clean Week' },
      { threshold: 4, points: 90, name: 'Clean Month' },
      { threshold: 12, points: 220, name: 'Clean Quarter' },
      { threshold: 26, points: 450, name: 'Half-Year Clean' },
      { threshold: 52, points: 800, name: 'Spotless Year' }
    ]
  },

  // ---------- personal records ----------
  {
    id: 'prs', title: 'Personal Records', category: 'records', icon: '🏆', metric: totalPRCount, noun: 'PRs',
    tiers: [
      { threshold: 1, points: 15, name: 'First PR' },
      { threshold: 10, points: 50, name: 'Record Breaker' },
      { threshold: 25, points: 120, name: 'Record Collector' },
      { threshold: 50, points: 220, name: 'PR Machine' },
      { threshold: 100, points: 450, name: 'PR Legend' }
    ]
  },

  // ---------- volume & totals ----------
  {
    id: 'workouts', title: 'Workouts', category: 'volume', icon: '📅', metric: completedWorkoutCount, noun: 'workouts',
    tiers: [
      { threshold: 1, points: 10, name: 'First Step' },
      { threshold: 10, points: 25, name: 'Ten Sessions' },
      { threshold: 25, points: 60, name: 'Quarter Century' },
      { threshold: 50, points: 120, name: 'Half Century' },
      { threshold: 100, points: 250, name: 'Century' },
      { threshold: 250, points: 500, name: 'Double Ton' },
      { threshold: 500, points: 900, name: 'Iron Will' }
    ]
  },
  {
    id: 'volume', title: 'Lifetime Volume', category: 'volume', icon: '🏋', metric: lifetimeVolumeKg, noun: '', formatValue: volFmt,
    tiers: [
      { threshold: vol(1000, 2000), points: 40, name: 'Ton Lifted' },
      { threshold: vol(10000, 20000), points: 150, name: 'Ten Tonnes' },
      { threshold: vol(50000, 100000), points: 350, name: 'Fifty Tonnes' },
      { threshold: vol(100000, 200000), points: 600, name: 'Hundred Tonnes' },
      { threshold: vol(250000, 500000), points: 1000, name: 'Quarter Million' }
    ]
  },

  // ---------- variety & exploration ----------
  {
    id: 'variety', title: 'Exercise Variety', category: 'variety', icon: '🧭', metric: distinctExercisesLoggedCount, noun: 'exercises',
    tiers: [
      { threshold: 5, points: 20, name: 'Explorer' },
      { threshold: 15, points: 60, name: 'Well-Rounded' },
      { threshold: 30, points: 130, name: 'Versatile' },
      { threshold: 50, points: 250, name: 'Encyclopedic' }
    ]
  },
  {
    id: 'full-body', title: 'Full Body', category: 'variety', icon: '💪', metric: distinctMusclesTrainedCount, noun: 'muscle groups',
    tiers: [
      { threshold: Math.ceil(ALL_MUSCLES / 2), points: 25, name: 'Half Covered' },
      { threshold: ALL_MUSCLES, points: 50, name: 'Full Body' }
    ]
  },
  {
    id: 'custom', title: 'Custom Creator', category: 'variety', icon: '✏️', metric: customExerciseCount, noun: 'custom exercises',
    tiers: [
      { threshold: 1, points: 25, name: 'Custom Creator' },
      { threshold: 3, points: 60, name: 'Tinkerer' },
      { threshold: 5, points: 110, name: 'Architect' }
    ]
  },
  {
    id: 'time-tension', title: 'Time Under Tension', category: 'variety', icon: '⏱', metric: bool(hasLoggedTimeExercise), noun: '',
    tiers: [
      { threshold: 1, points: 15, name: 'Time Under Tension' }
    ]
  }
];

export const CATEGORY_LABELS: Record<AchievementCategory, string> = {
  consistency: 'Consistency & Streaks', records: 'Personal Records', volume: 'Volume & Totals', variety: 'Variety & Exploration'
};

export const TOTAL_POSSIBLE_POINTS = ACHIEVEMENT_FAMILIES.reduce((sum, f) => sum + f.tiers.reduce((s, t) => s + t.points, 0), 0);
export const TOTAL_TIERS = ACHIEVEMENT_FAMILIES.reduce((sum, f) => sum + f.tiers.length, 0);
