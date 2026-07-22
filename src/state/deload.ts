import type { AppState, TrainingType, ExerciseHistoryEntry } from '../data/types';
import { deloadSuggestion } from './logic';

// ---------------------------------------------------------------------------
// Auto deload weeks (opt-in, AppState.deloadEnabled).
//
// **Trigger-based, not time-based.** A deload is proposed when the training data
// says you've accumulated fatigue — lifts gone flat, sets ending at failure,
// session volume sliding — not because N weeks happened to elapse. The reactive
// half of the app's deload story (deloadSuggestion() in logic.ts) reads the same
// plateau signal and shows a dismissible banner; this module is the half that
// can actually act on it, cutting the working weights for a whole week.
//
// The week count survives only as a *backstop*: a far-out ceiling (8-12 trained
// weeks) so someone whose signals never trip — training deliberately submaximal,
// never logging RIR — still gets a recovery week eventually rather than never.
// It is the exception, not the schedule; on a normal block the fatigue triggers
// fire first and the backstop clock never runs out.
//
// Design notes, in keeping with the rest of this codebase:
//  - The *plan* is derived fresh from state every render (same store-nothing
//    approach as data/achievements.ts). Only the few facts that genuinely can't
//    be recomputed are persisted: whether the feature is on, the user's
//    intensity/backstop preferences, which week is currently designated a deload,
//    and the anchor/defer bookkeeping that records the user's own choices.
//  - Weeks here are AppState.weekNumber, which advances on actual completion of
//    every training day rather than on calendar time (see isWeekComplete()), so
//    both the backstop and the "settle in before triggering" minimum below count
//    weeks of training actually done, not weeks elapsed while the app sat
//    unopened. That's the right unit for fatigue.
// ---------------------------------------------------------------------------

// Backstop ceiling in trained weeks, by training type — the longest this feature
// will let you go with no deload at all when nothing ever trips a trigger.
// Heavier/closer-to-failure styles accumulate systemic fatigue faster and so cap
// out sooner; endurance and general fitness work sits far enough from failure
// that forcing a light week is more likely to cost progress than recover it.
// These are deliberately roughly double the old cadence values: a schedule that
// fires routinely wants 4-6 weeks, a ceiling that should almost never be the
// reason you deload wants to sit well past where a real signal would have fired.
export const DELOAD_BACKSTOP_WEEKS: Record<TrainingType, number> = {
  strength: 8,
  hit: 8,
  progressive_overload: 9,
  general: 12,
  endurance: 12
};

// Minimum trained weeks since the last deload before the fatigue signals are
// allowed to fire. Without this, one bad session (a cold day, a poor night's
// sleep) could trigger a deload immediately, which is noise rather than fatigue.
// It doubles as the refractory period after a deload actually runs: the plateau
// read excludes deload entries, so a lift that was flat going into a deload is
// still flat coming out of one, and without a floor here the app would propose a
// second deload the week after the first ended.
const MIN_WEEKS_BEFORE_TRIGGER = 2;

// A tripped trigger needs a total score of at least this much. Weighted so that
// either single *strong* signal clears it alone (see fatigueRead) — with no
// schedule doing the work any more, requiring two signals to agree would leave a
// genuinely stalled lifter waiting on the backstop.
const TRIGGER_THRESHOLD = 0.6;

// How long "Skip this one" suppresses the triggers for. Skipping used to just
// reset the cadence clock, which is meaningless now — the signals that fired are
// still true next week, so without a suppression window the same banner would
// return immediately and "skip" would read as "ask me again in seven days".
export const SKIP_SUPPRESS_WEEKS = 3;

// Floor on the pinned value. deloadCadenceWeeks is persisted from when this
// setting was a cadence and offered 3/4/5, and a 3-week ceiling would fire before
// the signals ever got a chance to — reinstating the schedule this change exists
// to remove. Clamping is the whole migration: an old pin becomes the shortest
// backstop the picker now offers, and the settings UI shows it selected there.
const MIN_BACKSTOP_WEEKS = 6;

export function backstopFor(state: AppState): number {
  const pinned = state.deloadCadenceWeeks;
  if (pinned !== null) return Math.max(MIN_BACKSTOP_WEEKS, pinned);
  return DELOAD_BACKSTOP_WEEKS[state.trainingType] ?? 9;
}

// History entries logged during a deload week are deliberately excluded from
// anything that reads "how strong are you / are you progressing": they're light
// by design, so counting them would make a deload look like a plateau or a
// regression and would have the next week's overload prompt build up from 60%.
export function isDeloadEntry(e: ExerciseHistoryEntry): boolean {
  return e.deload === true;
}

export interface FatigueRead {
  score: number;        // 0..1, how much the signals argue for a deload now
  reasons: string[];    // human-readable, shown in the banner
}

// Three independent reads, deliberately kept simple and each derived from data
// the app already has. The first two are each strong enough to trigger a deload
// on their own — a plateau across your compounds, or sets that have stopped
// leaving anything in reserve, is on its own the thing a deload exists to fix.
// The third (volume sliding) is corroborating only: it moves for plenty of
// innocent reasons (a shorter session, a swapped exercise), so it's scored to
// tip a borderline read over the line rather than to fire by itself.
export function fatigueRead(state: AppState): FatigueRead {
  const reasons: string[] = [];
  let score = 0;

  // 1. Plateaued compounds — reuse the existing reactive detector rather than
  //    writing a second, subtly-different plateau rule.
  const plateau = deloadSuggestion(state);
  if (plateau.show) {
    score += 0.6;
    reasons.push(plateau.names.length > 1
      ? plateau.names.slice(0, 3).join(', ') + ' have gone flat'
      : plateau.names[0] + ' has gone flat');
  }

  // 2. Grinding — recent sets logged at RIR 0-1 mean the user is finishing at or
  //    near true failure most of the time, which is the single clearest sign
  //    that load has outrun recovery, and fires on its own. An average between
  //    1 and 1.5 is softer evidence — closer to failure than a sustainable block
  //    wants to sit, but not damning by itself — so it scores as a corroborator
  //    like signal 3 rather than a trigger. Only counts when they actually log
  //    RIR; an unlogged RIR is unknown, not zero.
  const recentRirs: number[] = [];
  Object.values(state.exerciseHistory).forEach(entries => {
    entries.slice(-2).forEach(e => {
      if (isDeloadEntry(e)) return;
      (e.sets || []).forEach(r => { if (typeof r.rir === 'number') recentRirs.push(r.rir); });
    });
  });
  if (recentRirs.length >= 6) {
    const avg = recentRirs.reduce((a, b) => a + b, 0) / recentRirs.length;
    if (avg <= 1) {
      score += 0.6;
      reasons.push('most recent sets are ending at or near failure');
    } else if (avg <= 1.5) {
      score += 0.35;
      reasons.push('your sets are leaving very little in reserve');
    }
  }

  // 3. Session volume trending down — compare the mean volume of the last three
  //    completed sessions against the three before them. A real drop means the
  //    user is doing less work than they were, which (unlike a flat top set) is
  //    a whole-session read rather than a single-lift one.
  const completed = state.history.filter(h => h.status === 'completed' && h.volumeKg > 0);
  if (completed.length >= 6) {
    // state.history is newest-first (entries are unshifted onto the front).
    const recent = completed.slice(0, 3);
    const prior = completed.slice(3, 6);
    const mean = (xs: typeof completed) => xs.reduce((a, h) => a + h.volumeKg, 0) / xs.length;
    if (mean(recent) < mean(prior) * 0.92) {
      score += 0.35;
      reasons.push('session volume is trending down');
    }
  }

  return { score: Math.min(1, score), reasons };
}

export interface DeloadPlan {
  enabled: boolean;
  /** Trained weeks the backstop allows before forcing a deload with no signal. */
  backstopWeeks: number;
  /** The week currently being run as a deload, if any. */
  activeWeek: number | null;
  isActive: boolean;
  /** Working-weight multiplier to apply while active (0.5–0.8). */
  pct: number;
  /** True when a deload should start (or should have started) now. */
  isDue: boolean;
  /** What made it due: the fatigue signals, or the backstop running out. */
  trigger: 'fatigue' | 'backstop' | null;
  reasons: string[];
  /** Latest fatigue read — surfaced even when it hasn't tripped, so Settings can
   *  say "nothing's flagging right now" rather than only counting down. */
  fatigue: FatigueRead;
  /** Fraction of the way to tripping, 0..1, for the Settings readout. */
  fatiguePct: number;
  /** True while the triggers are held off (too soon after the last deload, or
   *  the user skipped/pushed back) — the readout means something different then. */
  suppressed: boolean;
  /** First week the triggers are allowed to fire again — what `suppressed` is waiting on. */
  watchingFromWeek: number;
  /** Week the backstop would force one, if nothing trips before then. */
  backstopWeek: number;
  weeksUntilBackstop: number;
  weeksSinceLast: number;
  lastDeloadWeek: number | null;
}

export function deloadPlan(state: AppState): DeloadPlan {
  const backstopWeeks = backstopFor(state);
  const pct = Math.min(0.8, Math.max(0.5, state.deloadIntensityPct / 100));
  const lastDeloadWeek = state.deloadHistory.length ? state.deloadHistory[state.deloadHistory.length - 1].week : null;
  const anchor = state.deloadAnchorWeek;
  const weeksSinceLast = Math.max(0, state.weekNumber - anchor);
  const activeWeek = state.deloadActiveWeek;
  const isActive = state.deloadEnabled && activeWeek === state.weekNumber;
  const deferred = state.deloadDeferUntilWeek !== null && state.weekNumber < state.deloadDeferUntilWeek;
  const tooSoon = weeksSinceLast < MIN_WEEKS_BEFORE_TRIGGER;
  // Reading fatigue unconditionally (rather than only when it's allowed to fire)
  // costs nothing — it's a pure read over history the app already has — and lets
  // Settings show the user what the app is actually watching in a normal week.
  const fatigue = fatigueRead(state);

  const base: DeloadPlan = {
    enabled: state.deloadEnabled, backstopWeeks, activeWeek, isActive, pct,
    isDue: false, trigger: null, reasons: [],
    fatigue, fatiguePct: Math.min(1, fatigue.score / TRIGGER_THRESHOLD),
    suppressed: deferred || tooSoon,
    watchingFromWeek: Math.max(anchor + MIN_WEEKS_BEFORE_TRIGGER, state.deloadDeferUntilWeek ?? 0),
    backstopWeek: anchor + backstopWeeks, weeksUntilBackstop: anchor + backstopWeeks - state.weekNumber,
    weeksSinceLast, lastDeloadWeek
  };
  if (!state.deloadEnabled || isActive) return base;

  // The user pushed this one back (or skipped it) — respect that until the week
  // they bought themselves, backstop included. Nothing proposes a deload here.
  if (deferred) {
    return { ...base, weeksUntilBackstop: Math.max(base.weeksUntilBackstop, state.deloadDeferUntilWeek! - state.weekNumber) };
  }

  // The trigger path — the ordinary way a deload happens now.
  if (!tooSoon && fatigue.score >= TRIGGER_THRESHOLD) {
    return { ...base, isDue: true, trigger: 'fatigue', reasons: fatigue.reasons };
  }

  // The backstop, which is expected never to be reached on a block where the
  // signals are doing their job. Deliberately checked second: if both would fire
  // in the same week, the honest thing to tell the user is *why* their training
  // says to deload, not that a counter ran out.
  if (state.weekNumber >= anchor + backstopWeeks) {
    return { ...base, isDue: true, trigger: 'backstop', reasons: ['you’ve trained ' + weeksSinceLast + ' weeks straight without a deload'] };
  }
  return base;
}

type DeloadFields = Pick<AppState,
  'deloadActiveWeek' | 'deloadAnchorWeek' | 'deloadDeferUntilWeek' | 'deloadHistory'>;

// Called from useApp's two week-rollover sites (completeWorkout and toggleSkipDay) with the week
// number the user is rolling *into*. Handles both halves of the transition: closing out a deload
// week that just finished, and opening one on the new week if it's now due.
//
// Deliberately evaluated at rollover rather than continuously: a deload has to apply to a whole
// week of training, so the only honest moment to designate one is the boundary. Designating it
// mid-week would cut the weights out from under a week the user was already partway through.
export function advanceDeloadForWeek(state: AppState, newWeek: number): DeloadFields {
  const fields: DeloadFields = {
    deloadActiveWeek: state.deloadActiveWeek,
    deloadAnchorWeek: state.deloadAnchorWeek,
    deloadDeferUntilWeek: state.deloadDeferUntilWeek,
    deloadHistory: state.deloadHistory
  };
  if (!state.deloadEnabled) return fields;

  // Closing out a deload week that just completed.
  if (state.deloadActiveWeek !== null && state.deloadActiveWeek < newWeek) {
    fields.deloadAnchorWeek = state.deloadActiveWeek;
    fields.deloadActiveWeek = null;
    fields.deloadDeferUntilWeek = null;
    // The reason was already recorded when the week was opened (see startDeload in useApp), so
    // there's nothing to append here — history is written at the start, not the end, so the
    // Settings status line can name the week you're currently in.
    return fields;
  }

  // Opening one on the new week if it's due.
  const probe: AppState = { ...state, ...fields, weekNumber: newWeek };
  const plan = deloadPlan(probe);
  if (plan.isDue) {
    fields.deloadActiveWeek = newWeek;
    fields.deloadDeferUntilWeek = null;
    fields.deloadHistory = [...state.deloadHistory, { week: newWeek, reason: plan.trigger === 'fatigue' ? 'fatigue' : 'backstop' }];
  }
  return fields;
}

/** Working-weight multiplier in force right now, or null when not deloading. */
export function activeDeloadPct(state: AppState): number | null {
  if (!state.deloadEnabled || state.deloadActiveWeek !== state.weekNumber) return null;
  return Math.min(0.8, Math.max(0.5, state.deloadIntensityPct / 100));
}

// Note: the actual per-exercise deloaded weight is computed inside recommendation()
// in logic.ts, not here — it needs the equipment increment to round to something
// loadable (60% of 102.5kg is 61.5kg, which no barbell can make), and logic.ts
// already owns that math. This module can't import it back without a cycle, since
// logic.ts is where deloadSuggestion() lives.
