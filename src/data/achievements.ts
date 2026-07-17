import type { AppState } from './types';
import { MUSCLE_TARGETS } from './exercises';
import {
  completedWorkoutCount, lifetimeVolumeKg, bestEverStreak, cleanWeekCount, totalPRCount,
  distinctExercisesLoggedCount, distinctMusclesTrainedCount, hasLoggedTimeExercise, customExerciseCount,
  fmtWeight
} from '../state/logic';

export type AchievementCategory = 'consistency' | 'records' | 'volume' | 'variety';

export interface Achievement {
  id: string;
  name: string;
  category: AchievementCategory;
  icon: string;
  points: number;
  description: string;
  // current progress and the threshold to unlock at — kept as plain numbers (not a boolean) so the
  // UI can show a progress bar on locked achievements too, not just a lock icon.
  metric: (state: AppState) => number;
  target: number;
  // overrides the plain "current/target" progress label for achievements where the raw numbers
  // need unit conversion (volume) rather than being displayed as-is (counts).
  formatProgress?: (current: number, target: number, state: AppState) => string;
}

const bool = (fn: (state: AppState) => boolean) => (state: AppState) => (fn(state) ? 1 : 0);

export const ACHIEVEMENTS: Achievement[] = [
  // ---------- consistency & streaks ----------
  {
    id: 'first-step', name: 'First Step', category: 'consistency', icon: '🎯', points: 10,
    description: 'Complete your first workout.', metric: completedWorkoutCount, target: 1
  },
  {
    id: 'streak-3', name: '3-Day Streak', category: 'consistency', icon: '🔥', points: 25,
    description: 'Complete 3 sessions in a row without a skip.', metric: bestEverStreak, target: 3
  },
  {
    id: 'streak-7', name: '7-Day Streak', category: 'consistency', icon: '🔥', points: 60,
    description: 'Complete 7 sessions in a row without a skip.', metric: bestEverStreak, target: 7
  },
  {
    id: 'streak-14', name: 'Two-Week Streak', category: 'consistency', icon: '🔥', points: 150,
    description: 'Complete 14 sessions in a row without a skip.', metric: bestEverStreak, target: 14
  },
  {
    id: 'clean-week-1', name: 'Clean Week', category: 'consistency', icon: '✅', points: 30,
    description: 'Finish a week with nothing marked skipped.', metric: cleanWeekCount, target: 1
  },
  {
    id: 'clean-week-4', name: 'Four Clean Weeks', category: 'consistency', icon: '✅', points: 100,
    description: 'Finish 4 separate weeks with nothing marked skipped.', metric: cleanWeekCount, target: 4
  },

  // ---------- personal records ----------
  {
    id: 'pr-1', name: 'First PR', category: 'records', icon: '🏆', points: 15,
    description: 'Log your first personal record.', metric: totalPRCount, target: 1
  },
  {
    id: 'pr-10', name: 'Record Breaker', category: 'records', icon: '🏆', points: 50,
    description: 'Log 10 personal records total.', metric: totalPRCount, target: 10
  },
  {
    id: 'pr-25', name: 'Record Collector', category: 'records', icon: '🏆', points: 120,
    description: 'Log 25 personal records total.', metric: totalPRCount, target: 25
  },
  {
    id: 'pr-50', name: 'PR Machine', category: 'records', icon: '🏆', points: 200,
    description: 'Log 50 personal records total.', metric: totalPRCount, target: 50
  },

  // ---------- volume & totals ----------
  {
    id: 'sessions-10', name: 'Ten Sessions', category: 'volume', icon: '📅', points: 30,
    description: 'Complete 10 workouts total.', metric: completedWorkoutCount, target: 10
  },
  {
    id: 'sessions-25', name: 'Quarter Century', category: 'volume', icon: '📅', points: 75,
    description: 'Complete 25 workouts total.', metric: completedWorkoutCount, target: 25
  },
  {
    id: 'sessions-50', name: 'Half Century', category: 'volume', icon: '📅', points: 150,
    description: 'Complete 50 workouts total.', metric: completedWorkoutCount, target: 50
  },
  {
    id: 'sessions-100', name: 'Century', category: 'volume', icon: '📅', points: 300,
    description: 'Complete 100 workouts total.', metric: completedWorkoutCount, target: 100
  },
  {
    id: 'volume-1000', name: 'Ton Lifted', category: 'volume', icon: '🏋', points: 40,
    description: 'Lift a cumulative 1,000 kg across every session.', metric: lifetimeVolumeKg, target: 1000,
    formatProgress: (current, target, state) => `${fmtWeight(current, state.units)} / ${fmtWeight(target, state.units)}`
  },
  {
    id: 'volume-10000', name: 'Ten Tonnes', category: 'volume', icon: '🏋', points: 150,
    description: 'Lift a cumulative 10,000 kg across every session.', metric: lifetimeVolumeKg, target: 10000,
    formatProgress: (current, target, state) => `${fmtWeight(current, state.units)} / ${fmtWeight(target, state.units)}`
  },
  {
    id: 'volume-50000', name: 'Fifty Tonnes', category: 'volume', icon: '🏋', points: 350,
    description: 'Lift a cumulative 50,000 kg across every session.', metric: lifetimeVolumeKg, target: 50000,
    formatProgress: (current, target, state) => `${fmtWeight(current, state.units)} / ${fmtWeight(target, state.units)}`
  },

  // ---------- variety & exploration ----------
  {
    id: 'variety-5', name: 'Explorer', category: 'variety', icon: '🧭', points: 20,
    description: 'Log at least one set on 5 different exercises.', metric: distinctExercisesLoggedCount, target: 5
  },
  {
    id: 'variety-15', name: 'Well-Rounded', category: 'variety', icon: '🧭', points: 60,
    description: 'Log at least one set on 15 different exercises.', metric: distinctExercisesLoggedCount, target: 15
  },
  {
    id: 'full-body', name: 'Full Body', category: 'variety', icon: '💪', points: 50,
    description: 'Train every muscle group at least once.', metric: distinctMusclesTrainedCount,
    target: Object.keys(MUSCLE_TARGETS).length
  },
  {
    id: 'custom-creator', name: 'Custom Creator', category: 'variety', icon: '✏️', points: 25,
    description: 'Add a custom exercise to your library.', metric: customExerciseCount, target: 1
  },
  {
    id: 'time-under-tension', name: 'Time Under Tension', category: 'variety', icon: '⏱', points: 15,
    description: 'Log a set on a time-tracked exercise (like a plank).', metric: bool(hasLoggedTimeExercise), target: 1
  }
];

export const CATEGORY_LABELS: Record<AchievementCategory, string> = {
  consistency: 'Consistency & Streaks', records: 'Personal Records', volume: 'Volume & Totals', variety: 'Variety & Exploration'
};

export const TOTAL_POSSIBLE_POINTS = ACHIEVEMENTS.reduce((sum, a) => sum + a.points, 0);
