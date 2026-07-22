import type { AppState } from './types';
import {
  completedWorkoutCount, lifetimeVolumeKg, bestEverStreak, cleanWeekCount, totalPRCount,
  distinctExercisesLoggedCount, distinctMusclesTrainedCount, hasLoggedTimeExercise, customExerciseCount,
  totalTrainingMinutes, bestSessionVolumeKg, fmtWeight
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

// ---------------------------------------------------------------------------------------------
// Tier design: the goal is that a lifter clears *something* most sessions, not that they wait
// weeks between rewards. Two things make that work:
//   1. Rungs are dense low down and only stretch out once the numbers get genuinely impressive —
//      early gaps of 1-2 sessions, not 15.
//   2. Several families are driven by metrics that move on *every* completed workout regardless of
//      how it went: total volume, total training time, and session count. Even a mediocre session
//      pushes those forward, so there's nearly always a bar close enough to cross.
// Every metric here must stay monotonically non-decreasing (see the note above the helpers in
// state/logic.ts) — nothing may ever un-earn a badge.
// ---------------------------------------------------------------------------------------------

const bool = (fn: (state: AppState) => boolean) => (state: AppState) => (fn(state) ? 1 : 0);

// Volume thresholds are round numbers *in the user's own unit* (2,000 lb / 1,000 kg …) rather than
// one kg number converted into an odd lb figure. lifetimeVolumeKg is always kg, so we compare
// against the kg-equivalent of the display unit's round number.
const vol = (kg: number, lb: number) => (state: AppState) => (state.units === 'lb' ? lb / 2.20462 : kg);
const volFmt = (v: number, state: AppState) => fmtWeight(v, state.units);
const minsFmt = (v: number) => {
  const m = Math.max(0, Math.round(v));
  if (m < 60) return m + ' min';
  const h = m / 60;
  return (Number.isInteger(h) ? h : Math.round(h * 10) / 10) + ' hr';
};

export const ACHIEVEMENT_FAMILIES: AchievementFamily[] = [
  // ---------- consistency & streaks ----------
  {
    id: 'streak', title: 'Streak', category: 'consistency', icon: '🔥', metric: bestEverStreak, noun: 'in a row',
    tiers: [
      { threshold: 2, points: 10, name: 'Back-to-Back' },
      { threshold: 3, points: 20, name: 'On a Roll' },
      { threshold: 5, points: 35, name: 'High Five' },
      { threshold: 7, points: 55, name: 'Week Warrior' },
      { threshold: 10, points: 80, name: 'Perfect Ten' },
      { threshold: 14, points: 120, name: 'Fortnight' },
      { threshold: 21, points: 180, name: 'Three Weeks Straight' },
      { threshold: 30, points: 280, name: 'Unbroken' },
      { threshold: 45, points: 420, name: 'Ironclad' },
      { threshold: 60, points: 600, name: 'Relentless' },
      { threshold: 100, points: 1000, name: 'Unstoppable' }
    ]
  },
  {
    id: 'clean-weeks', title: 'Clean Weeks', category: 'consistency', icon: '✅', metric: cleanWeekCount, noun: 'clean weeks',
    tiers: [
      { threshold: 1, points: 25, name: 'Clean Week' },
      { threshold: 2, points: 40, name: 'Two in a Row' },
      { threshold: 4, points: 80, name: 'Clean Month' },
      { threshold: 8, points: 140, name: 'Two Clean Months' },
      { threshold: 12, points: 210, name: 'Clean Quarter' },
      { threshold: 20, points: 330, name: 'Consistent' },
      { threshold: 26, points: 440, name: 'Half-Year Clean' },
      { threshold: 40, points: 650, name: 'Dedicated' },
      { threshold: 52, points: 850, name: 'Spotless Year' }
    ]
  },

  // ---------- personal records ----------
  {
    id: 'prs', title: 'Personal Records', category: 'records', icon: '🏆', metric: totalPRCount, noun: 'PRs',
    tiers: [
      { threshold: 1, points: 15, name: 'First PR' },
      { threshold: 3, points: 25, name: 'Breaking Through' },
      { threshold: 5, points: 40, name: 'Record Setter' },
      { threshold: 10, points: 60, name: 'Record Breaker' },
      { threshold: 15, points: 85, name: 'On Fire' },
      { threshold: 20, points: 105, name: 'Momentum' },
      { threshold: 30, points: 145, name: 'Record Collector' },
      { threshold: 40, points: 190, name: 'Relentless Progress' },
      { threshold: 50, points: 240, name: 'Fifty Records' },
      { threshold: 60, points: 290, name: 'PR Machine' },
      { threshold: 80, points: 370, name: 'Prolific' },
      { threshold: 100, points: 460, name: 'PR Legend' },
      { threshold: 150, points: 650, name: 'Untouchable' },
      { threshold: 250, points: 1000, name: 'Record Dynasty' }
    ]
  },
  {
    // A max, not a total: "beat your best single day". Very beatable while still adding weight or
    // sets, which makes it one of the easier things to clear in an ordinary session.
    id: 'best-session', title: 'Biggest Session', category: 'records', icon: '💥', metric: bestSessionVolumeKg, noun: '', formatValue: volFmt,
    tiers: [
      { threshold: vol(1000, 2000), points: 20, name: 'Solid Session' },
      { threshold: vol(2000, 4000), points: 35, name: 'Big Day' },
      { threshold: vol(3000, 6000), points: 50, name: 'Heavy Hitter' },
      { threshold: vol(4000, 8000), points: 65, name: 'Strong Showing' },
      { threshold: vol(5000, 10000), points: 85, name: 'Huge Session' },
      { threshold: vol(6500, 13000), points: 110, name: 'Powerhouse' },
      { threshold: vol(8000, 16000), points: 140, name: 'Monster Day' },
      { threshold: vol(10000, 20000), points: 180, name: 'Titan Session' },
      { threshold: vol(12500, 25000), points: 230, name: 'Immense' },
      { threshold: vol(15000, 30000), points: 280, name: 'Colossal' },
      { threshold: vol(20000, 40000), points: 380, name: 'Earth Mover' },
      { threshold: vol(30000, 60000), points: 520, name: 'Legendary Day' }
    ]
  },

  // ---------- volume & totals ----------
  {
    id: 'workouts', title: 'Workouts', category: 'volume', icon: '📅', metric: completedWorkoutCount, noun: 'workouts',
    tiers: [
      { threshold: 1, points: 10, name: 'First Step' },
      { threshold: 2, points: 12, name: 'Back Again' },
      { threshold: 3, points: 15, name: 'Getting Going' },
      { threshold: 5, points: 20, name: 'Warmed Up' },
      { threshold: 8, points: 26, name: 'Building the Habit' },
      { threshold: 10, points: 32, name: 'Ten Sessions' },
      { threshold: 15, points: 42, name: 'Regular' },
      { threshold: 20, points: 55, name: 'Committed' },
      { threshold: 25, points: 70, name: 'Quarter Century' },
      { threshold: 30, points: 85, name: 'Thirty Deep' },
      { threshold: 40, points: 105, name: 'Locked In' },
      { threshold: 50, points: 135, name: 'Half Century' },
      { threshold: 65, points: 175, name: 'Grinder' },
      { threshold: 80, points: 215, name: 'Relentless' },
      { threshold: 100, points: 270, name: 'Century' },
      { threshold: 125, points: 330, name: 'Seasoned' },
      { threshold: 150, points: 390, name: 'Veteran' },
      { threshold: 200, points: 500, name: 'Double Century' },
      { threshold: 250, points: 600, name: 'Double Ton' },
      { threshold: 350, points: 780, name: 'Iron Habit' },
      { threshold: 500, points: 1000, name: 'Iron Will' }
    ]
  },
  {
    id: 'volume', title: 'Lifetime Volume', category: 'volume', icon: '🏋', metric: lifetimeVolumeKg, noun: '', formatValue: volFmt,
    tiers: [
      { threshold: vol(1000, 2000), points: 30, name: 'First Tonne' },
      { threshold: vol(2500, 5000), points: 42, name: 'Picking It Up' },
      { threshold: vol(5000, 10000), points: 58, name: 'Five Tonnes' },
      { threshold: vol(7500, 15000), points: 72, name: 'Building Up' },
      { threshold: vol(10000, 20000), points: 90, name: 'Ten Tonnes' },
      { threshold: vol(15000, 30000), points: 110, name: 'Fifteen Tonnes' },
      { threshold: vol(20000, 40000), points: 135, name: 'Twenty Tonnes' },
      { threshold: vol(27500, 55000), points: 160, name: 'Stacking Plates' },
      { threshold: vol(35000, 75000), points: 190, name: 'Piling It On' },
      { threshold: vol(45000, 90000), points: 220, name: 'Forty-Five Tonnes' },
      { threshold: vol(60000, 120000), points: 260, name: 'Sixty Tonnes' },
      { threshold: vol(75000, 150000), points: 305, name: 'Serious Tonnage' },
      { threshold: vol(90000, 180000), points: 355, name: 'Ninety Tonnes' },
      { threshold: vol(110000, 220000), points: 410, name: 'Hundred-Plus' },
      { threshold: vol(140000, 280000), points: 480, name: 'Freight Class' },
      { threshold: vol(175000, 350000), points: 560, name: 'Heavy Freight' },
      { threshold: vol(215000, 430000), points: 650, name: 'Closing on a Quarter' },
      { threshold: vol(250000, 500000), points: 760, name: 'Quarter Million' },
      { threshold: vol(350000, 700000), points: 900, name: 'Third of a Million' },
      { threshold: vol(500000, 1000000), points: 1150, name: 'Half a Million' },
      { threshold: vol(750000, 1500000), points: 1450, name: 'Three Quarters' },
      { threshold: vol(1000000, 2000000), points: 1900, name: 'Millionaire' }
    ]
  },
  {
    id: 'training-time', title: 'Time Under the Bar', category: 'volume', icon: '⏳', metric: totalTrainingMinutes, noun: '', formatValue: (v) => minsFmt(v),
    tiers: [
      { threshold: 30, points: 15, name: 'Half an Hour' },
      { threshold: 60, points: 25, name: 'First Hour' },
      { threshold: 120, points: 35, name: 'Two Hours' },
      { threshold: 180, points: 48, name: 'Three Hours' },
      { threshold: 300, points: 62, name: 'Five Hours' },
      { threshold: 420, points: 78, name: 'Seven Hours' },
      { threshold: 600, points: 95, name: 'Ten Hours' },
      { threshold: 840, points: 115, name: 'Fourteen Hours' },
      { threshold: 1080, points: 135, name: 'Eighteen Hours' },
      { threshold: 1440, points: 160, name: 'A Full Day' },
      { threshold: 1800, points: 190, name: 'Thirty Hours' },
      { threshold: 2400, points: 225, name: 'Forty Hours' },
      { threshold: 3000, points: 265, name: 'Fifty Hours' },
      { threshold: 4200, points: 320, name: 'Seventy Hours' },
      { threshold: 6000, points: 390, name: 'Hundred Hours' },
      { threshold: 9000, points: 480, name: 'Hundred Fifty Hours' },
      { threshold: 12000, points: 600, name: 'Two Hundred Hours' }
    ]
  },

  // ---------- variety & exploration ----------
  {
    id: 'variety', title: 'Exercise Variety', category: 'variety', icon: '🧭', metric: distinctExercisesLoggedCount, noun: 'exercises',
    tiers: [
      { threshold: 3, points: 15, name: 'Trying Things' },
      { threshold: 5, points: 25, name: 'Explorer' },
      { threshold: 10, points: 45, name: 'Branching Out' },
      { threshold: 15, points: 70, name: 'Well-Rounded' },
      { threshold: 20, points: 100, name: 'Broad Base' },
      { threshold: 30, points: 150, name: 'Versatile' },
      { threshold: 40, points: 220, name: 'Deep Bench' },
      { threshold: 50, points: 300, name: 'Encyclopedic' },
      { threshold: 75, points: 450, name: 'Completionist' }
    ]
  },
  {
    id: 'full-body', title: 'Full Body', category: 'variety', icon: '💪', metric: distinctMusclesTrainedCount, noun: 'muscle groups',
    // Thresholds are pinned at the values from when the taxonomy had 11 muscles, NOT derived from
    // ALL_MUSCLES: unlock state is recomputed every render, so raising the top tier to 12 when
    // Forearms was added (phase 32) would have silently re-locked the badge for anyone who'd
    // already earned it at 11 — the one thing the monotonicity rule above forbids. The cost is
    // that "Full Body" is now earnable without ever training forearms directly, which is the
    // right trade; if another muscle is ever added, leave these pinned for the same reason.
    tiers: [
      { threshold: 3, points: 15, name: 'Covering Ground' },
      { threshold: 6, points: 30, name: 'Half Covered' },
      { threshold: 11, points: 70, name: 'Full Body' }
    ]
  },
  {
    id: 'custom', title: 'Custom Creator', category: 'variety', icon: '✏️', metric: customExerciseCount, noun: 'custom exercises',
    tiers: [
      { threshold: 1, points: 20, name: 'Custom Creator' },
      { threshold: 3, points: 45, name: 'Tinkerer' },
      { threshold: 5, points: 80, name: 'Architect' },
      { threshold: 10, points: 150, name: 'Library Builder' }
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
