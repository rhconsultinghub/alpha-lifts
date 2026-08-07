import { useCallback, useEffect, useRef, useState } from 'react';
import { EXLIB, EQUIP_CATALOG, MUSCLES, planRepDefault } from '../data/exercises';
import { mkEx, slugify } from '../data/program';
import { createInitialState, SCHEMA_VERSION } from '../data/initialState';
import { exportBackup as exportBackupFile, mergeBackupIntoDefaults, safeCustomEntries } from '../data/backup';
import { clearSyncMeta } from './syncMeta';
import { exportPlan as exportPlanFile } from '../data/planIO';
import { SPLIT_PRESETS, WEEKDAYS, buildProgramFromPreset, buildCustomProgram } from '../data/wizard';
import type {
  AppState, CoachChatMessage, CoachProposal, CoachProposalPayload, CoachVoice, ExerciseDef, ExerciseFormState, Muscle, ParsedPlan, ProgramDays, ProgramExercise, RestPacing, Screen,
  TrainingType, Units, WarmupStyle, WorkoutSetRow, WizardCustomDay
} from '../data/types';
import { askCoach, buildCoachContext, parseProposals, fetchCoachStatus, parsePlanText as parsePlanTextApi, invalidateExerciseNameCache, COACH_CONFIGURED, COACH_HISTORY_CAP } from './coach';
import { applyExerciseSwaps, type ExerciseSwap } from './onboarding';
import {
  recommendation, restForExercise, dayMuscleRanks, isWeekComplete, fmtWeight,
  nextIncompleteIndex, defaultCompareLiftIds, bestSetScore, effectiveLast
} from './logic';
import { activeDeloadPct, advanceDeloadForWeek, SKIP_SUPPRESS_WEEKS } from './deload';
import { vibrateRestEnd, playRestEndSound, notifyRestEnd, updateRestProgressNotification, clearRestProgressNotification } from './alerts';
import type { RestContext } from './alerts';
import { shouldFireReminder, fireReminder } from './reminders';

// Exported so the cloud-sync layer (sync.ts) reads/writes the exact same key — the whole app
// state is this one blob, and sync just mirrors it to the server.
export const STORAGE_KEY = 'fitness-app-state-v1';

// Short assistant-voice acknowledgement posted in the coach chat right after a proposal is
// applied, so an applied change reads as the coach confirming it rather than the card silently
// flipping to "✓ Applied". Reuses the proposal's own human summary; build_program gets a
// friendlier line since its summary is a long "this replaces your current program" sentence.
function coachAckText(prop: CoachProposal): string {
  if (prop.kind === 'build_program') return "Done — I've built your new plan. Take a look on the Program tab.";
  const s = prop.summary.replace(/\.$/, '');
  return `Done — ${s.charAt(0).toLowerCase()}${s.slice(1)}.`;
}

// Acknowledgement for an "Apply all" — one message covering every change that landed. Lists them
// rather than just counting, because this text is re-sent to the model as conversation history on
// the next turn, and "Done — 3 changes" would leave it guessing which three.
function coachAckAllText(props: CoachProposal[]): string {
  if (props.length === 1) return coachAckText(props[0]);
  const lines = props.map(p => `• ${p.summary.replace(/\.$/, '')}`).join('\n');
  return `Done — applied ${props.length} changes:\n${lines}`;
}

// One-shot backfill helper: recover set/rep counts from the display rows of a pre-counter session.
// A logged row's resultText is "<weight> × 8/8/6"; a skipped-within-session row is "N sets planned".
// Only the former contributes. Excludes any row whose reps look like plank seconds is impossible
// here (no trackingMode survives on the row), so this is the documented approximate case.
function countsFromResultText(rows: { resultText: string }[]): { setCount: number; repCount: number } {
  let setCount = 0, repCount = 0;
  for (const row of rows || []) {
    const m = /×\s*([\d/]+)/.exec(row.resultText || '');
    if (!m) continue;
    const reps = m[1].split('/').map(Number).filter(n => Number.isFinite(n));
    if (!reps.length) continue;
    setCount += reps.length;
    repCount += reps.reduce((a, n) => a + n, 0);
  }
  return { setCount, repCount };
}

// Ids bundled in exercises.ts, captured at module load — before any session customs are merged
// into the EXLIB singleton — so restore paths can refuse to overwrite a built-in exercise.
const BUILTIN_EXERCISE_IDS: ReadonlySet<string> = new Set(Object.keys(EXLIB));

// Set when loadInitial finds an unparseable persisted blob. The blob is stashed under a recovery
// key rather than silently overwritten; this flag surfaces a one-line notice in the UI.
let corruptStateStashed = false;

// ---------------------------------------------------------------------------------------------
// One-time schema migrations.
//
// The load path's baseline safety net is the shallow merge over createInitialState() — a NEW
// top-level field needs no migration at all. Migrations exist for everything the merge can't do:
// deriving a value from old data, backfilling nested rows, renaming/moving fields. Each blob
// records the highest migration it has been through (`schemaVersion`); anything below runs once
// and the blob is re-stamped. A blob with NO version (pre-framework, or pushed by an old client
// via cloud sync) reads as 0 and runs everything — so every migration must stay idempotent, the
// same property the old always-run inline checks relied on.
//
// To add one: append { to: SCHEMA_VERSION + 1, run } here and bump SCHEMA_VERSION in
// data/initialState.ts. `run` mutates `state` in place; `parsed` is the raw pre-merge blob for
// the cases where "field absent" and "field at its default" mean different things.
// Migrations run AFTER custom exercises are merged into EXLIB (some need library lookups).

interface Migration {
  to: number;
  run: (state: AppState, parsed: Partial<AppState>) => void;
}

const MIGRATIONS: Migration[] = [
  {
    // v1 bundles the four historical inline back-compat passes, now run-once instead of on
    // every single load:
    to: 1,
    run: (state, parsed) => {
      // (a) sessions saved before onboarding existed have no `onboarded` flag — infer it from
      // already having a real program, so returning users aren't sent back through the wizard.
      if (parsed.onboarded === undefined && parsed.dayOrder && parsed.dayOrder.length > 0) {
        state.onboarded = true;
      }
      // (b) before userName existed, the onboarding name only survived as the program name
      // ("Ryan's Program") — recover it once. Not an ongoing link; renaming the program later
      // doesn't rename the user.
      if (!state.userName) {
        const m = /^(.+?)['’]s\s+Program$/i.exec((state.programName || '').trim());
        if (m) state.userName = m[1].trim();
      }
      // (c) setCount/repCount backfill from each row's display text ("175 lb × 8/8/6" → 3 sets,
      // 22 reps). Historical time-tracked sets stored seconds in the rep slot — slightly
      // overcounted, invisible in a playful total.
      if (Array.isArray(state.history)) {
        state.history = state.history.map(h =>
          h.status === 'completed' && (h.repCount === undefined || h.setCount === undefined)
            ? { ...h, ...countsFromResultText(h.exercises) }
            : h
        );
      }
      // (d) progress is tracked per equipment variant now; pre-existing exerciseHistory entries
      // have no `equip` tag. Attribute each to the exercise's current program-slot equipment,
      // falling back to the library default.
      if (state.exerciseHistory && Object.keys(state.exerciseHistory).length) {
        const slotEquip: Record<string, string> = {};
        (state.dayOrder || []).forEach(k => {
          state.program?.[k]?.exercises?.forEach(ex => {
            if (slotEquip[ex.id] === undefined) {
              const v = EXLIB[ex.id]?.equip[ex.equipIdx]?.v;
              if (v) slotEquip[ex.id] = v;
            }
          });
        });
        let changed = false;
        const migrated: AppState['exerciseHistory'] = {};
        for (const [id, entries] of Object.entries(state.exerciseHistory)) {
          migrated[id] = (entries || []).map(e => {
            if (e.equip) return e;
            changed = true;
            return { ...e, equip: slotEquip[id] || EXLIB[id]?.equip?.[0]?.v || 'other' };
          });
        }
        if (changed) state.exerciseHistory = migrated;
      }
    }
  }
];

function runMigrations(state: AppState, parsed: Partial<AppState>): void {
  const from = typeof parsed.schemaVersion === 'number' ? parsed.schemaVersion : 0;
  for (const m of MIGRATIONS) {
    if (from < m.to) m.run(state, parsed);
  }
  state.schemaVersion = SCHEMA_VERSION;
}

function loadInitial(): AppState {
  const defaults = createInitialState();
  let state: AppState = defaults;
  let raw: string | null = null;
  let parsed: Partial<AppState> | null = null;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
  } catch {
    /* storage unavailable */
  }
  try {
    // shallow-merge over fresh defaults so fields added in later app versions (not present in an
    // older saved session) fall back to their default rather than being `undefined`.
    if (raw) {
      parsed = JSON.parse(raw) as Partial<AppState>;
      state = { ...defaults, ...parsed };
      // Always-run load sanitization (NOT migrations — these guard against states that can
      // recur, e.g. delivered by an old client via cloud sync or an app killed mid-action):
      // an in-flight coach request can't survive a reload — a persisted `true` would strand the
      // chat showing a typing indicator forever;
      state.coachPending = false;
      // and a workout resting with no restEndAt (pre-restEndAt blob shape) has nothing to
      // resume the countdown from — land it un-resting instead of permanently stuck.
      if (state.workout && state.workout.resting && state.workout.restEndAt == null) {
        state.workout = { ...state.workout, resting: false, restRemaining: 0 };
      }
    }
  } catch {
    // The persisted blob didn't parse. Stash a copy under a recovery key BEFORE falling back —
    // the save effect persists the fresh defaults immediately, which used to permanently
    // destroy a possibly-recoverable blob (and, signed in, push the empty state to the cloud).
    if (raw != null) {
      try {
        localStorage.setItem('alpha-lifts-corrupt-' + Date.now(), raw);
        corruptStateStashed = true;
      } catch {
        /* storage full — nothing more we can do */
      }
    }
    parsed = null;
    state = defaults;
  }
  // custom exercises live in persisted state but the exercise library itself is a module-level
  // singleton (mutated everywhere, like the original prototype) — merge them back in on load.
  // safeCustomEntries drops malformed defs and unsafe keys (__proto__ etc.), and refuses to
  // shadow a built-in exercise — this state may have arrived via backup import or cloud sync.
  safeCustomEntries(state.customExercises, BUILTIN_EXERCISE_IDS).forEach(([id, def]) => { EXLIB[id] = def; });
  // One-time migrations, after the EXLIB merge (some need library lookups).
  if (parsed) {
    try {
      runMigrations(state, parsed);
    } catch {
      // A migration threw on real-world data: keep the un-migrated (but merged) state rather
      // than wiping the user to defaults — and DON'T stamp the version, so it retries next load.
    }
  }
  return state;
}

// On an equipment change a slot's stored last/baseline belong to the OLD tool, so blank them to a
// first-time state: progress is tracked per tool, effectiveLast() prefers the new tool's own history
// when it exists (so a variant you've trained still shows its numbers), and a tool you haven't touched
// then correctly reads as a first time instead of inheriting the old tool's weight.
function blankSlotForEquip(ex: ProgramExercise, newEquipIdx: number, trainingType: TrainingType): ProgramExercise {
  const lib = EXLIB[ex.id];
  const reps = lib ? planRepDefault(trainingType, lib) : ex.last.reps;
  return { ...ex, equipIdx: newEquipIdx, manualTarget: null, last: { weight: 0, reps, hitTop: true }, lastSets: undefined, baseline: { weight: 0, reps } };
}

// If a workout is in progress and the user hasn't interacted with the app for this long, prompt to
// confirm they're still training (they may have set the phone down and walked off). 30 minutes.
const IDLE_WORKOUT_MS = 30 * 60 * 1000;

// HistoryEntry ids were bare 'h' + Date.now() — two entries minted in the same millisecond
// collided (duplicate React keys, ambiguous archive lookups). Same counter fix the coach message
// ids already use. (Incremented inside setState updaters; StrictMode's double-invoke just burns
// a value, uniqueness is unaffected.)
let historyIdCounter = 0;
function newHistoryId(now: number): string {
  return 'h' + now + '_' + historyIdCounter++;
}

// A linked superset pair shares rest after a full round (both exercises' current-index set done)
// rather than each exercise having its own rest — uses the longer of the two so neither lift gets
// shortchanged on recovery.
function restTotalFor(dayExercises: ProgramExercise[], idx: number, restPacing: RestPacing, trainingType: TrainingType, rir?: number): number {
  const ex = dayExercises[idx];
  const base = restForExercise(ex.id, restPacing, trainingType, rir);
  if (!ex.supersetGroup) return base;
  const partner = dayExercises.find((e, i) => i !== idx && e.supersetGroup === ex.supersetGroup);
  if (!partner) return base;
  return Math.max(base, restForExercise(partner.id, restPacing, trainingType, rir));
}

export function useApp() {
  const [state, setState] = useState<AppState>(loadInitial);
  const restInterval = useRef<number | null>(null);
  // Timestamp of the last in-app user interaction, tracked in a ref (no re-render on every tap) and
  // used only to decide whether an in-progress workout has gone idle. Not persisted.
  const lastActivityRef = useRef(Date.now());
  // restEndAt of the rest period whose completion alerts have already fired — makes restTick's
  // completion branch idempotent across the interval and the visibilitychange resync.
  const restDoneForRef = useRef<number | null>(null);

  // True while persisting is failing (storage full/unavailable) — surfaced as a visible banner.
  // Before this flag existed a quota failure was swallowed silently: the app kept running
  // normally and simply stopped saving, so every workout after the quota hit vanished on reload.
  const [persistFailed, setPersistFailed] = useState(false);
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      if (persistFailed) setPersistFailed(false);
    } catch {
      if (!persistFailed) setPersistFailed(true);
    }
  }, [state, persistFailed]);

  // reminder check runs every 60s while the app is open (see reminders.ts for why that's the
  // ceiling on what a backend-less reminder can do) — reads the latest state via a ref rather
  // than closing over `state` directly, so the interval doesn't need to be torn down/recreated
  // every time unrelated state changes.
  const stateRef = useRef(state);
  useEffect(() => { stateRef.current = state; }, [state]);
  useEffect(() => {
    const id = window.setInterval(() => {
      const cur = stateRef.current;
      // Idle-workout check: a workout is open but the app hasn't been touched for IDLE_WORKOUT_MS.
      // Runs on the same 60s cadence, so it fires within a minute of crossing the threshold.
      if (cur.workout && !cur.idleWorkoutPrompt && Date.now() - lastActivityRef.current >= IDLE_WORKOUT_MS) {
        setState(s => (s.workout && !s.idleWorkoutPrompt ? { ...s, idleWorkoutPrompt: true } : s));
      }
      const now = new Date();
      if (!shouldFireReminder(cur, now)) return;
      const dow = now.toLocaleDateString(undefined, { weekday: 'long' });
      const todayProgDay = cur.dayOrder.map(k => cur.program[k]).find(d => d && d.dow === dow);
      fireReminder(todayProgDay ? todayProgDay.label : 'Today’s workout', (cur.userName || '').trim().split(/\s+/)[0] || undefined);
      setState(s => ({ ...s, lastReminderFiredDate: now.toDateString() }));
    }, 60000);
    return () => window.clearInterval(id);
  }, []);

  // Track any in-app interaction as activity, in a ref so ordinary taps never trigger a re-render.
  // The idle prompt is a blocking dialog resolved only via its Continue/End buttons, so there's no
  // auto-dismiss here (which would also risk the dialog unmounting between pointerdown and click).
  useEffect(() => {
    const onActivity = () => { lastActivityRef.current = Date.now(); };
    window.addEventListener('pointerdown', onActivity);
    window.addEventListener('keydown', onActivity);
    return () => {
      window.removeEventListener('pointerdown', onActivity);
      window.removeEventListener('keydown', onActivity);
    };
  }, []);

  // (The old app-wide 1s "elapsed" forceTick interval is gone: elapsed/rest displays now tick
  // locally in the components that show them, off startedAt/restEndAt — see state/useClock.ts.)
  //
  // Keep the rest countdown alive across reloads if a workout is already mid-rest. The rest
  // interval used to be created only inside startRest(), so reloading mid-rest froze the
  // countdown at its persisted value forever; restEndAt is absolute epoch-ms, so the timer
  // resumes exactly. A rest that already expired while the app was closed completes silently —
  // restDoneForRef suppresses the hours-late vibrate/sound/notification.
  useEffect(() => {
    const w = state.workout;
    if (w?.resting && w.restEndAt != null) {
      if (w.restEndAt <= Date.now()) {
        restDoneForRef.current = w.restEndAt;
        setState(s => (s.workout ? { ...s, workout: { ...s.workout, resting: false, restRemaining: 0, restEndAt: null } } : s));
      } else {
        if (restInterval.current) window.clearInterval(restInterval.current);
        restInterval.current = window.setInterval(restTick, 1000);
      }
    }
    return () => {
      // clear the rest interval on unmount — it used to leak across hot-reloads/unmounts.
      if (restInterval.current) { window.clearInterval(restInterval.current); restInterval.current = null; }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openExerciseHistory = useCallback((id: string) => setState(s => ({ ...s, exerciseHistoryModalId: id })), []);
  const closeExerciseHistory = useCallback(() => setState(s => ({ ...s, exerciseHistoryModalId: null })), []);
  const openArchiveDetail = useCallback((id: string) => setState(s => ({ ...s, archiveDetailId: id })), []);
  const closeArchiveDetail = useCallback(() => setState(s => ({ ...s, archiveDetailId: null })), []);
  const selectExerciseProgress = useCallback((id: string) => setState(s => ({ ...s, selectedProgressEx: id, progressPickerOpen: false })), []);
  const toggleProgressPicker = useCallback(() => setState(s => ({ ...s, progressPickerOpen: !s.progressPickerOpen })), []);
  const toggleMuscleBalance = useCallback(() => setState(s => ({ ...s, muscleBalanceCollapsed: s.muscleBalanceCollapsed === false })), []);
  const toggleCompareLift = useCallback((id: string) => {
    setState(s => {
      const cur = s.compareLiftIds && s.compareLiftIds.length ? s.compareLiftIds : defaultCompareLiftIds(s);
      const has = cur.includes(id);
      if (!has && cur.length >= 3) return { ...s, compareLiftLimitHit: true };
      const compareLiftIds = has ? cur.filter(x => x !== id) : [...cur, id];
      return { ...s, compareLiftIds, compareLiftLimitHit: false };
    });
  }, []);
  const toggleCompareLiftPicker = useCallback(() => setState(s => ({ ...s, compareLiftPickerOpen: !s.compareLiftPickerOpen })), []);
  const setProgressMetric = useCallback((m: 'weight' | 'e1rm') => setState(s => ({ ...s, progressMetric: m })), []);

  const openWeekReview = useCallback(() => setState(s => ({ ...s, weekReviewOpen: true, weekReviewSelected: null })), []);
  const closeWeekReview = useCallback(() => setState(s => ({ ...s, weekReviewOpen: false })), []);
  const selectReviewWeek = useCallback((w: number) => setState(s => ({ ...s, weekReviewSelected: w })), []);
  const backToWeekList = useCallback(() => setState(s => ({ ...s, weekReviewSelected: null })), []);

  // ---------- nav ----------
  const goProgram = useCallback(() => setState(s => ({ ...s, screen: 'program' as Screen, activeDayKey: null })), []);
  const goProgress = useCallback(() => setState(s => ({ ...s, screen: 'progress' as Screen })), []);
  const goExercises = useCallback(() => setState(s => ({ ...s, screen: 'exercises' as Screen })), []);
  const goAchievements = useCallback(() => setState(s => ({ ...s, screen: 'achievements' as Screen })), []);
  const goCoach = useCallback(() => setState(s => ({ ...s, screen: 'coach' as Screen })), []);
  // deliberately NOT bundled into goAchievements — it needs to fire *after* the screen has
  // already rendered once with the pre-visit seen set, or "NEW" badges would never be visible
  // (see AchievementsScreen.tsx's mount effect, which calls this).
  const markAchievementsSeen = useCallback((ids: string[]) => setState(s => ({ ...s, seenAchievementIds: Array.from(new Set([...s.seenAchievementIds, ...ids])) })), []);

  const openDay = useCallback((key: string) => {
    setState(s => {
      const ranks = dayMuscleRanks(s, key);
      const top = Object.keys(ranks).sort((a, b) => ranks[b] - ranks[a])[0];
      const BACK_MUSCLES = ['Back', 'Rear Delts', 'Triceps', 'Hamstrings', 'Glutes'];
      const view = top && BACK_MUSCLES.includes(top) ? 'back' : 'front';
      return { ...s, screen: 'dayView' as Screen, activeDayKey: key, bodyView: view as 'front' | 'back' };
    });
  }, []);
  const openDayBuilder = useCallback(() => setState(s => ({ ...s, screen: 'dayBuilder' as Screen })), []);
  const closeDayBuilder = useCallback(() => setState(s => ({ ...s, screen: 'dayView' as Screen, confirmRemoveBuilderIdx: null })), []);

  const setTrainingType = useCallback((t: TrainingType) => setState(s => ({ ...s, trainingType: t })), []);
  const openSettings = useCallback(() => setState(s => ({ ...s, showSettings: true })), []);
  const closeSettings = useCallback(() => setState(s => ({ ...s, showSettings: false })), []);
  // Wipes localStorage and every EXLIB entry a prior session added, dropping straight back to
  // onboarding — mainly so "does a genuinely fresh install look right" can actually be tested
  // without needing to clear site data from the browser's own settings UI.
  const requestResetApp = useCallback(() => setState(s => ({ ...s, confirmResetApp: true })), []);
  const cancelResetApp = useCallback(() => setState(s => ({ ...s, confirmResetApp: false })), []);
  const resetApp = useCallback(() => {
    // Side effects live OUTSIDE the setState updater — updaters must be pure (StrictMode
    // double-invokes them), same reasoning as confirmPlanImport below. State is read via
    // stateRef, which is current at call time.
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* storage unavailable */ }
    // Also forget the sync relationship: a "fresh install" that still carries the old account's
    // sync-meta isn't fresh from the sync layer's point of view.
    clearSyncMeta();
    // only drop the custom exercises this session merged into the EXLIB singleton — the ~151
    // built-in exercises live in exercises.ts, not localStorage, and must survive a reset.
    Object.keys(stateRef.current.customExercises || {}).forEach(id => { delete EXLIB[id]; });
    setState(createInitialState());
  }, []);
  const setUnits = useCallback((u: Units) => setState(s => ({ ...s, units: u })), []);
  const setRestPacing = useCallback((v: RestPacing) => setState(s => ({ ...s, restPacing: v })), []);
  const setCoachVoice = useCallback((v: CoachVoice) => setState(s => ({ ...s, coachVoice: v })), []);
  const setWarmupStyle = useCallback((v: WarmupStyle) => setState(s => ({ ...s, warmupStyle: v })), []);
  const renameProgram = useCallback((name: string) => setState(s => ({ ...s, programName: name })), []);
  // Direct write, same shape as renameProgram — the value is stored raw (trimmed only where it's
  // read) so the Settings field behaves like a normal text input while it's being typed in.
  const setUserName = useCallback((name: string) => setState(s => ({ ...s, userName: name })), []);
  const dismissDeloadSuggestion = useCallback(() => setState(s => ({ ...s, deloadDismissedWeek: s.weekNumber })), []);

  // ---------- auto deload weeks ----------
  const setDeloadEnabled = useCallback((on: boolean) => setState(s => ({
    ...s, deloadEnabled: on,
    // Turning it on mid-program anchors from right now, so someone who enables it in week 9 gets
    // the settle-in minimum before any trigger can fire rather than being handed a deload
    // immediately for fatigue accumulated before the feature existed. Off clears any week in
    // progress.
    ...(on
      ? { deloadAnchorWeek: s.deloadAnchorWeek || s.weekNumber, deloadDeferUntilWeek: null }
      : { deloadActiveWeek: null })
  })), []);
  const setDeloadIntensity = useCallback((pct: number) => setState(s => ({ ...s, deloadIntensityPct: pct })), []);
  const setDeloadCadence = useCallback((weeks: number | null) => setState(s => ({ ...s, deloadCadenceWeeks: weeks })), []);
  // Start one now, without waiting for a trigger or a week boundary. Unlike the automatic path
  // this applies to the week already in progress — it's an explicit request, so there's no reason
  // to make the user wait, and the targets it changes are only ever the ones still ahead of them.
  const startDeloadNow = useCallback(() => setState(s => ({
    ...s, deloadEnabled: true, deloadActiveWeek: s.weekNumber, deloadDeferUntilWeek: null,
    deloadHistory: [...s.deloadHistory, { week: s.weekNumber, reason: 'manual' as const }]
  })), []);
  // Ends the deload early. Counts as done rather than skipped — the user got at least part of a
  // light week — so both the backstop and the settle-in minimum are measured from here.
  const endDeloadNow = useCallback(() => setState(s => ({
    ...s, deloadActiveWeek: null, deloadAnchorWeek: s.weekNumber, deloadDeferUntilWeek: null
  })), []);
  const deferDeload = useCallback(() => setState(s => ({
    ...s, deloadActiveWeek: null, deloadDeferUntilWeek: s.weekNumber + 1
  })), []);
  // Skip this one properly. Moving the anchor alone was enough back when a cadence clock was what
  // proposed deloads, but a trigger doesn't reset: the lifts that read as flat this week are still
  // flat next week, so the same banner would return one rollover later and "skip" would have meant
  // nothing. The suppression window is what actually buys the quiet; the anchor still moves so the
  // backstop counts from here too.
  const skipDeload = useCallback(() => setState(s => ({
    ...s, deloadActiveWeek: null, deloadAnchorWeek: s.weekNumber,
    deloadDeferUntilWeek: s.weekNumber + SKIP_SUPPRESS_WEEKS,
    deloadHistory: s.deloadHistory.filter(h => h.week !== s.weekNumber)
  })), []);

  // ---------- backup export/import ----------
  const exportBackup = useCallback(() => { exportBackupFile(state); }, [state]);
  const stageBackupImport = useCallback((data: Partial<AppState>) => setState(s => ({ ...s, pendingBackupImport: data })), []);
  const cancelBackupImport = useCallback(() => setState(s => ({ ...s, pendingBackupImport: null })), []);
  const confirmBackupImport = useCallback(() => {
    // EXLIB mutation is a side effect — kept outside the updater (StrictMode double-invoke, see
    // confirmPlanImport). safeCustomEntries re-filters here even though the file was validated at
    // selection time: it's the single choke point every EXLIB merge goes through.
    const pending = stateRef.current.pendingBackupImport;
    if (!pending) return;
    const restored = mergeBackupIntoDefaults(pending);
    const safeCustoms = safeCustomEntries(restored.customExercises, BUILTIN_EXERCISE_IDS);
    safeCustoms.forEach(([id, def]) => { EXLIB[id] = def; });
    restored.customExercises = Object.fromEntries(safeCustoms);
    setState(s => (s.pendingBackupImport ? { ...restored, pendingBackupImport: null } : s));
  }, []);

  // ---------- workout-plan (program) import/export ----------
  const exportPlan = useCallback(() => { exportPlanFile(state); }, [state]);
  const stagePlanImport = useCallback((plan: ParsedPlan) => setState(s => ({ ...s, pendingPlanImport: plan })), []);
  const cancelPlanImport = useCallback(() => setState(s => ({ ...s, pendingPlanImport: null })), []);
  const confirmPlanImport = useCallback(() => {
    const plan = stateRef.current.pendingPlanImport;
    if (!plan) return;
    // Re-create any bundled custom exercises that don't already exist (built-ins and already-present
    // customs are left untouched, so re-importing your own plan doesn't duplicate them). This
    // mutates the module-level EXLIB singleton — a side effect — so it must run OUTSIDE the setState
    // updater and exactly once: React (StrictMode) double-invokes the updater, and doing the
    // `if (!EXLIB[id])` add inside it means the discarded first pass mutates EXLIB and the kept
    // second pass then skips persisting the custom into customExercises (it'd render this session
    // but vanish on reload, since EXLIB customs are rehydrated from customExercises on load).
    const addedCustoms: Record<string, ExerciseDef> = {};
    // safeCustomEntries: same unsafe-key/shape filter as backup restore (every EXLIB merge goes
    // through it); the !EXLIB[id] check then keeps built-ins and already-present customs as-is.
    safeCustomEntries(plan.customExercises, BUILTIN_EXERCISE_IDS).forEach(([id, def]) => {
      if (!EXLIB[id]) { EXLIB[id] = def; addedCustoms[id] = def; }
    });
    setState(s => {
      if (!s.pendingPlanImport) return s;
      const customExercises = { ...s.customExercises, ...addedCustoms };
      // Deep-copy the days and drop any exercise whose id still doesn't resolve (a dangling
      // reference from a hand-edited/foreign file — a self-contained export never dangles).
      const days: AppState['program'] = JSON.parse(JSON.stringify(s.pendingPlanImport.days));
      Object.values(days).forEach(d => { d.exercises = d.exercises.filter(e => !!EXLIB[e.id]); });
      const dayOrder = s.pendingPlanImport.dayOrder.filter(k => k in days);
      const now = new Date().toISOString();
      // Stash the current program (same as build_program / createProgramFromWizard) rather than
      // wiping it, then swap the imported one in as active.
      const savedPrograms = { ...s.savedPrograms };
      savedPrograms[s.activeProgramId] = { name: s.programName, trainingType: s.trainingType, dayOrder: s.dayOrder, startedAt: s.startedAt, days: s.program, weekNumber: s.weekNumber, weekStartedAt: s.weekStartedAt };
      return {
        ...s,
        pendingPlanImport: null,
        customExercises,
        activeProgramId: 'prog_' + Date.now(), programName: s.pendingPlanImport.name, trainingType: s.pendingPlanImport.trainingType,
        program: days, dayOrder, startedAt: now, weekNumber: 1, weekStartedAt: now,
        savedPrograms, activeDayKey: null, showSettings: false, screen: 'program' as Screen
      };
    });
  }, []);
  // AI paste-to-parse: calls the Pro-gated Worker route, using the current program's training type
  // as the fallback style. Resolves to a ParsedPlan (staged by the caller) or throws a friendly
  // Error. Does not mutate state itself.
  const parsePlanText = useCallback((text: string) => parsePlanTextApi(text, stateRef.current.trainingType), []);

  // ---------- rest-timer alerts ----------
  const requestNotifyPermissionIfNeeded = () => {
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') Notification.requestPermission();
  };
  const setRestAlertSound = useCallback((v: boolean) => setState(s => ({ ...s, restAlertSound: v })), []);
  // Vibration while the app is minimized is only reachable via a system notification's own
  // vibrate pattern (see alerts.ts), so turning this on needs the same permission grant as the
  // notify toggle — not just a page-level Vibration API call, which no-ops when the doc is hidden.
  const setRestAlertVibrate = useCallback((v: boolean) => {
    if (v) requestNotifyPermissionIfNeeded();
    setState(s => ({ ...s, restAlertVibrate: v }));
  }, []);
  const setRestAlertNotify = useCallback((v: boolean) => {
    if (v) requestNotifyPermissionIfNeeded();
    setState(s => ({ ...s, restAlertNotify: v }));
  }, []);

  // ---------- reminder notifications ----------
  const setRemindersEnabled = useCallback((v: boolean) => {
    if (v && typeof Notification !== 'undefined' && Notification.permission === 'default') {
      Notification.requestPermission();
    }
    setState(s => ({ ...s, remindersEnabled: v }));
  }, []);
  const setReminderTime = useCallback((v: string) => setState(s => ({ ...s, reminderTime: v })), []);

  // ---------- body-weight tracking ----------
  const setBodyWeightInput = useCallback((v: string) => setState(s => ({ ...s, bodyWeightInput: v })), []);
  const logBodyWeight = useCallback(() => {
    setState(s => {
      const displayVal = parseFloat(s.bodyWeightInput);
      if (!Number.isFinite(displayVal) || displayVal <= 0) return s;
      const weightKg = s.units === 'lb' ? displayVal / 2.20462 : displayVal;
      // LOCAL calendar date, not toISOString (UTC) — anyone west of UTC logging in the evening
      // was writing tomorrow's date.
      const d = new Date();
      const todayKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const bodyWeightLog = [...s.bodyWeightLog.filter(e => e.date !== todayKey), { date: todayKey, weightKg }];
      return { ...s, bodyWeightLog, bodyWeightInput: '' };
    });
  }, []);

  // ---------- program management ----------
  const switchProgram = useCallback((id: string) => {
    setState(s => {
      if (id === s.activeProgramId) return s;
      const savedPrograms = { ...s.savedPrograms };
      savedPrograms[s.activeProgramId] = { name: s.programName, trainingType: s.trainingType, dayOrder: s.dayOrder, startedAt: s.startedAt, days: s.program, weekNumber: s.weekNumber, weekStartedAt: s.weekStartedAt };
      const target = savedPrograms[id];
      delete savedPrograms[id];
      return {
        ...s,
        activeProgramId: id, programName: target.name,
        trainingType: target.trainingType || 'progressive_overload',
        dayOrder: target.dayOrder || Object.keys(target.days),
        startedAt: target.startedAt || new Date().toISOString(),
        weekNumber: target.weekNumber || 1, weekStartedAt: target.weekStartedAt || target.startedAt || new Date().toISOString(),
        program: target.days, savedPrograms, activeDayKey: null, screen: 'program' as Screen
      };
    });
  }, []);
  const newProgram = useCallback(() => {
    setState(s => {
      const newId = 'prog_' + Date.now();
      const savedPrograms = { ...s.savedPrograms };
      savedPrograms[s.activeProgramId] = { name: s.programName, trainingType: s.trainingType, dayOrder: s.dayOrder, startedAt: s.startedAt, days: s.program, weekNumber: s.weekNumber, weekStartedAt: s.weekStartedAt };
      return {
        ...s,
        activeProgramId: newId, programName: s.programName + ' Copy',
        program: JSON.parse(JSON.stringify(s.program)), dayOrder: [...s.dayOrder], trainingType: s.trainingType,
        startedAt: new Date().toISOString(), weekNumber: 1, weekStartedAt: new Date().toISOString(),
        savedPrograms
      };
    });
  }, []);
  const requestRemoveProgram = useCallback((id: string) => {
    setState(s => {
      if (s.confirmDeleteProgId !== id) return { ...s, confirmDeleteProgId: id };
      const savedPrograms = { ...s.savedPrograms };
      delete savedPrograms[id];
      return { ...s, savedPrograms, confirmDeleteProgId: null };
    });
  }, []);
  const renameSavedProgram = useCallback((id: string, name: string) => {
    setState(s => (s.savedPrograms[id] ? { ...s, savedPrograms: { ...s.savedPrograms, [id]: { ...s.savedPrograms[id], name } } } : s));
  }, []);

  // ---------- new program wizard ----------
  const openNewProgramWizard = useCallback(() => setState(s => ({
    ...s, newProgramWizard: { name: 'New Program', trainingType: 'progressive_overload', splitId: 'ppl6', customDays: [], prefill: 'recommended' }
  })), []);
  const closeNewProgramWizard = useCallback(() => setState(s => ({ ...s, newProgramWizard: null })), []);
  const setWizardField = useCallback((field: 'name' | 'trainingType', val: string) => {
    setState(s => (s.newProgramWizard ? { ...s, newProgramWizard: { ...s.newProgramWizard, [field]: val } } : s));
  }, []);
  const setWizardPrefill = useCallback((val: 'recommended' | 'scratch') => {
    setState(s => (s.newProgramWizard ? { ...s, newProgramWizard: { ...s.newProgramWizard, prefill: val } } : s));
  }, []);
  const selectWizardSplit = useCallback((id: string) => {
    setState(s => {
      if (!s.newProgramWizard) return s;
      const customDays = id === 'custom' && !s.newProgramWizard.customDays.length
        ? [{ label: 'Day 1', kind: 'training' as const }, { label: 'Rest Day', kind: 'rest' as const }]
        : s.newProgramWizard.customDays;
      return { ...s, newProgramWizard: { ...s.newProgramWizard, splitId: id, customDays } };
    });
  }, []);
  const addWizardCustomDay = useCallback(() => {
    setState(s => {
      // Same 7-day hard cap the Edit Week screen enforces: buildCustomProgram assigns weekdays via
      // `WEEKDAYS[i % 7]`, so an 8th day would silently mint a second "Monday" — which breaks
      // shouldFireReminder's find-today-by-weekday lookup, not just the display.
      if (!s.newProgramWizard || s.newProgramWizard.customDays.length >= WEEKDAYS.length) return s;
      return {
        ...s, newProgramWizard: { ...s.newProgramWizard, customDays: [...s.newProgramWizard.customDays, { label: 'Day ' + (s.newProgramWizard.customDays.length + 1), kind: 'training' as const }] }
      };
    });
  }, []);
  const removeWizardCustomDay = useCallback((i: number) => {
    setState(s => (s.newProgramWizard ? { ...s, newProgramWizard: { ...s.newProgramWizard, customDays: s.newProgramWizard.customDays.filter((_, idx) => idx !== i) } } : s));
  }, []);
  const setWizardCustomDayField = useCallback((i: number, field: keyof WizardCustomDay, val: string) => {
    setState(s => (s.newProgramWizard ? {
      ...s, newProgramWizard: { ...s.newProgramWizard, customDays: s.newProgramWizard.customDays.map((d, idx) => idx === i ? { ...d, [field]: val } : d) }
    } : s));
  }, []);
  const createProgramFromWizard = useCallback(() => {
    setState(s => {
      const w = s.newProgramWizard;
      if (!w) return s;
      const name = w.name.trim() || 'New Program';
      const built = w.splitId === 'custom'
        ? buildCustomProgram(w.customDays.length ? w.customDays : [{ label: 'Day 1', kind: 'training' }])
        : buildProgramFromPreset(SPLIT_PRESETS.find(p => p.id === w.splitId) || SPLIT_PRESETS[0], w.trainingType, w.prefill);
      const newId = 'prog_' + Date.now();
      const savedPrograms = { ...s.savedPrograms };
      savedPrograms[s.activeProgramId] = { name: s.programName, trainingType: s.trainingType, dayOrder: s.dayOrder, startedAt: s.startedAt, days: s.program, weekNumber: s.weekNumber, weekStartedAt: s.weekStartedAt };
      return {
        ...s,
        activeProgramId: newId, programName: name, trainingType: w.trainingType,
        program: built.days, dayOrder: built.dayOrder, startedAt: new Date().toISOString(),
        weekNumber: 1, weekStartedAt: new Date().toISOString(), savedPrograms,
        newProgramWizard: null, showSettings: false, activeDayKey: null, screen: 'program' as Screen
      };
    });
  }, []);

  // first-run onboarding: same wizard fields/build logic as createProgramFromWizard, but there's
  // no existing program to stash into savedPrograms yet.
  const completeOnboarding = useCallback(() => {
    setState(s => {
      const w = s.newProgramWizard;
      if (!w) return s;
      const name = w.name.trim() || 'My Program';
      const built = w.splitId === 'custom'
        ? buildCustomProgram(w.customDays.length ? w.customDays : [{ label: 'Day 1', kind: 'training' }])
        : buildProgramFromPreset(SPLIT_PRESETS.find(p => p.id === w.splitId) || SPLIT_PRESETS[0], w.trainingType, w.prefill);
      const newId = 'prog_' + Date.now();
      return {
        ...s,
        onboarded: true,
        activeProgramId: newId, programName: name, trainingType: w.trainingType,
        program: built.days, dayOrder: built.dayOrder, startedAt: new Date().toISOString(),
        weekNumber: 1, weekStartedAt: new Date().toISOString(),
        newProgramWizard: null, screen: 'program' as Screen
      };
    });
  }, []);

  // AI/guided onboarding completion. Unlike completeOnboarding (which reads the newProgramWizard
  // state), this takes the resolved choice directly from the guided flow — the split/style the AI
  // (or the deterministic fallback) picked — builds the program the same way, and stashes the
  // welcome + answers so the app remembers who this plan was built for.
  const finishOnboarding = useCallback(
    (choice: {
      // the *program* name, not the person's — that's `userName`.
      name: string;
      userName?: string;
      trainingType: TrainingType;
      splitId: string;
      welcome: string;
      profile?: AppState['onboardingProfile'];
      swaps?: ExerciseSwap[];
      // 'scratch' builds empty days (the opt-out / build-your-own path); defaults to 'recommended'.
      prefill?: 'recommended' | 'scratch';
      // Launch the first-run app tutorial after landing (used by the opt-out path).
      startTutorial?: boolean;
    }) => {
      setState(s => {
        const preset = SPLIT_PRESETS.find(p => p.id === choice.splitId) || SPLIT_PRESETS[0];
        const built = buildProgramFromPreset(preset, choice.trainingType, choice.prefill ?? 'recommended');
        // Adapt the default exercises to the user's gym (AI-proposed swaps; no-op if none / none match).
        if (choice.swaps && choice.swaps.length) applyExerciseSwaps(built.days, choice.swaps);
        const newId = 'prog_' + Date.now();
        return {
          ...s,
          onboarded: true,
          userName: (choice.userName || '').trim(),
          onboardingWelcome: choice.welcome,
          onboardingProfile: choice.profile,
          showTutorial: !!choice.startTutorial,
          activeProgramId: newId,
          programName: choice.name.trim() || 'My Program',
          trainingType: choice.trainingType,
          program: built.days,
          dayOrder: built.dayOrder,
          startedAt: new Date().toISOString(),
          weekNumber: 1,
          weekStartedAt: new Date().toISOString(),
          newProgramWizard: null,
          screen: 'program' as Screen
        };
      });
    },
    []
  );

  // First-run app tutorial controls. dismiss marks it seen (so it never auto-shows again); open
  // re-launches it on demand from Settings.
  const dismissTutorial = useCallback(() => setState(s => ({ ...s, showTutorial: false, tutorialSeen: true })), []);
  const openTutorial = useCallback(() => setState(s => ({ ...s, showTutorial: true })), []);

  const toggleSkipDay = useCallback((dayKey: string) => {
    setState(s => {
      const program = JSON.parse(JSON.stringify(s.program));
      const day = program[dayKey];
      const turningOn = !day.skipped;
      day.skipped = turningOn;
      if (turningOn) {
        day.lastCompletedAt = null;
        const now = new Date();
        const dateStr = now.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
        const entry = {
          id: newHistoryId(now.getTime()), day: day.label, program: s.programName, date: dateStr,
          volumeKg: 0, durationMin: 0, avgRestSec: 0,
          weekNumber: s.weekNumber, status: 'skipped' as const, exercises: []
        };
        let weekNumber = s.weekNumber, weekStartedAt = s.weekStartedAt;
        let deloadFields = null as ReturnType<typeof advanceDeloadForWeek> | null;
        if (isWeekComplete(program, s.dayOrder, weekStartedAt)) {
          weekNumber += 1; weekStartedAt = now.toISOString();
          deloadFields = advanceDeloadForWeek(s, weekNumber);
          s.dayOrder.forEach(k => {
            const d = program[k];
            if (d && (d.kind || 'training') !== 'rest') { d.skipped = false; d.lastCompletedAt = null; }
          });
        }
        return { ...s, program, history: [entry, ...s.history], weekNumber, weekStartedAt, ...(deloadFields || {}) };
      }
      // Turning skip OFF: also retract the 'skipped' history entry the ON toggle wrote for this
      // day this week. Leaving it in permanently broke two monotonic achievement inputs —
      // bestEverStreak treated the retracted skip as a streak break and cleanWeekCount marked the
      // week unclean forever — and toggling on/off/on stacked duplicate entries.
      const history = (() => {
        const idx = s.history.findIndex(
          h => h.status === 'skipped' && h.day === day.label && (h.weekNumber || 1) === s.weekNumber
        );
        return idx === -1 ? s.history : s.history.filter((_, i) => i !== idx);
      })();
      return { ...s, program, history };
    });
  }, []);

  // ---------- weekly day structure (permanent edits to the ACTIVE program) ----------
  // Distinct from toggleSkipDay above, which is a one-week "not doing this one" marker. These edit
  // the plan itself: which days exist, what they're called, and whether each is a training or rest
  // day. Every one of them routes through resyncDows() and the week-complete re-check below.
  //
  // dow is positional by construction everywhere else in the app (buildProgramFromPreset and
  // buildCustomProgram both assign WEEKDAYS[i % 7]), and shouldFireReminder() picks today's day with
  // a `find(d => d.dow === todayName)` — so a duplicated or skipped weekday silently breaks
  // reminders. Rewriting the whole week after any structural change is what keeps that invariant.
  const structuralEdit = useCallback((s: AppState, mutate: (program: ProgramDays, dayOrder: string[]) => string[] | void): AppState => {
    const program: ProgramDays = JSON.parse(JSON.stringify(s.program));
    let dayOrder = [...s.dayOrder];
    const nextOrder = mutate(program, dayOrder);
    if (nextOrder) dayOrder = nextOrder;
    dayOrder.forEach((k, i) => { if (program[k]) program[k].dow = WEEKDAYS[i % 7]; });
    // An edit can complete the week on its own (e.g. the only outstanding day becomes a rest day),
    // and rollover is otherwise only checked after a workout or a skip — so check it here too.
    let weekNumber = s.weekNumber, weekStartedAt = s.weekStartedAt;
    let deloadFields = null as ReturnType<typeof advanceDeloadForWeek> | null;
    const hasTraining = dayOrder.some(k => program[k] && (program[k].kind || 'training') !== 'rest');
    if (hasTraining && isWeekComplete(program, dayOrder, weekStartedAt)) {
      weekNumber += 1; weekStartedAt = new Date().toISOString();
      deloadFields = advanceDeloadForWeek(s, weekNumber);
      dayOrder.forEach(k => {
        const d = program[k];
        if (d && (d.kind || 'training') !== 'rest') { d.skipped = false; d.lastCompletedAt = null; }
      });
    }
    const activeDayKey = s.activeDayKey && program[s.activeDayKey] ? s.activeDayKey : null;
    return { ...s, program, dayOrder, activeDayKey, weekNumber, weekStartedAt, ...(deloadFields || {}) };
  }, []);

  // Exercises are deliberately KEPT when a day becomes a rest day — muscleVolumes() skips rest days
  // so they stop counting toward weekly volume either way, and keeping them means flipping back
  // restores the day exactly rather than leaving the user to rebuild it after a mis-tap.
  const setDayKind = useCallback((dayKey: string, kind: 'training' | 'rest') => {
    setState(s => structuralEdit(s, program => {
      const day = program[dayKey];
      if (!day || (day.kind || 'training') === kind) return;
      day.kind = kind;
      if (kind === 'rest') {
        // the week-rollover resets skip these fields on rest days, so they'd stay stale forever.
        day.skipped = false;
        day.lastCompletedAt = null;
        day.exercisesDoneMask = null;
      }
    }));
  }, [structuralEdit]);

  const renameDay = useCallback((dayKey: string, label: string) => {
    setState(s => (s.program[dayKey] ? structuralEdit(s, program => { program[dayKey].label = label; }) : s));
  }, [structuralEdit]);

  // Hard-capped at one week. dow is WEEKDAYS[i % 7] by construction, so an 8th day would be handed
  // a second "Monday" — and shouldFireReminder() resolves today's session with a find() on dow, so
  // a duplicate weekday makes the later day unreachable to reminders and ambiguous to the coach's
  // day-name lookup. A program longer than 7 days isn't a week, it's a rotation, which this app's
  // week-completion and weekly-volume model doesn't represent.
  const addProgramDay = useCallback(() => {
    setState(s => (s.dayOrder.length >= WEEKDAYS.length ? s : structuralEdit(s, (program, dayOrder) => {
      // Timestamped key, not an index — the preset keys (`ppl6_3`) encode their original position
      // and reusing that scheme after a reorder would produce a key that lies about where it sits.
      const key = 'day_' + Date.now();
      program[key] = {
        key, label: 'New Day', dow: WEEKDAYS[dayOrder.length % 7], kind: 'training', skipped: false,
        theme: MUSCLES, exercises: []
      };
      return [...dayOrder, key];
    })));
  }, [structuralEdit]);

  const requestRemoveProgramDay = useCallback((dayKey: string) => setState(s => ({ ...s, confirmRemoveDayKey: dayKey })), []);
  const cancelRemoveProgramDay = useCallback(() => setState(s => ({ ...s, confirmRemoveDayKey: null })), []);
  const confirmRemoveProgramDay = useCallback(() => {
    setState(s => {
      const dayKey = s.confirmRemoveDayKey;
      if (!dayKey || !s.program[dayKey] || s.dayOrder.length <= 1) return { ...s, confirmRemoveDayKey: null };
      // A live workout on the day being deleted would be left pointing at nothing.
      if (s.workout && s.workout.dayKey === dayKey) return { ...s, confirmRemoveDayKey: null };
      const next = structuralEdit(s, (program, dayOrder) => {
        delete program[dayKey];
        return dayOrder.filter(k => k !== dayKey);
      });
      return { ...next, confirmRemoveDayKey: null };
    });
  }, [structuralEdit]);

  const moveProgramDay = useCallback((dayKey: string, direction: 'up' | 'down') => {
    setState(s => structuralEdit(s, (_program, dayOrder) => {
      const i = dayOrder.indexOf(dayKey);
      const j = direction === 'up' ? i - 1 : i + 1;
      if (i < 0 || j < 0 || j >= dayOrder.length) return;
      const next = [...dayOrder];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    }));
  }, [structuralEdit]);

  const openEditWeek = useCallback(() => setState(s => ({ ...s, editWeekOpen: true })), []);
  const closeEditWeek = useCallback(() => setState(s => ({ ...s, editWeekOpen: false, confirmRemoveDayKey: null })), []);

  const setBodyView = useCallback((v: 'front' | 'back') => setState(s => ({ ...s, bodyView: v })), []);
  const openBodyModal = useCallback(() => setState(s => ({ ...s, showBodyModal: true })), []);
  const closeBodyModal = useCallback(() => setState(s => ({ ...s, showBodyModal: false })), []);

  // ---------- detail overlay ----------
  const openDetail = useCallback((dayKey: string, exIndex: number) => setState(s => ({ ...s, detail: { dayKey, exIndex } })), []);
  const closeDetail = useCallback(() => setState(s => ({ ...s, detail: null })), []);
  const openQuickEdit = useCallback((dayKey: string, exIndex: number) => setState(s => ({ ...s, quickEdit: { dayKey, exIndex } })), []);
  const closeQuickEdit = useCallback(() => setState(s => ({ ...s, quickEdit: null })), []);

  // ---------- muscle drill ----------
  const openMuscleDrill = useCallback((name: string) => setState(s => ({ ...s, muscleDrill: name as AppState['muscleDrill'] })), []);
  const closeMuscleDrill = useCallback(() => setState(s => ({ ...s, muscleDrill: null })), []);

  // ---------- warm-up detail ----------
  const openWarmupDetail = useCallback((id: string) => setState(s => ({ ...s, warmupDetailId: id })), []);
  const closeWarmupDetail = useCallback(() => setState(s => ({ ...s, warmupDetailId: null })), []);

  // ---------- exercise library ----------
  const openLibraryDetail = useCallback((id: string) => setState(s => ({ ...s, libraryDetailId: id })), []);
  const closeLibraryDetail = useCallback(() => setState(s => ({ ...s, libraryDetailId: null })), []);
  const setExerciseSearchQuery = useCallback((q: string) => setState(s => ({ ...s, exerciseSearchQuery: q })), []);

  // ---------- AI coach ----------
  const setCoachInput = useCallback((v: string) => setState(s => ({ ...s, coachInput: v })), []);
  const clearCoachChat = useCallback(() => setState(s => ({ ...s, coachMessages: [], coachInput: '' })), []);

  // Probes whether this device may use the coach and stores it, so the Coach tab can show the
  // chat or a locked/upsell screen without the user having to send a message first. Called on
  // opening the tab. A failed probe (offline) leaves it 'unknown', which renders as the chat —
  // the actual send is gated server-side regardless, so we never falsely lock anyone out.
  const refreshCoachEntitlement = useCallback(async () => {
    if (!COACH_CONFIGURED) return;
    const status = await fetchCoachStatus();
    setState(s => ({ ...s, coachEntitlement: status }));
  }, []);

  // Synchronous in-flight latch. Deliberately NOT `stateRef.current.coachPending`: stateRef is
  // refreshed in a useEffect, i.e. after commit, so two sends dispatched in the same tick (a
  // double-tap, or Enter landing on the same frame as a click) both read the stale `false` and
  // both fire. Verified: that produced two API requests for one user message. A ref set before
  // the first await closes the window, since it lands before React re-renders anything.
  const coachInflightRef = useRef(false);

  // Message ids were `c${Date.now()}` + a role suffix, which collided whenever two messages
  // landed in the same millisecond — React logged duplicate-key warnings during testing when a
  // request failed fast enough that the user turn and the error bubble shared a timestamp.
  // A counter makes them unique regardless of clock resolution.
  const coachMsgSeq = useRef(0);
  const nextCoachId = () => `c${Date.now()}_${coachMsgSeq.current++}`;

  const sendCoachMessage = useCallback(async () => {
    const cur = stateRef.current;
    const text = cur.coachInput.trim();
    if (!text || coachInflightRef.current) return;
    coachInflightRef.current = true;

    const userMsg: CoachChatMessage = { id: nextCoachId(), role: 'user', content: text };
    const nextMessages = [...cur.coachMessages, userMsg].slice(-COACH_HISTORY_CAP);
    setState(s => ({ ...s, coachMessages: nextMessages, coachInput: '', coachPending: true }));

    // Error bubbles are local UI state ("couldn't reach the coach"), not something the model
    // said — sending them back as assistant turns would have it apologise for our network.
    const wire = nextMessages.filter(m => !m.isError).map(m => ({ role: m.role, content: m.content }));

    let result;
    try {
      result = await askCoach(wire, buildCoachContext(cur));
    } finally {
      // Must clear even if askCoach throws, or the latch wedges shut and the chat is dead for
      // the rest of the session with no way to recover short of a reload.
      coachInflightRef.current = false;
    }

    // Resolve the Worker's raw tool calls into apply-ready proposal cards against the *latest*
    // state (stateRef, not the pre-await `cur`) — the user may have edited their program while
    // the request was in flight, and a proposal must resolve day/exercise names against what's
    // actually there now.
    const proposals = result.ok ? parseProposals(result.rawProposals, stateRef.current) : [];
    const reply: CoachChatMessage = result.ok
      ? { id: nextCoachId(), role: 'assistant', content: result.reply, ...(proposals.length ? { proposals } : {}) }
      : { id: nextCoachId(), role: 'assistant', content: result.error, isError: true };

    // Append to `s.coachMessages`, not to the captured `nextMessages` — the user may have hit
    // "clear chat" while this was in flight, and rebuilding from the stale array would
    // resurrect the conversation they just deleted.
    setState(s => ({ ...s, coachPending: false, coachMessages: [...s.coachMessages, reply].slice(-COACH_HISTORY_CAP) }));
  }, []);

  // Applies one confirmed coach proposal to the real state. Pure: returns the next AppState.
  // These are direct program mutations (like muscleSwapConfirm) rather than driving the swap/add
  // modal state machines — the coach isn't in a modal flow. Every path mirrors the existing
  // add/swap/remove logic, including clearing a dangling superset link on the touched exercise's
  // former partner so no group id ever points at an exercise that's no longer there.
  const applyProposalToState = (s: AppState, p: CoachProposalPayload): AppState => {
    switch (p.kind) {
      case 'add_exercise': {
        const lib = EXLIB[p.exId];
        const program = JSON.parse(JSON.stringify(s.program));
        const day = program[p.dayKey];
        if (!day || !lib) return s;
        const reps = p.reps ?? planRepDefault(s.trainingType, lib);
        const sets = p.sets ?? 3;
        day.exercises.push(mkEx(p.exId, sets, 0, { weight: 0, reps, hitTop: true }));
        return { ...s, program };
      }
      case 'swap_exercise': {
        const lib = EXLIB[p.toExId];
        const program = JSON.parse(JSON.stringify(s.program));
        const day = program[p.dayKey];
        if (!day || !lib) return s;
        const idx = day.exercises.findIndex((e: ProgramExercise) => e.id === p.fromExId);
        if (idx < 0) return s;
        const oldGroup = day.exercises[idx].supersetGroup;
        day.exercises[idx] = mkEx(p.toExId, day.exercises[idx].sets, 0, { weight: 0, reps: lib.repHi, hitTop: true });
        if (oldGroup) {
          const partner = day.exercises.find((e: ProgramExercise) => e.supersetGroup === oldGroup);
          if (partner) partner.supersetGroup = null;
        }
        return { ...s, program };
      }
      case 'remove_exercise': {
        const program = JSON.parse(JSON.stringify(s.program));
        const day = program[p.dayKey];
        if (!day) return s;
        const idx = day.exercises.findIndex((e: ProgramExercise) => e.id === p.exId);
        if (idx < 0) return s;
        const removed = day.exercises[idx];
        day.exercises.splice(idx, 1);
        if (removed?.supersetGroup) {
          const partner = day.exercises.find((e: ProgramExercise) => e.supersetGroup === removed.supersetGroup);
          if (partner) partner.supersetGroup = null;
        }
        return { ...s, program };
      }
      case 'set_params': {
        const program = JSON.parse(JSON.stringify(s.program));
        const day = program[p.dayKey];
        if (!day) return s;
        const ex: ProgramExercise | undefined = day.exercises.find((e: ProgramExercise) => e.id === p.exId);
        if (!ex) return s;
        if (p.sets != null) ex.sets = Math.max(1, Math.min(8, p.sets));
        // A rep-target change writes a manualTarget override (cleared on next log), same as the
        // Day View quick-edit — ex.last alone would be silently outranked by cross-day history.
        if (p.reps != null) {
          const base = ex.manualTarget || effectiveLast(ex, s.exerciseHistory[ex.id]);
          ex.manualTarget = { weight: base.weight, reps: Math.max(1, p.reps) };
        }
        return { ...s, program };
      }
      // Both of these reuse structuralEdit, so a coach-applied change gets the same weekday
      // resync and week-complete re-check the Edit Week sheet does — the invariant lives in one
      // place rather than being re-implemented per entry point.
      case 'set_day_kind': {
        const day = s.program[p.dayKey];
        if (!day || (day.kind || 'training') === p.dayKind) return s;
        return structuralEdit(s, program => {
          const d = program[p.dayKey];
          d.kind = p.dayKind;
          if (p.dayKind === 'rest') { d.skipped = false; d.lastCompletedAt = null; d.exercisesDoneMask = null; }
        });
      }
      case 'rename_day': {
        const label = p.label.trim();
        if (!s.program[p.dayKey] || !label) return s;
        return structuralEdit(s, program => { program[p.dayKey].label = label; });
      }
      case 'build_program': {
        const preset = SPLIT_PRESETS.find(pr => pr.id === p.splitId) || SPLIT_PRESETS[0];
        const built = buildProgramFromPreset(preset, p.trainingType, 'recommended');
        const newId = 'prog_' + Date.now();
        const savedPrograms = { ...s.savedPrograms };
        // stash the outgoing program so switching back to it later is possible, same as
        // createProgramFromWizard.
        savedPrograms[s.activeProgramId] = { name: s.programName, trainingType: s.trainingType, dayOrder: s.dayOrder, startedAt: s.startedAt, days: s.program, weekNumber: s.weekNumber, weekStartedAt: s.weekStartedAt };
        return {
          ...s,
          activeProgramId: newId, programName: p.name || preset.label, trainingType: p.trainingType,
          program: built.days, dayOrder: built.dayOrder, startedAt: new Date().toISOString(),
          weekNumber: 1, weekStartedAt: new Date().toISOString(), savedPrograms,
          // stay on the coach screen (the card shows the confirmation); just clear a now-stale
          // active day, since the new program has different day keys.
          activeDayKey: null
        };
      }
      case 'log_bodyweight': {
        const weightKg = s.units === 'lb' ? p.displayValue / 2.20462 : p.displayValue;
        const todayKey = new Date().toISOString().slice(0, 10);
        const bodyWeightLog = [...s.bodyWeightLog.filter(e => e.date !== todayKey), { date: todayKey, weightKg }];
        return { ...s, bodyWeightLog };
      }
      case 'navigate': {
        if (p.dayKey && s.program[p.dayKey]) {
          const ranks = dayMuscleRanks(s, p.dayKey);
          const top = Object.keys(ranks).sort((a, b) => ranks[b] - ranks[a])[0];
          const BACK_MUSCLES = ['Back', 'Rear Delts', 'Triceps', 'Hamstrings', 'Glutes'];
          const view = top && BACK_MUSCLES.includes(top) ? 'back' : 'front';
          return { ...s, screen: 'dayView' as Screen, activeDayKey: p.dayKey, bodyView: view as 'front' | 'back' };
        }
        if (p.screen) return { ...s, screen: p.screen, ...(p.screen === 'program' ? { activeDayKey: null } : {}) };
        return s;
      }
      default:
        return s;
    }
  };

  const applyCoachProposal = useCallback((messageId: string, index: number) => {
    // Pre-generate the acknowledgement id outside the updater (nextCoachId increments a ref, a
    // side effect the setState updater must not carry — it can be double-invoked). An id that
    // goes unused (no-op proposal, see below) is harmless; ids only need to be unique.
    const ackId = nextCoachId();
    setState(s => {
      const msg = s.coachMessages.find(m => m.id === messageId);
      const prop = msg?.proposals?.[index];
      if (!msg || !prop || prop.status !== 'pending' || !prop.payload) return s;
      const next = applyProposalToState(s, prop.payload);
      // applyProposalToState returns the SAME reference on a no-op (missing day/exercise/lib),
      // so only post an acknowledgement when the change actually landed — otherwise the coach
      // would claim "Done" on a silent no-op.
      const applied = next !== s;
      const withStatus = next.coachMessages.map(m =>
        m.id === messageId
          ? { ...m, proposals: m.proposals?.map((pr, i) => (i === index ? { ...pr, status: 'applied' as const } : pr)) }
          : m
      );
      const coachMessages = applied
        ? [...withStatus, { id: ackId, role: 'assistant' as const, content: coachAckText(prop) }].slice(-COACH_HISTORY_CAP)
        : withStatus;
      return { ...next, coachMessages };
    });
  }, []);

  // Bulk version of the above, for a turn that proposed several changes at once. Folds every
  // pending applicable proposal through the same pure reducer inside ONE setState, so each step
  // sees the result of the previous one — applying "add X" then "swap Y for Z" one card at a time
  // would otherwise race the re-render between dispatches.
  //
  // Posts a single acknowledgement instead of one per card. That's not just tidier: each ack grows
  // coachMessages, and a growing message list is what used to yank the chat to the bottom on every
  // Apply (see CoachScreen's auto-scroll).
  const applyAllCoachProposals = useCallback((messageId: string) => {
    const ackId = nextCoachId();
    setState(s => {
      const msg = s.coachMessages.find(m => m.id === messageId);
      if (!msg || !msg.proposals) return s;
      let next = s;
      const appliedIdx = new Set<number>();
      msg.proposals.forEach((pr, i) => {
        if (pr.status !== 'pending' || !pr.payload) return;
        const after = applyProposalToState(next, pr.payload);
        // same reference-identity no-op test as applyCoachProposal: a proposal whose target has
        // gone away leaves the state untouched and must not be reported as applied.
        if (after !== next) { next = after; appliedIdx.add(i); }
      });
      if (!appliedIdx.size) return s;
      const applied = msg.proposals.filter((_, i) => appliedIdx.has(i));
      const withStatus = next.coachMessages.map(m =>
        m.id === messageId
          ? { ...m, proposals: m.proposals?.map((pr, i) => (appliedIdx.has(i) ? { ...pr, status: 'applied' as const } : pr)) }
          : m
      );
      const coachMessages = [...withStatus, { id: ackId, role: 'assistant' as const, content: coachAckAllText(applied) }].slice(-COACH_HISTORY_CAP);
      return { ...next, coachMessages };
    });
  }, []);

  const dismissCoachProposal = useCallback((messageId: string, index: number) => {
    setState(s => ({
      ...s,
      coachMessages: s.coachMessages.map(m =>
        m.id === messageId
          ? { ...m, proposals: m.proposals?.map((pr, i) => (i === index && pr.status === 'pending' ? { ...pr, status: 'dismissed' as const } : pr)) }
          : m
      )
    }));
  }, []);

  const openAddExerciseForm = useCallback(() => {
    setState(s => ({
      ...s,
      exerciseForm: {
        editingId: null, name: '', muscle: MUSCLES[0], secondary: [],
        equip: [], restBase: 90, repLo: 10, repHi: 12, compound: false, pattern: '', cue: '', error: '',
        trackingMode: 'reps'
      }
    }));
  }, []);
  const openEditExerciseForm = useCallback((id: string) => {
    const lib = EXLIB[id];
    setState(s => ({
      ...s,
      exerciseForm: {
        editingId: id, name: lib.name, muscle: lib.muscle, secondary: [...lib.secondary],
        equip: lib.equip.map(e => e.v), restBase: lib.restBase, repLo: lib.repLo, repHi: lib.repHi,
        compound: lib.compound, pattern: lib.pattern || '', cue: lib.cue, error: '',
        trackingMode: lib.trackingMode || 'reps'
      },
      libraryDetailId: null
    }));
  }, []);
  const closeExerciseForm = useCallback(() => setState(s => ({ ...s, exerciseForm: null })), []);
  const setExerciseFormField = useCallback((field: keyof ExerciseFormState, val: string | number | boolean) => {
    setState(s => (s.exerciseForm ? { ...s, exerciseForm: { ...s.exerciseForm, [field]: val, error: '' } } : s));
  }, []);
  const toggleFormMuscle = useCallback((muscle: Muscle) => {
    setState(s => {
      if (!s.exerciseForm) return s;
      const secondary = s.exerciseForm.secondary.filter(m => m !== muscle);
      return { ...s, exerciseForm: { ...s.exerciseForm, muscle, secondary, error: '' } };
    });
  }, []);
  const toggleFormSecondary = useCallback((muscle: Muscle) => {
    setState(s => {
      if (!s.exerciseForm || muscle === s.exerciseForm.muscle) return s;
      const has = s.exerciseForm.secondary.includes(muscle);
      const secondary = has ? s.exerciseForm.secondary.filter(m => m !== muscle) : [...s.exerciseForm.secondary, muscle];
      return { ...s, exerciseForm: { ...s.exerciseForm, secondary } };
    });
  }, []);
  const toggleFormEquip = useCallback((v: string) => {
    setState(s => {
      if (!s.exerciseForm) return s;
      const has = s.exerciseForm.equip.includes(v);
      const equip = has ? s.exerciseForm.equip.filter(x => x !== v) : [...s.exerciseForm.equip, v];
      return { ...s, exerciseForm: { ...s.exerciseForm, equip, error: '' } };
    });
  }, []);
  const saveExerciseForm = useCallback(() => {
    setState(s => {
      const f = s.exerciseForm;
      if (!f) return s;
      const name = f.name.trim();
      if (!name) return { ...s, exerciseForm: { ...f, error: 'Give this exercise a name.' } };
      if (!f.equip.length) return { ...s, exerciseForm: { ...f, error: 'Pick at least one equipment option.' } };
      const repLo = Math.max(1, Number(f.repLo) || (f.trackingMode === 'time' ? 20 : 10));
      const repHi = Math.max(repLo, Number(f.repHi) || repLo);
      let id = f.editingId;
      if (!id) {
        const base = slugify(name);
        let candidate = base, n = 2;
        while (EXLIB[candidate]) { candidate = base + '_' + n; n++; }
        id = candidate;
      }
      const def = {
        name, muscle: f.muscle, compound: f.compound, restBase: Number(f.restBase) || 90,
        pattern: f.pattern.trim() || id,
        equip: f.equip.map(v => { const c = EQUIP_CATALOG.find(e => e.v === v); return { v, label: c ? c.label : v }; }),
        repLo, repHi, cue: f.cue.trim() || 'Focus on a controlled tempo and full range of motion.',
        secondary: f.secondary, trackingMode: f.trackingMode
      };
      EXLIB[id] = def;
      invalidateExerciseNameCache();
      // Editing can SHRINK the equip list, leaving program/workout slots pointing at an
      // equipIdx that no longer exists — which crashed render on `lib.equip[ex.equipIdx].label`.
      // Reset any now-out-of-range slot to variant 0 (same choice applyExerciseSwaps makes).
      const clampSlots = (days: AppState['program'], dayOrder: string[]): AppState['program'] => {
        const copy: AppState['program'] = {};
        dayOrder.forEach(k => {
          copy[k] = {
            ...days[k],
            exercises: days[k].exercises.map(ex =>
              ex.id === id && ex.equipIdx >= def.equip.length ? { ...ex, equipIdx: 0 } : ex
            )
          };
        });
        return copy;
      };
      const program = f.editingId ? clampSlots(s.program, s.dayOrder) : s.program;
      const savedPrograms = f.editingId
        ? Object.fromEntries(
            Object.entries(s.savedPrograms).map(([pid, sp]) => [pid, { ...sp, days: clampSlots(sp.days, sp.dayOrder) }])
          )
        : s.savedPrograms;
      const workout =
        f.editingId && s.workout
          ? {
              ...s.workout,
              dayExercises: s.workout.dayExercises.map(ex =>
                ex.id === id && ex.equipIdx >= def.equip.length ? { ...ex, equipIdx: 0 } : ex
              )
            }
          : s.workout;
      return {
        ...s, program, savedPrograms, workout,
        customExercises: { ...s.customExercises, [id]: def },
        exerciseForm: null, libraryDetailId: null
      };
    });
  }, []);
  const deleteExercise = useCallback((id: string) => {
    delete EXLIB[id];
    invalidateExerciseNameCache();
    setState(s => {
      const scrub = (days: AppState['program'], dayOrder: string[]) => {
        const copy: AppState['program'] = {};
        dayOrder.forEach(k => { copy[k] = { ...days[k], exercises: days[k].exercises.filter(ex => ex.id !== id) }; });
        return copy;
      };
      const program = scrub(s.program, s.dayOrder);
      const savedPrograms: AppState['savedPrograms'] = {};
      Object.keys(s.savedPrograms).forEach(pid => {
        const sp = s.savedPrograms[pid];
        savedPrograms[pid] = { ...sp, days: scrub(sp.days, sp.dayOrder) };
      });
      let workout = s.workout;
      if (workout && workout.dayExercises.some(ex => ex.id === id)) {
        // Remap exSets to the surviving exercises' NEW indices (same as removeWorkoutExercise) —
        // filtering dayExercises alone left exSets keyed by the old positions, shifting every
        // later exercise's logged sets onto its neighbour and logging them to the wrong history.
        const keep: number[] = [];
        workout.dayExercises.forEach((ex, i) => { if (ex.id !== id) keep.push(i); });
        const dayExercises = keep.map(i => workout!.dayExercises[i]);
        const exSets: typeof workout.exSets = {};
        keep.forEach((oldIdx, newIdx) => { if (workout!.exSets[oldIdx]) exSets[newIdx] = workout!.exSets[oldIdx]; });
        workout = dayExercises.length
          ? { ...workout, dayExercises, exSets, exIndex: Math.min(workout.exIndex, dayExercises.length - 1) }
          : null;
      }
      const customExercises = { ...s.customExercises };
      delete customExercises[id];
      return {
        ...s, program, savedPrograms, workout, customExercises,
        confirmDeleteExId: null, libraryDetailId: null, exerciseForm: null
      };
    });
  }, []);
  const requestDeleteExercise = useCallback((id: string) => {
    if (state.confirmDeleteExId === id) {
      deleteExercise(id);
    } else {
      setState(s => ({ ...s, confirmDeleteExId: id }));
    }
  }, [state.confirmDeleteExId, deleteExercise]);

  // ---------- swap modal ----------
  const openSwap = useCallback((dayKey: string, exIndex: number, tab: 'equip' | 'replace', isAdd: boolean) => {
    setState(s => ({ ...s, swap: { dayKey, exIndex, tab, stagedEquipIdx: null, stagedExId: null, showAll: false, isAdd: !!isAdd, query: '' } }));
  }, []);
  const closeSwap = useCallback(() => setState(s => ({ ...s, swap: null })), []);
  const setSwapQuery = useCallback((q: string) => setState(s => (s.swap ? { ...s, swap: { ...s.swap, query: q } } : s)), []);
  const swapTab = useCallback((tab: 'equip' | 'replace') => setState(s => (s.swap ? { ...s, swap: { ...s.swap, tab, stagedEquipIdx: null, stagedExId: null } } : s)), []);
  const swapToggleAll = useCallback(() => setState(s => (s.swap ? { ...s, swap: { ...s.swap, showAll: !s.swap.showAll } } : s)), []);
  const swapStageEquip = useCallback((idx: number) => setState(s => (s.swap ? { ...s, swap: { ...s.swap, stagedEquipIdx: idx } } : s)), []);
  const swapStageEx = useCallback((id: string) => setState(s => (s.swap ? { ...s, swap: { ...s.swap, stagedExId: id } } : s)), []);

  // ---------- muscle drill-down quick "switch exercise" (can span multiple days) ----------
  const openMuscleSwap = useCallback((dayKey: string, exId: string) => {
    setState(s => {
      const dayKeys = s.dayOrder.filter(k => s.program[k] && s.program[k].exercises.some(e => e.id === exId));
      return { ...s, muscleSwap: { exId, dayKeys, selectedDayKeys: [dayKey], stagedExId: null, showAll: false, query: '' } };
    });
  }, []);
  const closeMuscleSwap = useCallback(() => setState(s => ({ ...s, muscleSwap: null })), []);
  const toggleMuscleSwapDay = useCallback((dayKey: string) => {
    setState(s => {
      if (!s.muscleSwap) return s;
      const has = s.muscleSwap.selectedDayKeys.includes(dayKey);
      if (has && s.muscleSwap.selectedDayKeys.length === 1) return s; // keep at least one day selected
      const selectedDayKeys = has ? s.muscleSwap.selectedDayKeys.filter(k => k !== dayKey) : [...s.muscleSwap.selectedDayKeys, dayKey];
      return { ...s, muscleSwap: { ...s.muscleSwap, selectedDayKeys } };
    });
  }, []);
  const muscleSwapToggleAll = useCallback(() => setState(s => (s.muscleSwap ? { ...s, muscleSwap: { ...s.muscleSwap, showAll: !s.muscleSwap.showAll } } : s)), []);
  const muscleSwapSetQuery = useCallback((q: string) => setState(s => (s.muscleSwap ? { ...s, muscleSwap: { ...s.muscleSwap, query: q } } : s)), []);
  const muscleSwapStageEx = useCallback((id: string) => setState(s => (s.muscleSwap ? { ...s, muscleSwap: { ...s.muscleSwap, stagedExId: id } } : s)), []);
  const muscleSwapConfirm = useCallback(() => {
    setState(s => {
      const ms = s.muscleSwap;
      if (!ms || !ms.stagedExId) return s;
      const lib = EXLIB[ms.stagedExId];
      const program = JSON.parse(JSON.stringify(s.program));
      ms.selectedDayKeys.forEach(dayKey => {
        const day = program[dayKey];
        if (!day) return;
        const oldEx = day.exercises.find((ex: ProgramExercise) => ex.id === ms.exId);
        const oldGroup = oldEx?.supersetGroup;
        day.exercises = day.exercises.map((ex: ProgramExercise) => (ex.id === ms.exId ? mkEx(ms.stagedExId as string, ex.sets, 0, { weight: 0, reps: lib.repHi, hitTop: true }) : ex));
        if (oldGroup) {
          const partner = day.exercises.find((e: ProgramExercise) => e.supersetGroup === oldGroup);
          if (partner) partner.supersetGroup = null;
        }
      });
      return { ...s, program, muscleSwap: null };
    });
  }, []);

  const swapConfirm = useCallback(() => {
    setState(s => {
      const swap = s.swap;
      if (!swap) return s;
      const inSession = !!s.workout && s.workout.dayKey === swap.dayKey;
      if (inSession && s.workout) {
        if (swap.isAdd) {
          if (!swap.stagedExId) return { ...s, swap: null };
          const lib = EXLIB[swap.stagedExId];
          const newEx = mkEx(swap.stagedExId, 3, 0, { weight: 0, reps: lib.repHi, hitTop: true });
          const dayExercises = [...s.workout.dayExercises, newEx];
          const newIdx = dayExercises.length - 1;
          const rec = recommendation(newEx, s.units, s.coachVoice, s.exerciseHistory[newEx.id], s.exerciseHistory, activeDeloadPct(s), s.trainingType);
          const sets: WorkoutSetRow[] = [];
          for (let i = 0; i < newEx.sets; i++) sets.push({ weight: rec.weight, reps: rec.reps, done: false });
          const exSets = { ...s.workout.exSets, [newIdx]: sets };
          const restTotal = restTotalFor(dayExercises, newIdx, s.restPacing, s.trainingType);
          return {
            ...s,
            workout: { ...s.workout, dayExercises, exIndex: newIdx, exSets, changesMade: s.workout.changesMade + 1, resting: false, restRemaining: 0, restEndAt: null, restTotal },
            swap: null
          };
        }
        const idx = swap.exIndex;
        const oldEx = s.workout.dayExercises[idx];
        let newEx = oldEx;
        if (swap.tab === 'equip' && swap.stagedEquipIdx != null) newEx = blankSlotForEquip(oldEx, swap.stagedEquipIdx, s.trainingType);
        else if (swap.tab === 'replace' && swap.stagedExId) {
          // a swapped-in exercise is a different exercise — the old superset link doesn't carry
          // over automatically (the user can re-link it if they want the new one paired too).
          newEx = mkEx(swap.stagedExId, oldEx.sets, 0, { weight: 0, reps: EXLIB[swap.stagedExId].repHi, hitTop: true });
        }
        let dayExercises = s.workout.dayExercises.map((ex, i) => (i === idx ? newEx : ex));
        if (swap.tab === 'replace' && oldEx.supersetGroup) {
          dayExercises = dayExercises.map(e => (e.supersetGroup === oldEx.supersetGroup ? { ...e, supersetGroup: null } : e));
        }
        const rec = recommendation(newEx, s.units, s.coachVoice, s.exerciseHistory[newEx.id], s.exerciseHistory, activeDeloadPct(s), s.trainingType);
        const sets: WorkoutSetRow[] = [];
        for (let i = 0; i < newEx.sets; i++) sets.push({ weight: rec.weight, reps: rec.reps, done: false });
        const exSets = { ...s.workout.exSets, [idx]: sets };
        const restTotal = restTotalFor(dayExercises, idx, s.restPacing, s.trainingType);
        return { ...s, workout: { ...s.workout, dayExercises, changesMade: s.workout.changesMade + 1, exSets, restTotal }, swap: null };
      }
      const program = JSON.parse(JSON.stringify(s.program));
      const day = program[swap.dayKey];
      if (swap.isAdd) {
        if (swap.stagedExId) {
          const lib = EXLIB[swap.stagedExId];
          day.exercises.push(mkEx(swap.stagedExId, 3, 0, { weight: 0, reps: lib.repHi, hitTop: true }));
        }
      } else if (swap.tab === 'equip' && swap.stagedEquipIdx != null) {
        day.exercises[swap.exIndex] = blankSlotForEquip(day.exercises[swap.exIndex], swap.stagedEquipIdx, s.trainingType);
      } else if (swap.tab === 'replace' && swap.stagedExId) {
        const lib = EXLIB[swap.stagedExId];
        const oldGroup = day.exercises[swap.exIndex].supersetGroup;
        day.exercises[swap.exIndex] = mkEx(swap.stagedExId, day.exercises[swap.exIndex].sets, 0, { weight: 0, reps: lib.repHi, hitTop: true });
        if (oldGroup) {
          const partner = day.exercises.find((e: ProgramExercise) => e.supersetGroup === oldGroup);
          if (partner) partner.supersetGroup = null;
        }
      }
      return { ...s, program, swap: null };
    });
  }, []);

  // removes an exercise from the active workout session's working copy only — like equip/replace,
  // the saved plan isn't touched until the end-of-workout "update your plan?" prompt is confirmed.
  const removeWorkoutExercise = useCallback((idx: number) => {
    setState(s => {
      if (!s.workout || s.workout.dayExercises.length <= 1) return s;
      const removedGroup = s.workout.dayExercises[idx].supersetGroup;
      let dayExercises = s.workout.dayExercises.filter((_, i) => i !== idx);
      if (removedGroup) {
        dayExercises = dayExercises.map(e => (e.supersetGroup === removedGroup ? { ...e, supersetGroup: null } : e));
      }
      const exSets: Record<number, WorkoutSetRow[]> = {};
      s.workout.dayExercises.forEach((_, i) => {
        if (i === idx) return;
        const newIdx = i < idx ? i : i - 1;
        if (s.workout!.exSets[i]) exSets[newIdx] = s.workout!.exSets[i];
      });
      let exIndex = s.workout.exIndex;
      if (exIndex === idx) exIndex = Math.max(0, idx - 1);
      else if (exIndex > idx) exIndex -= 1;
      // landing on an exercise that was never visited yet (so its sets were never lazily built)
      // would otherwise show an empty working-sets list — build its default sets now.
      if (!exSets[exIndex]) {
        const landedEx = dayExercises[exIndex];
        const rec = recommendation(landedEx, s.units, s.coachVoice, s.exerciseHistory[landedEx.id], s.exerciseHistory, activeDeloadPct(s), s.trainingType);
        const sets: WorkoutSetRow[] = [];
        for (let i = 0; i < landedEx.sets; i++) sets.push({ weight: rec.weight, reps: rec.reps, done: false });
        exSets[exIndex] = sets;
      }
      const restTotal = restTotalFor(dayExercises, exIndex, s.restPacing, s.trainingType);
      return { ...s, workout: { ...s.workout, dayExercises, exSets, exIndex, resting: false, restRemaining: 0, restEndAt: null, restTotal, changesMade: s.workout.changesMade + 1 } };
    });
  }, []);

  // Removing an exercise mid-workout throws away any sets already logged against it and can't be
  // undone, so the ✕ Remove button stages the request and a confirm dialog commits it.
  const requestRemoveWorkoutExercise = useCallback((idx: number) => setState(s => ({ ...s, confirmRemoveExIndex: idx })), []);
  const cancelRemoveWorkoutExercise = useCallback(() => setState(s => ({ ...s, confirmRemoveExIndex: null })), []);
  const confirmRemoveWorkoutExercise = useCallback(() => {
    const idx = stateRef.current.confirmRemoveExIndex;
    setState(s => ({ ...s, confirmRemoveExIndex: null }));
    if (idx != null) removeWorkoutExercise(idx);
  }, [removeWorkoutExercise]);

  // Reorders the currently active exercise relative to its neighbor, mid-session — like the
  // add/remove/swap actions above, this only touches the session's working copy
  // (workout.dayExercises), counts toward changesMade, and only reaches the saved plan if the
  // user confirms the "update your plan?" prompt at workout completion (see completeWorkout()).
  const moveWorkoutExercise = useCallback((direction: 'up' | 'down') => {
    setState(s => {
      if (!s.workout) return s;
      const idx = s.workout.exIndex;
      const target = idx + (direction === 'up' ? -1 : 1);
      if (target < 0 || target >= s.workout.dayExercises.length) return s;
      const dayExercises = [...s.workout.dayExercises];
      [dayExercises[idx], dayExercises[target]] = [dayExercises[target], dayExercises[idx]];
      const exSets: Record<number, WorkoutSetRow[]> = { ...s.workout.exSets };
      const displaced = exSets[idx];
      if (exSets[target] !== undefined) exSets[idx] = exSets[target]; else delete exSets[idx];
      if (displaced !== undefined) exSets[target] = displaced; else delete exSets[target];
      return { ...s, workout: { ...s.workout, dayExercises, exSets, exIndex: target, changesMade: s.workout.changesMade + 1 } };
    });
  }, []);

  // ---------- day builder ----------
  // Links exercise `idx` with the exercise right after it as an adjacent-pair superset (shared
  // group id) — or unlinks both if they're already linked. Scoped to pairs, not arbitrary
  // N-exercise circuits, to keep the workout-flow state machine (one active exercise at a time)
  // tractable — see toggleSetDone below for how the pairing changes rest behavior mid-workout.
  // Links exercise idxA with idxB (any two slots in the day, not just adjacent ones — the workout-
  // flow logic in toggleSetDone/restTotalFor below only ever looks up a partner by matching
  // supersetGroup, never by position, so non-adjacent pairing already works with no further
  // changes needed there). Calling this again on the same pair unlinks both. Calling it when either
  // side is already linked to a *different* exercise re-links: the old pair is broken first, so an
  // exercise is never a member of more than one pair at a time.
  const toggleSuperset = useCallback((dayKey: string, idxA: number, idxB: number) => {
    setState(s => {
      const program = JSON.parse(JSON.stringify(s.program));
      const exercises = program[dayKey].exercises;
      const a = exercises[idxA], b = exercises[idxB];
      if (!a || !b) return s;
      if (a.supersetGroup && a.supersetGroup === b.supersetGroup) {
        a.supersetGroup = null; b.supersetGroup = null;
        return { ...s, program };
      }
      if (a.supersetGroup) {
        const oldPartner = exercises.find((e: ProgramExercise, i: number) => i !== idxA && e.supersetGroup === a.supersetGroup);
        if (oldPartner) oldPartner.supersetGroup = null;
      }
      if (b.supersetGroup) {
        const oldPartner = exercises.find((e: ProgramExercise, i: number) => i !== idxB && e.supersetGroup === b.supersetGroup);
        if (oldPartner) oldPartner.supersetGroup = null;
      }
      const gid = 'ss' + Date.now();
      a.supersetGroup = gid; b.supersetGroup = gid;
      return { ...s, program };
    });
  }, []);
  const removeExercise = useCallback((dayKey: string, idx: number) => {
    setState(s => {
      const program = JSON.parse(JSON.stringify(s.program));
      const removed = program[dayKey].exercises[idx];
      program[dayKey].exercises.splice(idx, 1);
      // clear a dangling link on the removed exercise's former partner, if any, so no group id
      // ever points at an exercise that no longer exists in the day.
      if (removed?.supersetGroup) {
        const partner = program[dayKey].exercises.find((e: ProgramExercise) => e.supersetGroup === removed.supersetGroup);
        if (partner) partner.supersetGroup = null;
      }
      return { ...s, program };
    });
  }, []);
  // Tap-twice confirm for the Day Builder's ✕ — it permanently deletes the slot from the plan,
  // which used to be a single unguarded tap while the *session-only* mid-workout remove had a
  // full confirm dialog (the higher-stakes action was the unprotected one).
  const requestRemoveBuilderExercise = useCallback((dayKey: string, idx: number) => {
    if (stateRef.current.confirmRemoveBuilderIdx === idx) {
      setState(s => ({ ...s, confirmRemoveBuilderIdx: null }));
      removeExercise(dayKey, idx);
    } else {
      setState(s => ({ ...s, confirmRemoveBuilderIdx: idx }));
    }
  }, [removeExercise]);
  const changeSets = useCallback((dayKey: string, idx: number, delta: number) => {
    setState(s => {
      const program = JSON.parse(JSON.stringify(s.program));
      const ex = program[dayKey].exercises[idx];
      ex.sets = Math.max(1, Math.min(8, ex.sets + delta));
      return { ...s, program };
    });
  }, []);
  // Reordering doesn't touch supersetGroup at all — links are matched by group id, not position
  // (see toggleSuperset above), so a linked pair stays linked even if reordering makes them non-
  // adjacent; DayBuilderScreen's "linked elsewhere" label already handles showing that case.
  const moveExercise = useCallback((dayKey: string, idx: number, direction: 'up' | 'down') => {
    setState(s => {
      const target = idx + (direction === 'up' ? -1 : 1);
      const exercises = s.program[dayKey].exercises;
      if (target < 0 || target >= exercises.length) return s;
      const program = JSON.parse(JSON.stringify(s.program));
      const arr = program[dayKey].exercises;
      [arr[idx], arr[target]] = [arr[target], arr[idx]];
      return { ...s, program };
    });
  }, []);
  // Drag-to-reorder equivalent of moveExercise above (arbitrary from/to instead of a single-step
  // swap) — used by DayViewScreen's press-and-hold drag list, which recomputes the target index
  // continuously as the dragged row passes over its neighbors rather than one step at a time.
  const reorderExercise = useCallback((dayKey: string, fromIdx: number, toIdx: number) => {
    setState(s => {
      const exercises = s.program[dayKey].exercises;
      if (fromIdx === toIdx || fromIdx < 0 || fromIdx >= exercises.length || toIdx < 0 || toIdx >= exercises.length) return s;
      const program = JSON.parse(JSON.stringify(s.program));
      const arr = program[dayKey].exercises;
      const [moved] = arr.splice(fromIdx, 1);
      arr.splice(toIdx, 0, moved);
      return { ...s, program };
    });
  }, []);
  // Day View quick-edit modal's weight/reps steppers — writes a manualTarget override (see
  // ProgramExercise.manualTarget) rather than ex.last directly, since ex.last alone would be
  // silently outranked by cross-day exerciseHistory in effectiveLast() the moment this exercise
  // has been logged anywhere before (the overwhelmingly common case).
  const setExerciseTarget = useCallback((dayKey: string, idx: number, field: 'weight' | 'reps', val: number) => {
    setState(s => {
      const program = JSON.parse(JSON.stringify(s.program));
      const ex: ProgramExercise = program[dayKey].exercises[idx];
      const base = ex.manualTarget || effectiveLast(ex, s.exerciseHistory[ex.id]);
      ex.manualTarget = { weight: base.weight, reps: base.reps, [field]: Math.max(0, val) };
      return { ...s, program };
    });
  }, []);
  const bumpExerciseTarget = useCallback((dayKey: string, idx: number, field: 'weight' | 'reps', delta: number) => {
    setState(s => {
      const program = JSON.parse(JSON.stringify(s.program));
      const ex: ProgramExercise = program[dayKey].exercises[idx];
      const base = ex.manualTarget || effectiveLast(ex, s.exerciseHistory[ex.id]);
      ex.manualTarget = { weight: base.weight, reps: base.reps, [field]: Math.max(0, base[field] + delta) };
      return { ...s, program };
    });
  }, []);

  // ---------- workout ----------
  const buildWorkoutExercise = useCallback((exIndex: number) => {
    setState(s => {
      if (!s.workout) return s;
      const prevExSets = s.workout.exSets;
      let exSets = prevExSets;
      if (!exSets[exIndex]) {
        const ex = s.workout.dayExercises[exIndex];
        const rec = recommendation(ex, s.units, s.coachVoice, s.exerciseHistory[ex.id], s.exerciseHistory, activeDeloadPct(s), s.trainingType);
        const sets: WorkoutSetRow[] = [];
        for (let i = 0; i < ex.sets; i++) sets.push({ weight: rec.weight, reps: rec.reps, done: false });
        exSets = { ...prevExSets, [exIndex]: sets };
      }
      const restTotal = restTotalFor(s.workout.dayExercises, exIndex, s.restPacing, s.trainingType);
      return { ...s, workout: { ...s.workout, exIndex, exSets, resting: false, restRemaining: 0, restEndAt: null, restTotal }, confirmEndEarly: false };
    });
  }, []);

  const stopRest = useCallback(() => {
    if (restInterval.current) { window.clearInterval(restInterval.current); restInterval.current = null; }
    // Fire-and-forget: clears any lingering "Resting… Xs remaining" tray notification left over
    // from a rest period that was skipped/adjusted/exited rather than left to run out naturally
    // (the natural-completion path in restTick below replaces it with the "Rest complete" alert
    // instead of clearing it, so this only matters for early-exit paths).
    clearRestProgressNotification();
  }, []);

  // Shared by the 1s interval and the visibilitychange resync below, so a throttled/suspended
  // interval (backgrounded tab, minimized PWA) still resolves correctly the moment either one next
  // gets to run — remaining time is always derived from the absolute restEndAt, never decremented,
  // so there's nothing to drift or double-count between the two call sites.
  // Alerts fire *outside* the setState updater deliberately. An updater must be a pure function —
  // React (and StrictMode especially) may invoke it more than once per commit, which previously
  // meant the vibrate/sound/notification could double-fire or, on a bailed-out update, not fire at
  // all. State is read from stateRef here instead, and restDoneForRef makes completion idempotent
  // per rest period (keyed on that period's restEndAt) so the 1s interval and the visibilitychange
  // resync can both call this without ever alerting twice for the same rest.
  // What the tray notifications say about the session in progress. Built from the same live state
  // the in-app rest toast reads, so the two can't drift apart. Returns undefined rather than
  // half-filled placeholders if the workout has gone away mid-flight — alerts.ts then falls back to
  // its generic copy instead of announcing "undefined · Set NaN of 4".
  const restContext = useCallback((s: AppState): RestContext | undefined => {
    const w = s.workout;
    if (!w) return undefined;
    const ex = w.dayExercises[w.exIndex];
    if (!ex) return undefined;
    const sets = w.exSets[w.exIndex] || [];
    // The set they're resting *into* — the first one not yet ticked. Once every set is done the
    // rest is trailing the last set of the exercise, so fall back to naming that one.
    const nextIdx = sets.findIndex(r => !r.done);
    const setNo = nextIdx === -1 ? sets.length : nextIdx + 1;
    const target = sets[nextIdx === -1 ? sets.length - 1 : nextIdx];
    return {
      exerciseName: EXLIB[ex.id]?.name || 'Next exercise',
      setLabel: sets.length ? `Set ${setNo} of ${sets.length}` : '',
      targetText: target ? (target.weight > 0 ? `${fmtWeight(target.weight, s.units)} × ${target.reps}` : `${target.reps} reps`) : '',
      dayLabel: s.program[w.dayKey]?.label || '',
      firstName: (s.userName || '').trim().split(/\s+/)[0] || undefined
    };
  }, []);

  const restTick = useCallback(() => {
    const cur = stateRef.current;
    if (!cur.workout || !cur.workout.resting || cur.workout.restEndAt == null) return;
    const endAt = cur.workout.restEndAt;
    const remainingMs = endAt - Date.now();
    if (remainingMs <= 0) {
      if (restDoneForRef.current === endAt) return;
      restDoneForRef.current = endAt;
      if (restInterval.current) { window.clearInterval(restInterval.current); restInterval.current = null; }
      if (cur.restAlertVibrate) vibrateRestEnd();
      if (cur.restAlertSound) playRestEndSound();
      // Fire the notification whenever vibrate OR notify is on, not just notify: the default
      // restAlertVibrate:true setting should still reach a backgrounded phone (where
      // navigator.vibrate is a no-op) via the OS alerting on the notification — see alerts.ts.
      if (cur.restAlertVibrate || cur.restAlertNotify) notifyRestEnd(cur.restAlertVibrate, restContext(cur), cur.coachVoice);
      setState(s => (s.workout ? { ...s, workout: { ...s.workout, resting: false, restRemaining: 0, restEndAt: null } } : s));
      return;
    }
    // Best-effort live countdown in the tray while backgrounded — the in-app toast (RestToast)
    // already covers the foreground case (ticking locally off restEndAt, see useClock.ts), so
    // this only needs to run when the document is actually hidden. Note there is deliberately NO
    // per-second setState here anymore: writing restRemaining into AppState every second meant a
    // full re-render + view-model rebuild + state re-serialization (persist AND cloud-sync
    // dirty-marking) once a second for every rest period. restRemaining is still written at
    // transition points (start/adjust/skip/end) but is no longer a live counter.
    if (cur.restAlertNotify && document.hidden) updateRestProgressNotification(Math.round(remainingMs / 1000), restContext(cur));
  }, [restContext]);

  // Vibrate/WebAudio are both restricted to a visible document by the browser (vibrate no-ops
  // outright when hidden; WebAudio typically self-suspends) — resyncing on visibilitychange is
  // mainly what makes the Notification alert (the one channel that *can* reach a backgrounded app)
  // fire promptly rather than only whenever the throttled interval next happens to tick.
  useEffect(() => {
    const onVisibilityChange = () => { if (document.visibilityState === 'visible') restTick(); };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, [restTick]);

  const switchExercise = useCallback((exIndex: number) => {
    stopRest();
    buildWorkoutExercise(exIndex);
  }, [stopRest, buildWorkoutExercise]);

  const startWorkout = useCallback(() => {
    setState(s => {
      const dayKey = s.activeDayKey;
      if (!dayKey) return s;
      const program = JSON.parse(JSON.stringify(s.program));
      program[dayKey].skipped = false;
      program[dayKey].lastCompletedAt = null;
      const dayExercises: ProgramExercise[] = JSON.parse(JSON.stringify(program[dayKey].exercises));
      const ex0 = dayExercises[0];
      const rec0 = recommendation(ex0, s.units, s.coachVoice, s.exerciseHistory[ex0.id], s.exerciseHistory, activeDeloadPct(s), s.trainingType);
      const sets0: WorkoutSetRow[] = [];
      for (let i = 0; i < ex0.sets; i++) sets0.push({ weight: rec0.weight, reps: rec0.reps, done: false });
      return {
        ...s, program, screen: 'workout' as Screen,
        workout: {
          dayKey, exIndex: 0, exSets: { 0: sets0 }, dayExercises, changesMade: 0,
          resting: false, restRemaining: 0, restEndAt: null, restTotal: restTotalFor(dayExercises, 0, s.restPacing, s.trainingType), startedAt: Date.now()
        }
      };
    });
  }, []);

  // restSecOverride lets the caller (toggleSetDone) recompute rest against the RIR of the set that
  // was just completed — the stored workout.restTotal is the neutral (RIR-unknown) value set when
  // the exercise was built, so without this the logged effort of the finishing set wouldn't affect
  // its own rest. Falls back to the stored total for any other caller.
  const startRest = useCallback((restSecOverride?: number) => {
    stopRest();
    setState(s => {
      if (!s.workout) return s;
      // Contextual permission prompt: the first time a rest period actually starts with vibrate
      // or notify enabled (both default/commonly on), rather than requesting at cold app boot
      // where the ask has no context and is easy to reflexively deny.
      if ((s.restAlertVibrate || s.restAlertNotify)) requestNotifyPermissionIfNeeded();
      const total = restSecOverride ?? s.workout.restTotal;
      const restEndAt = Date.now() + total * 1000;
      return { ...s, workout: { ...s.workout, resting: true, restTotal: total, restRemaining: total, restEndAt } };
    });
    restInterval.current = window.setInterval(restTick, 1000);
  }, [stopRest, restTick]);

  const restAdjust = useCallback((delta: number) => {
    setState(s => {
      if (!s.workout || s.workout.restEndAt == null) return s;
      // Derive the new remaining time from the absolute restEndAt, not the stored restRemaining —
      // that field is no longer ticked down every second (see restTick), so it can be stale here.
      const restEndAt = Math.max(Date.now(), s.workout.restEndAt + delta * 1000);
      const restRemaining = Math.round((restEndAt - Date.now()) / 1000);
      return { ...s, workout: { ...s.workout, restRemaining, restTotal: Math.max(s.workout.restTotal, restRemaining), restEndAt } };
    });
  }, []);
  const restSkip = useCallback(() => {
    stopRest();
    setState(s => (s.workout ? { ...s, workout: { ...s.workout, resting: false, restRemaining: 0, restEndAt: null } } : s));
  }, [stopRest]);

  const setSetField = useCallback((i: number, field: 'weight' | 'reps', val: number) => {
    setState(s => {
      if (!s.workout) return s;
      const idx = s.workout.exIndex;
      const sets = s.workout.exSets[idx].map((row, k) => (k === i ? { ...row, [field]: val } : row));
      return { ...s, workout: { ...s.workout, exSets: { ...s.workout.exSets, [idx]: sets } } };
    });
  }, []);
  const setSetRir = useCallback((i: number, val: number) => {
    setState(s => {
      if (!s.workout) return s;
      const idx = s.workout.exIndex;
      const sets = s.workout.exSets[idx].map((row, k) => (k === i ? { ...row, rir: row.rir === val ? undefined : val } : row));
      return { ...s, workout: { ...s.workout, exSets: { ...s.workout.exSets, [idx]: sets } } };
    });
  }, []);
  const bumpSetField = useCallback((i: number, field: 'weight' | 'reps', delta: number) => {
    setState(s => {
      if (!s.workout) return s;
      const idx = s.workout.exIndex;
      const sets = s.workout.exSets[idx].map((row, k) => (k === i ? { ...row, [field]: Math.max(0, row[field] + delta) } : row));
      return { ...s, workout: { ...s.workout, exSets: { ...s.workout.exSets, [idx]: sets } } };
    });
  }, []);
  const toggleSetDone = useCallback((i: number) => {
    if (!state.workout) return;
    const idx = state.workout.exIndex;
    const nowDone = !state.workout.exSets[idx][i].done;
    const ex = state.workout.dayExercises[idx];
    setState(s => {
      if (!s.workout) return s;
      const idx2 = s.workout.exIndex;
      const sets = s.workout.exSets[idx2].map((r, k) => (k === i ? { ...r, done: nowDone } : r));
      return { ...s, workout: { ...s.workout, exSets: { ...s.workout.exSets, [idx2]: sets } } };
    });
    if (nowDone) {
      // linked superset partner: jump straight to it with no rest instead of resting, unless its
      // matching-index set is already done (i.e. this was the second half of the round) — then
      // fall through to a normal rest, shared across both exercises via restTotalFor().
      const partnerIdx = ex.supersetGroup
        ? state.workout.dayExercises.findIndex((e, k) => k !== idx && e.supersetGroup === ex.supersetGroup)
        : -1;
      if (partnerIdx !== -1) {
        const partnerSets = state.workout.exSets[partnerIdx];
        const partnerSetDone = !!(partnerSets && partnerSets[i] && partnerSets[i].done);
        if (!partnerSetDone) {
          switchExercise(partnerIdx);
          return;
        }
      }
      // Rest reflects the effort of the set just finished: a set logged at RIR 0 (failure) rests
      // longer than one left several reps short. Undefined rir (not logged) falls back to neutral.
      const completedRir = state.workout.exSets[idx][i].rir;
      const restSec = restTotalFor(state.workout.dayExercises, idx, state.restPacing, state.trainingType, completedRir);
      startRest(restSec);
    }
  }, [state.workout, state.restPacing, state.trainingType, startRest, switchExercise]);
  const addSet = useCallback(() => {
    setState(s => {
      if (!s.workout) return s;
      const idx = s.workout.exIndex;
      const cur = s.workout.exSets[idx];
      const last = cur[cur.length - 1];
      const sets = [...cur, { weight: last ? last.weight : 0, reps: last ? last.reps : 10, done: false }];
      return { ...s, workout: { ...s.workout, exSets: { ...s.workout.exSets, [idx]: sets } } };
    });
  }, []);
  const removeSet = useCallback((i: number) => {
    setState(s => {
      if (!s.workout) return s;
      const idx = s.workout.exIndex;
      const cur = s.workout.exSets[idx];
      if (cur.length <= 1) return s;
      const sets = cur.filter((_, k) => k !== i);
      return { ...s, workout: { ...s.workout, exSets: { ...s.workout.exSets, [idx]: sets } } };
    });
  }, []);

  const completeWorkout = useCallback(() => {
    setState(s => {
      if (!s.workout) return s;
      const dayKey = s.workout.dayKey;
      const dayLabel = s.program[dayKey].label;
      // A deload session is light on purpose, so it must not be written back as this exercise's
      // working target, and it can't count as a personal record. It's still logged, still counts
      // toward volume/duration/achievements — it just doesn't move the progression baseline.
      const deloading = activeDeloadPct(s) !== null;
      const summary: AppState['completeSummary'] = [];
      let totalVolume = 0;
      let totalSets = 0, totalReps = 0;
      const exercisesDoneMask: boolean[] = [];
      const updatedDayExercises = s.workout.dayExercises.map((ex, idx) => {
        const lib = EXLIB[ex.id];
        const equip = lib.equip[ex.equipIdx];
        // only sets actually checked off count as "done" — an exercise that was merely
        // visited (e.g. navigated to, then the workout was ended early) doesn't count.
        const rawSets = s.workout!.exSets[idx];
        const completedRows = rawSets ? rawSets.filter(r => r.done) : [];
        const doneSets = completedRows.length ? completedRows : null;
        exercisesDoneMask[idx] = !!doneSets;
        let newEx = ex;
        let isPR = false;
        if (doneSets) {
          const topSet = doneSets[doneSets.length - 1];
          const hitTop = doneSets.every(r => r.reps >= lib.repHi);
          // a fresh real log always supersedes a manual weight/reps correction, wherever it was set.
          // Not during a deload week though: the slot's stored target (and any manual correction)
          // should survive the light week untouched, so normal training resumes from the real
          // working weight rather than from 60% of it.
          if (!deloading) {
            newEx = { ...ex, last: { weight: topSet.weight, reps: topSet.reps, hitTop, rir: topSet.rir }, lastSets: doneSets.map(r => ({ weight: r.weight, reps: r.reps, rir: r.rir })), sets: doneSets.length, manualTarget: null };
          }
          doneSets.forEach(r => { totalVolume += (r.weight || 0) * r.reps; });
          const isBodyweight = equip.v === 'bodyweight' || equip.v === 'assisted';
          const isTime = lib.trackingMode === 'time';
          // Every completed set counts toward setCount; reps only from real rep-tracked work, since
          // a time exercise stores seconds in the reps slot (a plank isn't 45 reps).
          totalSets += doneSets.length;
          if (!isTime) totalReps += doneSets.reduce((a, r) => a + (r.reps || 0), 0);
          // PRs are per equipment variant — a dumbbell set is judged only against dumbbell history,
          // never the (heavier) barbell numbers of the same lift.
          const prior = (s.exerciseHistory[ex.id] || []).filter(p => p.equip === equip.v);
          // a first-ever log has nothing to beat, so it's a PR by default — otherwise compare
          // against the best prior session the same way bestSetScore is used for the e1RM metric.
          if (deloading) {
            isPR = false;
          } else if (prior.length === 0) {
            isPR = true;
          } else {
            const bestThisSession = Math.max(...doneSets.map(r => bestSetScore(r.weight, r.reps, isTime, isBodyweight)));
            const bestPrior = Math.max(...prior.map(p => bestSetScore(p.weight, p.reps, isTime, isBodyweight)));
            isPR = bestThisSession > bestPrior;
          }
        }
        summary!.push({
          name: lib.name,
          resultText: doneSets ? fmtWeight(doneSets[0].weight, s.units) + ' × ' + doneSets.map(r => r.reps).join('/') : ex.sets + ' sets planned',
          badgeText: doneSets ? (isPR ? '🏆 PR' : 'Logged') : 'Skipped',
          badgeBg: doneSets ? (isPR ? 'oklch(0.78 0.15 90 / 0.22)' : 'oklch(0.7 0.15 145 / 0.2)') : 'rgba(255,255,255,.08)',
          badgeColor: doneSets ? (isPR ? 'oklch(0.85 0.16 90)' : 'oklch(0.75 0.15 145)') : 'rgba(245,240,234,.5)',
          isPR
        });
        return newEx;
      });
      const now = new Date();
      const dateStr = now.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
      const durationMin = Math.max(1, Math.round((Date.now() - (s.workout.startedAt || Date.now())) / 60000));
      // Pass the training type — without it restForExercise assumed factor-1.0 pacing, logging a
      // Strength user's average rest ~40% low on every session (it feeds the Progress rest trend).
      const avgRestSec = Math.round(s.workout.dayExercises.reduce((a, ex) => a + restForExercise(ex.id, s.restPacing, s.trainingType), 0) / Math.max(1, s.workout.dayExercises.length));
      const historyEntry = {
        id: newHistoryId(now.getTime()), day: dayLabel, program: s.programName, date: dateStr, volumeKg: Math.round(totalVolume),
        durationMin, avgRestSec, setCount: totalSets, repCount: totalReps, weekNumber: s.weekNumber, status: 'completed' as const, exercises: summary!
      };
      const exerciseHistory = { ...s.exerciseHistory };
      const loggedVariants = new Set<string>();
      s.workout.dayExercises.forEach((ex, idx) => {
        const doneSets = (s.workout!.exSets[idx] || []).filter(r => r.done);
        if (!doneSets.length) return;
        const eV = EXLIB[ex.id]?.equip[ex.equipIdx]?.v;
        loggedVariants.add(ex.id + '@' + eV);
        const entry = { date: dateStr, weight: doneSets[0].weight, reps: doneSets[0].reps, day: dayLabel, equip: eV, sets: doneSets.map(r => ({ weight: r.weight, reps: r.reps, rir: r.rir })), ...(deloading ? { deload: true } : {}) };
        // Cap history at the last 8 sessions PER equipment variant — dropping the oldest same-tool
        // entry — so logging on one tool never ages out the other tool's history.
        const list = [...(exerciseHistory[ex.id] || []), entry];
        let sameCount = list.filter(e => e.equip === eV).length;
        while (sameCount > 8) { const i = list.findIndex(e => e.equip === eV); if (i < 0) break; list.splice(i, 1); sameCount--; }
        exerciseHistory[ex.id] = list;
      });
      const hasChanges = s.workout.changesMade > 0;
      const program = JSON.parse(JSON.stringify(s.program));
      program[dayKey].lastCompletedAt = now.toISOString();
      program[dayKey].exercisesDoneMask = exercisesDoneMask;
      // A manualTarget on some *other* day's slot for the same exercise is now stale (this session's
      // real log is fresher than any manual guess, on whichever day it was set) — clear it wherever
      // it appears, not just on the day just played, so effectiveLast() doesn't resurrect a months-
      // old correction the next time that other day is opened.
      if (loggedVariants.size && !deloading) {
        s.dayOrder.forEach(k => {
          const exercises = program[k]?.exercises;
          if (!exercises) return;
          exercises.forEach((ex: ProgramExercise) => { if (loggedVariants.has(ex.id + '@' + (EXLIB[ex.id]?.equip[ex.equipIdx]?.v))) ex.manualTarget = null; });
        });
      }
      if (!hasChanges) program[dayKey].exercises = updatedDayExercises;

      let weekNumber = s.weekNumber, weekStartedAt = s.weekStartedAt;
      let deloadFields = null as ReturnType<typeof advanceDeloadForWeek> | null;
      if (isWeekComplete(program, s.dayOrder, weekStartedAt)) {
        weekNumber += 1; weekStartedAt = now.toISOString();
        deloadFields = advanceDeloadForWeek(s, weekNumber);
        s.dayOrder.forEach(k => {
          const d = program[k];
          if (d && (d.kind || 'training') !== 'rest') { d.skipped = false; d.lastCompletedAt = null; }
        });
      }

      if (hasChanges) {
        return {
          ...s, program, screen: 'complete' as Screen, completeSummary: summary, workout: null,
          history: [historyEntry, ...s.history], exerciseHistory, weekNumber, weekStartedAt,
          ...(deloadFields || {}),
          pendingPlanUpdate: { dayKey, updatedDayExercises, changedCount: s.workout.changesMade }
        };
      }
      return {
        ...s, program, screen: 'complete' as Screen, completeSummary: summary, workout: null,
        history: [historyEntry, ...s.history], exerciseHistory, weekNumber, weekStartedAt,
        ...(deloadFields || {}), pendingPlanUpdate: null
      };
    });
  }, []);

  const applyPlanUpdate = useCallback(() => {
    setState(s => {
      if (!s.pendingPlanUpdate) return s;
      const program = JSON.parse(JSON.stringify(s.program));
      program[s.pendingPlanUpdate.dayKey].exercises = s.pendingPlanUpdate.updatedDayExercises;
      return { ...s, program, pendingPlanUpdate: null };
    });
  }, []);
  const discardPlanUpdate = useCallback(() => setState(s => ({ ...s, pendingPlanUpdate: null })), []);

  const advance = useCallback(() => {
    if (!state.workout) return;
    const next = nextIncompleteIndex(state.workout.dayExercises, state.workout.exSets, state.workout.exIndex);
    if (next != null) {
      switchExercise(next);
    } else {
      completeWorkout();
    }
  }, [state.workout, switchExercise, completeWorkout]);

  const exitWorkout = useCallback(() => setState(s => ({ ...s, screen: 'program' as Screen })), []);
  const resumeWorkout = useCallback(() => setState(s => ({ ...s, screen: 'workout' as Screen })), []);

  // Entry point for a tap on the "Rest complete" notification (see src/sw.ts). Lands on the active
  // program day's workout showing the exercise the user still owes work on: normally that's the one
  // they were just resting inside, but if the rest they finished was after the *last* set of that
  // exercise, the useful thing to show is the next incomplete exercise instead. Reads from stateRef
  // so it works identically whether it was triggered by a postMessage into a running app or by the
  // boot-time hash check on a cold start.
  const openRestCompleteExercise = useCallback(() => {
    const cur = stateRef.current;
    if (!cur.workout) return;
    lastActivityRef.current = Date.now();
    const sets = cur.workout.exSets[cur.workout.exIndex];
    const allDone = !!sets && sets.length > 0 && sets.every(r => r.done);
    const next = allDone ? nextIncompleteIndex(cur.workout.dayExercises, cur.workout.exSets, cur.workout.exIndex) : null;
    setState(s => ({ ...s, screen: 'workout' as Screen, idleWorkoutPrompt: false }));
    if (next != null) switchExercise(next);
  }, [switchExercise]);

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.data && e.data.type === 'open-rest-exercise') openRestCompleteExercise();
    };
    // Cold start: the worker had no live client to message, so it passed the intent in the URL.
    // Strip the hash straight away so a later reload doesn't re-trigger the jump.
    const consumeHash = () => {
      if (window.location.hash !== '#rest-exercise') return;
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
      openRestCompleteExercise();
    };
    navigator.serviceWorker?.addEventListener('message', onMessage);
    // hashchange as well as the mount-time check: openWindow() normally yields a fresh document
    // (mount covers it), but if it ever resolves to an already-open context the hash would change
    // same-document and never remount this effect.
    window.addEventListener('hashchange', consumeHash);
    consumeHash();
    return () => {
      navigator.serviceWorker?.removeEventListener('message', onMessage);
      window.removeEventListener('hashchange', consumeHash);
    };
  }, [openRestCompleteExercise]);
  // Idle-prompt resolutions: Continue brings the current exercise back to front; End Workout runs
  // the normal end-of-session flow (logs whatever's done, same as ending early). Both clear the flag
  // and reset the activity clock so the prompt can't immediately re-fire.
  const continueWorkoutFromIdle = useCallback(() => {
    lastActivityRef.current = Date.now();
    setState(s => ({ ...s, idleWorkoutPrompt: false, screen: 'workout' as Screen }));
  }, []);
  const endWorkoutFromIdle = useCallback(() => {
    lastActivityRef.current = Date.now();
    setState(s => ({ ...s, idleWorkoutPrompt: false }));
    completeWorkout();
  }, [completeWorkout]);
  const requestEndEarly = useCallback(() => {
    if (state.confirmEndEarly) {
      setState(s => ({ ...s, confirmEndEarly: false }));
      completeWorkout();
    } else {
      setState(s => ({ ...s, confirmEndEarly: true }));
    }
  }, [state.confirmEndEarly, completeWorkout]);

  // ---------- hardware/gesture back button navigates in-app instead of exiting ----------
  // Installed PWAs have no browser chrome, so the only way "back" reaches the OS (minimizing the
  // app) is when there's no history entry left for it to consume — which is always, since this is
  // a single-URL SPA that never otherwise touches history. Fix: keep exactly one extra history
  // entry pushed whenever the user is away from the "resting" state (program screen, no modal
  // open); consume it by closing whatever's topmost instead of letting the browser/OS handle it.
  // Deliberately a *binary* one-entry model rather than one push per modal/screen level — simpler
  // and far less prone to desync than tracking exact depth, at the cost of occasionally consuming
  // a back-press that does nothing visible (e.g. if a modal was already closed via its own ✕
  // button, leaving one stale entry) rather than closing two things at once. That trade favors
  // robustness: the failure mode is "press back once more than expected," never "back exits the
  // app early."
  const isAnyModalOpen = useCallback((s: AppState) => !!(
    s.confirmRemoveExIndex != null ||
    s.showSettings || s.swap || s.muscleSwap || s.detail || s.quickEdit || s.muscleDrill || s.warmupDetailId ||
    s.libraryDetailId || s.exerciseForm || s.exerciseHistoryModalId || s.archiveDetailId ||
    s.newProgramWizard || s.weekReviewOpen || s.showBodyModal || s.editWeekOpen
  ), []);
  const closeTopmost = useCallback(() => {
    setState(s => {
      // topmost first — the remove-exercise confirm sits above every other surface
      if (s.confirmRemoveExIndex != null) return { ...s, confirmRemoveExIndex: null };
      // the delete-day confirm sits above the Edit Week sheet that raised it
      if (s.confirmRemoveDayKey) return { ...s, confirmRemoveDayKey: null };
      if (s.archiveDetailId) return { ...s, archiveDetailId: null };
      if (s.exerciseHistoryModalId) return { ...s, exerciseHistoryModalId: null };
      if (s.newProgramWizard) return { ...s, newProgramWizard: null };
      if (s.exerciseForm) return { ...s, exerciseForm: null };
      if (s.muscleSwap) return { ...s, muscleSwap: null };
      if (s.weekReviewOpen) return { ...s, weekReviewOpen: false };
      if (s.editWeekOpen) return { ...s, editWeekOpen: false };
      if (s.warmupDetailId) return { ...s, warmupDetailId: null };
      if (s.swap) return { ...s, swap: null };
      if (s.muscleDrill) return { ...s, muscleDrill: null };
      if (s.showBodyModal) return { ...s, showBodyModal: false };
      if (s.showSettings) return { ...s, showSettings: false };
      if (s.libraryDetailId) return { ...s, libraryDetailId: null };
      if (s.quickEdit) return { ...s, quickEdit: null };
      if (s.detail) return { ...s, detail: null };
      // nothing open — fall back to screen-level back.
      if (s.screen === 'dayBuilder') return { ...s, screen: 'dayView' as Screen };
      if (s.screen === 'dayView') return { ...s, screen: 'program' as Screen, activeDayKey: null };
      if (s.screen === 'workout') return { ...s, screen: 'program' as Screen };
      if (s.screen === 'complete' || s.screen === 'progress' || s.screen === 'exercises' || s.screen === 'achievements' || s.screen === 'coach') return { ...s, screen: 'program' as Screen };
      return s; // already at rest — let the next back press through to the OS
    });
  }, []);
  const hasPushedNavEntry = useRef(false);
  useEffect(() => {
    const atRest = state.screen === 'program' && !isAnyModalOpen(state);
    if (!atRest && !hasPushedNavEntry.current) {
      window.history.pushState({ appNav: true }, '');
      hasPushedNavEntry.current = true;
    } else if (atRest) {
      hasPushedNavEntry.current = false;
    }
  }, [state, isAnyModalOpen]);
  useEffect(() => {
    const onPopState = () => {
      hasPushedNavEntry.current = false;
      closeTopmost();
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [closeTopmost]);

  // One-line data-safety notice for App.tsx to surface. Persist failure outranks the corrupt
  // stash — it's ongoing, the stash already happened.
  const storageNotice = persistFailed
    ? 'Storage is full — your changes are NOT being saved. Export a backup from Settings, then free up space.'
    : corruptStateStashed
      ? 'Your saved data could not be read, so the app started fresh. A recovery copy was kept in this browser’s storage (key "alpha-lifts-corrupt-…").'
      : null;

  return {
    state, setState, storageNotice,
    actions: {
      goProgram, goProgress, goExercises, goAchievements, goCoach, markAchievementsSeen, openDay, openDayBuilder, closeDayBuilder,
      setCoachInput, sendCoachMessage, clearCoachChat, applyCoachProposal, dismissCoachProposal, refreshCoachEntitlement,
      openExerciseHistory, closeExerciseHistory, openArchiveDetail, closeArchiveDetail,
      selectExerciseProgress, toggleProgressPicker, toggleMuscleBalance, toggleCompareLift, toggleCompareLiftPicker, setProgressMetric,
      openWeekReview, closeWeekReview, selectReviewWeek, backToWeekList,
      setTrainingType, openSettings, closeSettings, setUnits, setRestPacing, setCoachVoice, setWarmupStyle,
      renameProgram, setUserName, toggleSkipDay, dismissDeloadSuggestion, applyAllCoachProposals,
      setDayKind, renameDay, addProgramDay, moveProgramDay, openEditWeek, closeEditWeek,
      requestRemoveProgramDay, cancelRemoveProgramDay, confirmRemoveProgramDay,
      setDeloadEnabled, setDeloadIntensity, setDeloadCadence, startDeloadNow, endDeloadNow,
      deferDeload, skipDeload,
      exportBackup, stageBackupImport, cancelBackupImport, confirmBackupImport,
      exportPlan, stagePlanImport, cancelPlanImport, confirmPlanImport, parsePlanText,
      requestResetApp, cancelResetApp, resetApp,
      setRestAlertSound, setRestAlertVibrate, setRestAlertNotify, setRemindersEnabled, setReminderTime,
      setBodyWeightInput, logBodyWeight,
      switchProgram, newProgram, requestRemoveProgram, renameSavedProgram,
      openNewProgramWizard, closeNewProgramWizard, setWizardField, setWizardPrefill, selectWizardSplit,
      addWizardCustomDay, removeWizardCustomDay, setWizardCustomDayField, createProgramFromWizard,
      completeOnboarding, finishOnboarding, dismissTutorial, openTutorial,
      setBodyView, openBodyModal, closeBodyModal, openDetail, closeDetail, openQuickEdit, closeQuickEdit,
      openMuscleDrill, closeMuscleDrill, openWarmupDetail, closeWarmupDetail,
      openLibraryDetail, closeLibraryDetail, setExerciseSearchQuery, openAddExerciseForm, openEditExerciseForm, closeExerciseForm,
      setExerciseFormField, toggleFormMuscle, toggleFormSecondary, toggleFormEquip, saveExerciseForm,
      requestDeleteExercise, deleteExercise,
      openSwap, closeSwap, swapTab, swapToggleAll, swapStageEquip, swapStageEx, swapConfirm, removeWorkoutExercise, moveWorkoutExercise, setSwapQuery,
      requestRemoveWorkoutExercise, cancelRemoveWorkoutExercise, confirmRemoveWorkoutExercise,
      openMuscleSwap, closeMuscleSwap, toggleMuscleSwapDay, muscleSwapToggleAll, muscleSwapStageEx, muscleSwapConfirm, muscleSwapSetQuery,
      removeExercise, requestRemoveBuilderExercise, changeSets, moveExercise, reorderExercise, setExerciseTarget, bumpExerciseTarget, toggleSuperset,
      startWorkout, switchExercise, setSetField, setSetRir, bumpSetField, toggleSetDone, addSet, removeSet,
      restAdjust, restSkip, advance, applyPlanUpdate, discardPlanUpdate,
      exitWorkout, resumeWorkout, requestEndEarly, completeWorkout, stopRest,
      continueWorkoutFromIdle, endWorkoutFromIdle
    }
  };
}

export type UseAppReturn = ReturnType<typeof useApp>;
export type Actions = UseAppReturn['actions'];
