// 'Forearms' was added as the 12th muscle in phase 32 (previously free-exercise-db's forearm
// exercises were collapsed into 'Biceps' for lack of anywhere better to put them).
export type Muscle =
  | 'Back' | 'Biceps' | 'Rear Delts' | 'Chest' | 'Triceps' | 'Forearms' | 'Shoulders'
  | 'Quads' | 'Hamstrings' | 'Glutes' | 'Calves' | 'Core';

export type TrainingType = 'progressive_overload' | 'strength' | 'hit' | 'endurance' | 'general';

export interface EquipOption {
  v: string;
  label: string;
}

export interface ExerciseDef {
  name: string;
  muscle: Muscle;
  compound: boolean;
  restBase: number;
  pattern: string;
  equip: EquipOption[];
  repLo: number;
  repHi: number;
  cue: string;
  secondary: Muscle[];
  // 'time' exercises (e.g. planks) are tracked by seconds held instead of rep count — the
  // repLo/repHi/reps fields are reused to mean seconds when this is set.
  trackingMode?: 'reps' | 'time';
  // YouTube video id (the part after v=) for an embedded tutorial — verified real videos found
  // per-exercise, not present for every exercise (custom user-created ones never have one).
  videoId?: string;
}

export interface ExerciseLast {
  weight: number;
  reps: number;
  hitTop: boolean;
  // reps-in-reserve on the top set, if logged — undefined for sessions logged before RIR existed
  // or where the lifter skipped it (it's an optional per-set input, not required).
  rir?: number;
}

export interface SetHistoryRow {
  weight: number;
  reps: number;
  rir?: number;
}

export interface ProgramExercise {
  id: string;
  sets: number;
  equipIdx: number;
  last: ExerciseLast;
  baseline: { weight: number; reps: number };
  lastSets?: SetHistoryRow[];
  // two exercises sharing the same group id are performed as an adjacent-pair superset (see
  // toggleSuperset in useApp.ts) — undefined/null means not linked.
  supersetGroup?: string | null;
  // manual weight/reps correction from the Day View quick-edit modal, taking precedence over both
  // this slot's own `last` and (unusually) even the cross-day exerciseHistory that effectiveLast()
  // otherwise prefers — an explicit user edit is a stronger signal than "whatever was logged last."
  // Cleared automatically the next time this exercise is actually logged (see completeWorkout in
  // useApp.ts), so it's a one-time correction, not a permanent pin. undefined/null = no override.
  manualTarget?: { weight: number; reps: number } | null;
}

export interface ProgramDay {
  key: string;
  label: string;
  dow: string;
  kind?: 'training' | 'rest';
  skipped: boolean;
  theme?: Muscle[];
  exercises: ProgramExercise[];
  lastCompletedAt?: string | null;
  // per-exercise completion mask from the most recent session for this day — an exercise not
  // reached/finished (e.g. the workout was ended early) contributes 0 toward weekly volume
  // until the day is played again. Absent entirely = day never attempted, use full planned volume.
  exercisesDoneMask?: boolean[] | null;
}

export type ProgramDays = Record<string, ProgramDay>;

export interface SavedProgram {
  name: string;
  trainingType: TrainingType;
  dayOrder: string[];
  startedAt: string;
  days: ProgramDays;
  weekNumber?: number;
  weekStartedAt?: string;
}

export interface WorkoutSetRow {
  weight: number;
  reps: number;
  done: boolean;
  rir?: number;
}

export interface WorkoutState {
  dayKey: string;
  exIndex: number;
  exSets: Record<number, WorkoutSetRow[]>;
  dayExercises: ProgramExercise[];
  changesMade: number;
  resting: boolean;
  restRemaining: number;
  restTotal: number;
  // absolute epoch-ms the rest period ends — restRemaining is derived from this rather than
  // decremented tick-by-tick, so a throttled/delayed interval (backgrounded tab, minimized PWA)
  // still resolves to the correct remaining time the moment it's next able to run, instead of
  // drifting based on how many 1s ticks it actually got to fire.
  restEndAt: number | null;
  startedAt: number;
}

export interface ExerciseHistoryEntry {
  date: string;
  weight: number;
  reps: number;
  day: string;
  sets?: SetHistoryRow[];
  // Logged during a scheduled deload week. Light by design, so every read that
  // asks "how strong are you / are you still progressing" skips these entries —
  // otherwise a deload would register as a plateau or a regression, and the next
  // week's overload prompt would try to build up from 60% of the real working
  // weight. See state/deload.ts and effectiveLast()/deloadSuggestion() in logic.ts.
  deload?: boolean;
}

export interface HistoryEntry {
  id: string;
  day: string;
  program: string;
  date: string;
  volumeKg: number;
  durationMin: number;
  avgRestSec: number;
  weekNumber: number;
  status: 'completed' | 'skipped';
  exercises: CompleteSummaryRow[];
}

export interface CompleteSummaryRow {
  name: string;
  resultText: string;
  badgeText: string;
  badgeBg: string;
  badgeColor: string;
  isPR?: boolean;
}

export interface SwapState {
  dayKey: string;
  exIndex: number;
  tab: 'equip' | 'replace';
  stagedEquipIdx: number | null;
  stagedExId: string | null;
  showAll: boolean;
  isAdd: boolean;
  query: string;
}

// quick "switch exercise" from the muscle drill-down: unlike SwapState (single day/exercise
// slot), the same exercise id can appear on more than one program day, so the user picks which
// of those day(s) the replacement should apply to before choosing a new exercise.
export interface MuscleSwapState {
  exId: string;
  dayKeys: string[];
  selectedDayKeys: string[];
  stagedExId: string | null;
  showAll: boolean;
  query: string;
}

export interface PendingPlanUpdate {
  dayKey: string;
  updatedDayExercises: ProgramExercise[];
  changedCount: number;
}

export interface ExerciseFormState {
  editingId: string | null;
  name: string;
  muscle: Muscle;
  secondary: Muscle[];
  equip: string[];
  restBase: number;
  repLo: number | string;
  repHi: number | string;
  compound: boolean;
  pattern: string;
  cue: string;
  error: string;
  trackingMode: 'reps' | 'time';
}

export interface WizardCustomDay {
  label: string;
  kind: 'training' | 'rest';
}

export interface NewProgramWizardState {
  name: string;
  trainingType: TrainingType;
  splitId: string;
  customDays: WizardCustomDay[];
  prefill: 'recommended' | 'scratch';
}

export type Units = 'kg' | 'lb';
export type BodyView = 'front' | 'back';
export type Screen = 'program' | 'dayView' | 'dayBuilder' | 'workout' | 'complete' | 'progress' | 'exercises' | 'achievements' | 'coach';

export interface CoachChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  /** Set on an assistant turn that failed, so it renders as an error bubble rather than advice. */
  isError?: boolean;
}
export type RestPacing = 'Relaxed' | 'Standard' | 'Aggressive';
export type CoachVoice = 'Direct' | 'Encouraging' | 'Hype';
export type WarmupStyle = 'Minimal' | 'Standard' | 'Cautious';

export interface AppState {
  onboarded: boolean;
  screen: Screen;
  trainingType: TrainingType;
  dayOrder: string[];
  startedAt: string;
  // "week" here tracks actual completion, not calendar time: weekStartedAt marks when the
  // current week began, and once every training day is completed or skipped on or after that
  // moment, the app rolls straight into the next week rather than waiting out the remaining
  // calendar days — see isWeekComplete() in state/logic.ts.
  weekNumber: number;
  weekStartedAt: string;
  units: Units;
  restPacing: RestPacing;
  coachVoice: CoachVoice;
  warmupStyle: WarmupStyle;
  showSettings: boolean;
  confirmDeleteProgId: string | null;
  confirmEndEarly: boolean;
  // Set true when a workout has been in progress with no in-app interaction for the idle timeout
  // (see IDLE_WORKOUT_MS in useApp) — drives the "still working out?" prompt. Reset to false as
  // soon as the user interacts or resolves the prompt.
  idleWorkoutPrompt: boolean;
  // Index (into workout.dayExercises) of an exercise the user has asked to remove mid-workout, held
  // pending an explicit confirm — removing one discards its logged sets, so it shouldn't be a
  // single mis-tap away.
  confirmRemoveExIndex: number | null;
  pendingPlanUpdate: PendingPlanUpdate | null;
  activeProgramId: string;
  programName: string;
  program: ProgramDays;
  savedPrograms: Record<string, SavedProgram>;
  activeDayKey: string | null;
  bodyView: BodyView;
  showBodyModal: boolean;
  muscleDrill: Muscle | null;
  warmupDetailId: string | null;
  detail: { dayKey: string; exIndex: number } | null;
  // Day View's tap-to-edit quick modal (weight/reps/sets/equip) — separate from `detail` (the
  // read-only photo/how-to/video info screen), which stays reachable via the exercise photo tap.
  quickEdit: { dayKey: string; exIndex: number } | null;
  swap: SwapState | null;
  muscleSwap: MuscleSwapState | null;
  workout: WorkoutState | null;
  completeSummary: CompleteSummaryRow[] | null;
  exerciseHistoryModalId: string | null;
  archiveDetailId: string | null;
  selectedProgressEx?: string;
  progressPickerOpen?: boolean;
  compareLiftIds?: string[];
  compareLiftPickerOpen?: boolean;
  compareLiftLimitHit?: boolean;
  weekReviewOpen?: boolean;
  weekReviewSelected?: number | null;
  exerciseHistory: Record<string, ExerciseHistoryEntry[]>;
  history: HistoryEntry[];
  customExercises: Record<string, ExerciseDef>;
  libraryDetailId: string | null;
  exerciseSearchQuery: string;
  confirmDeleteExId: string | null;
  exerciseForm: ExerciseFormState | null;
  newProgramWizard: NewProgramWizardState | null;

  // ---------- rest-timer alerts ----------
  restAlertSound: boolean;
  restAlertVibrate: boolean;
  // separate from Sound/Vibrate: a Notification can display even while the app is backgrounded (as
  // long as its JS is still running to trigger it), unlike vibrate (browser-restricted to visible
  // documents) or WebAudio (suspended in background tabs on most browsers) — see state/alerts.ts.
  restAlertNotify: boolean;

  // ---------- Progress tab: weight vs. estimated-1RM chart metric ----------
  progressMetric: 'weight' | 'e1rm';

  // ---------- body-weight tracking ----------
  bodyWeightLog: { date: string; weightKg: number }[];
  bodyWeightInput: string;

  // ---------- deload suggestion (dismissal is per-week, like other week-scoped state) ----------
  deloadDismissedWeek: number | null;

  // ---------- auto deload weeks (opt-in, trigger-based) — see state/deload.ts ----------
  // Off by default: this changes the weights the app tells you to lift, so it's
  // something the user turns on deliberately, not a behaviour they discover.
  deloadEnabled: boolean;
  // Working-weight percentage during a deload week (50-80, default 60).
  deloadIntensityPct: number;
  // Backstop ceiling: the most trained weeks to go with no deload when the fatigue
  // triggers never fire. null = derive it from trainingType (DELOAD_BACKSTOP_WEEKS);
  // a number pins it. Named for the cadence it used to be, since it's persisted —
  // renaming the field would silently reset every existing user's choice.
  deloadCadenceWeeks: number | null;
  // The week currently designated a deload. Nothing is applied unless this equals
  // weekNumber, so a stale value from an abandoned program can't silently deload.
  deloadActiveWeek: number | null;
  // Week the last deload *resolved* — whether it ran or the user skipped it. Both
  // the backstop countdown and the minimum-weeks-before-triggering floor measure
  // from here, so skipping genuinely buys quiet rather than deferring by a week.
  deloadAnchorWeek: number;
  // Set when the user pushes a due deload back or skips one; both the triggers and
  // the backstop stay suppressed until this week arrives.
  deloadDeferUntilWeek: number | null;
  // Deloads actually run, for the Settings status line. 'scheduled'/'early' are
  // legacy values from when this ran on a cadence — kept in the union so persisted
  // history from an older version still typechecks.
  deloadHistory: { week: number; reason: 'fatigue' | 'backstop' | 'manual' | 'scheduled' | 'early' }[];

  // ---------- reminder notifications (local-only, best-effort — see state/reminders.ts) ----------
  remindersEnabled: boolean;
  reminderTime: string;
  lastReminderFiredDate: string | null;

  // ---------- backup export/import ----------
  pendingBackupImport: Partial<AppState> | null;

  // ---------- reset ----------
  confirmResetApp: boolean;

  // ---------- achievements ----------
  // ids the user has already seen unlocked (as of their last visit to the Achievements tab) — an
  // unlocked id not in this set renders a "NEW" badge. Achievement unlocked/points state itself is
  // never stored here; it's always derived fresh from history/exerciseHistory/etc. (see
  // data/achievements.ts), which is what makes retroactive unlocking work for free.
  seenAchievementIds: string[];

  // ---- AI coach (see state/coach.ts + the worker/ directory) ----
  // Persisted like everything else, so a conversation survives closing the app. Trimmed to
  // COACH_HISTORY_CAP on every send — an unbounded chat log would grow the single localStorage
  // blob the whole app shares.
  coachMessages: CoachChatMessage[];
  coachInput: string;
  /** True while a request is in flight; blocks a second send and drives the typing indicator. */
  coachPending: boolean;
}
