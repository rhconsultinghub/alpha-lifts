export type Muscle =
  | 'Back' | 'Biceps' | 'Rear Delts' | 'Chest' | 'Triceps' | 'Shoulders'
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
}

export interface ExerciseLast {
  weight: number;
  reps: number;
  hitTop: boolean;
}

export interface SetHistoryRow {
  weight: number;
  reps: number;
}

export interface ProgramExercise {
  id: string;
  sets: number;
  equipIdx: number;
  last: ExerciseLast;
  baseline: { weight: number; reps: number };
  lastSets?: SetHistoryRow[];
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
}

export interface WorkoutSetRow {
  weight: number;
  reps: number;
  done: boolean;
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
  startedAt: number;
}

export interface ExerciseHistoryEntry {
  date: string;
  weight: number;
  reps: number;
  day: string;
  sets?: SetHistoryRow[];
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
}

export interface SwapState {
  dayKey: string;
  exIndex: number;
  tab: 'equip' | 'replace';
  stagedEquipIdx: number | null;
  stagedExId: string | null;
  showAll: boolean;
  isAdd: boolean;
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
export type Screen = 'program' | 'dayView' | 'dayBuilder' | 'workout' | 'complete' | 'progress' | 'exercises';
export type RestPacing = 'Relaxed' | 'Standard' | 'Aggressive';
export type CoachVoice = 'Direct' | 'Encouraging' | 'Hype';
export type WarmupStyle = 'Minimal' | 'Standard' | 'Cautious';

export interface AppState {
  screen: Screen;
  trainingType: TrainingType;
  dayOrder: string[];
  startedAt: string;
  units: Units;
  restPacing: RestPacing;
  coachVoice: CoachVoice;
  warmupStyle: WarmupStyle;
  showSettings: boolean;
  confirmDeleteProgId: string | null;
  confirmEndEarly: boolean;
  pendingPlanUpdate: PendingPlanUpdate | null;
  activeProgramId: string;
  programName: string;
  program: ProgramDays;
  savedPrograms: Record<string, SavedProgram>;
  activeDayKey: string | null;
  bodyView: BodyView;
  showBodyModal: boolean;
  muscleDrill: Muscle | null;
  detail: { dayKey: string; exIndex: number } | null;
  swap: SwapState | null;
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
  confirmDeleteExId: string | null;
  exerciseForm: ExerciseFormState | null;
  newProgramWizard: NewProgramWizardState | null;
}
