import type { AppState } from './types';

export function createInitialState(): AppState {
  return {
    onboarded: false,
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
    swap: null,
    muscleSwap: null,
    workout: null,
    completeSummary: null,
    exerciseHistoryModalId: null,
    archiveDetailId: null,
    customExercises: {},
    libraryDetailId: null,
    exerciseSearchQuery: '',
    confirmDeleteExId: null,
    exerciseForm: null,
    // pre-populated so the onboarding screen has a wizard to render immediately on first launch —
    // ignored once `onboarded` is true, since persisted state overrides this on subsequent loads.
    newProgramWizard: { name: '', trainingType: 'progressive_overload', splitId: 'ppl6', customDays: [], prefill: 'recommended' },
    selectedProgressEx: undefined,
    progressPickerOpen: false,
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

    deloadDismissedWeek: null,

    remindersEnabled: false,
    reminderTime: '18:00',
    lastReminderFiredDate: null,

    pendingBackupImport: null,

    confirmResetApp: false
  };
}
