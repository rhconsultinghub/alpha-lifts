import type { AppState } from './types';

/** Highest one-time migration a blob can have been through — see MIGRATIONS in state/useApp.ts.
 *  Lives here (not useApp) so createInitialState can stamp it without an import cycle. */
export const SCHEMA_VERSION = 2;

export function createInitialState(): AppState {
  return {
    schemaVersion: SCHEMA_VERSION,
    onboarded: false,
    userName: '',
    screen: 'program',
    trainingType: 'progressive_overload',
    dayOrder: [],
    startedAt: new Date().toISOString(),
    weekNumber: 1,
    weekStartedAt: new Date().toISOString(),
    units: 'lb',
    restPacing: 'Standard',
    coachVoice: 'Encouraging',
    warmupStyle: 'Standard',
    showSettings: false,
    confirmDeleteProgId: null,
    confirmEndEarly: false,
    idleWorkoutPrompt: false,
    confirmRemoveExIndex: null,
    editWeekOpen: false,
    confirmRemoveDayKey: null,
    pendingPlanUpdate: null,
    activeProgramId: '',
    programName: '',
    program: {},
    savedPrograms: {},
    activeDayKey: null,
    bodyView: 'front',
    showBodyModal: false,
    muscleDrill: null,
    warmupDetailId: null,
    detail: null,
    quickEdit: null,
    swap: null,
    muscleSwap: null,
    workout: null,
    completeSummary: null,
    exerciseHistoryModalId: null,
    archiveDetailId: null,
    customExercises: {},
    libraryDetailId: null,
    exerciseSearchQuery: '',
    exerciseEquipFilter: null,
    confirmDeleteExId: null,
    confirmRemoveBuilderIdx: null,
    exerciseForm: null,
    // pre-populated so the onboarding screen has a wizard to render immediately on first launch —
    // ignored once `onboarded` is true, since persisted state overrides this on subsequent loads.
    newProgramWizard: { name: '', trainingType: 'progressive_overload', splitId: 'ppl6', customDays: [], prefill: 'recommended' },
    selectedProgressEx: undefined,
    progressPickerOpen: false,
    muscleBalanceCollapsed: true,
    compareLiftIds: [],
    compareLiftPickerOpen: false,
    compareLiftLimitHit: false,
    weekReviewOpen: false,
    weekReviewSelected: null,
    exerciseHistory: {},
    history: [],

    restAlertSound: true,
    restAlertVibrate: true,
    restAlertNotify: false,

    progressMetric: 'weight',

    bodyWeightLog: [],
    bodyWeightInput: '',

    measurementLog: [],
    measurementInput: '',
    selectedMeasurementType: 'waist',

    deloadDismissedWeek: null,

    deloadEnabled: false,
    deloadIntensityPct: 60,
    deloadCadenceWeeks: null,
    deloadActiveWeek: null,
    deloadAnchorWeek: 0,
    deloadDeferUntilWeek: null,
    deloadHistory: [],

    remindersEnabled: false,
    reminderTime: '18:00',
    lastReminderFiredDate: null,
    pushRemindersEnabled: false,
    pushSetupNotice: null,

    pendingBackupImport: null,
    pendingPlanImport: null,

    confirmResetApp: false,

    seenAchievementIds: [],

    coachMessages: [],
    coachInput: '',
    // never persisted as true in practice: a send always resolves or errors before the state
    // is written, and loadInitial()'s merge would otherwise strand a reloaded app "thinking"
    coachPending: false,
    // re-probed each time the Coach tab opens (see refreshCoachEntitlement in useApp)
    coachEntitlement: 'unknown'
  };
}
