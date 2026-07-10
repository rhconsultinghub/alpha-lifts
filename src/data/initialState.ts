import type { AppState } from './types';
import { defaultProgram, dumbbellProgram, DAY_ORDER } from './program';

export function createInitialState(): AppState {
  return {
    screen: 'program',
    trainingType: 'progressive_overload',
    dayOrder: [...DAY_ORDER],
    startedAt: new Date(Date.now() - 20 * 86400000).toISOString(),
    units: 'lb',
    restPacing: 'Standard',
    coachVoice: 'Encouraging',
    warmupStyle: 'Standard',
    showSettings: false,
    confirmDeleteProgId: null,
    confirmEndEarly: false,
    pendingPlanUpdate: null,
    activeProgramId: 'ppl',
    programName: 'Push Pull Legs Split',
    program: defaultProgram(),
    savedPrograms: {
      dumbbell: {
        name: 'Home Dumbbell Split',
        trainingType: 'progressive_overload',
        dayOrder: [...DAY_ORDER],
        startedAt: new Date(Date.now() - 40 * 86400000).toISOString(),
        days: dumbbellProgram()
      }
    },
    activeDayKey: null,
    bodyView: 'front',
    showBodyModal: false,
    muscleDrill: null,
    detail: null,
    swap: null,
    workout: null,
    completeSummary: null,
    exerciseHistoryModalId: null,
    archiveDetailId: null,
    customExercises: {},
    libraryDetailId: null,
    confirmDeleteExId: null,
    exerciseForm: null,
    newProgramWizard: null,
    selectedProgressEx: 'deadlift',
    progressPickerOpen: false,
    compareLiftIds: [],
    compareLiftPickerOpen: false,
    compareLiftLimitHit: false,
    weekReviewOpen: false,
    weekReviewSelected: null,
    exerciseHistory: {
      deadlift: [{ date: 'Jun 15', weight: 87.5, reps: 8, day: 'Pull Day' }, { date: 'Jun 22', weight: 92.5, reps: 8, day: 'Pull Day' }, { date: 'Jun 29', weight: 95, reps: 8, day: 'Pull Day' }, { date: 'Jul 6', weight: 97.5, reps: 8, day: 'Pull Day' }],
      bench_press: [{ date: 'Jun 15', weight: 72.5, reps: 8, day: 'Push Day' }, { date: 'Jun 22', weight: 75, reps: 8, day: 'Push Day' }, { date: 'Jun 29', weight: 77.5, reps: 8, day: 'Push Day' }, { date: 'Jul 6', weight: 80, reps: 8, day: 'Push Day' }],
      back_squat: [{ date: 'Jun 17', weight: 80, reps: 8, day: 'Leg Day' }, { date: 'Jun 24', weight: 85, reps: 8, day: 'Leg Day' }, { date: 'Jul 1', weight: 87.5, reps: 8, day: 'Leg Day' }, { date: 'Jul 8', weight: 90, reps: 8, day: 'Leg Day' }],
      overhead_press: [{ date: 'Jun 15', weight: 36, reps: 10, day: 'Push Day' }, { date: 'Jun 22', weight: 37.5, reps: 10, day: 'Push Day' }, { date: 'Jun 29', weight: 40, reps: 10, day: 'Push Day' }, { date: 'Jul 6', weight: 40, reps: 10, day: 'Push Day' }],
      seated_row: [{ date: 'Jun 16', weight: 42.5, reps: 11, day: 'Pull Day' }, { date: 'Jun 23', weight: 45, reps: 11, day: 'Pull Day' }, { date: 'Jun 30', weight: 45, reps: 11, day: 'Pull Day' }, { date: 'Jul 7', weight: 47.5, reps: 11, day: 'Pull Day' }]
    },
    history: [
      { id: 'h1', day: 'Push Day', program: 'Push Pull Legs Split', date: 'Mon, Jul 6', volumeKg: 8240, durationMin: 52, avgRestSec: 95, weekNumber: 3, status: 'completed', exercises: [] },
      { id: 'h2', day: 'Pull Day', program: 'Push Pull Legs Split', date: 'Tue, Jul 7', volumeKg: 6910, durationMin: 58, avgRestSec: 102, weekNumber: 3, status: 'completed', exercises: [] },
      { id: 'h3', day: 'Leg Day', program: 'Push Pull Legs Split', date: 'Wed, Jul 8', volumeKg: 3180, durationMin: 38, avgRestSec: 88, weekNumber: 3, status: 'completed', exercises: [] },
      { id: 'h4', day: 'Push Day', program: 'Push Pull Legs Split', date: 'Thu, Jul 2', volumeKg: 8010, durationMin: 55, avgRestSec: 98, weekNumber: 2, status: 'completed', exercises: [] },
      { id: 'h5', day: 'Pull Day', program: 'Push Pull Legs Split', date: 'Wed, Jul 1', volumeKg: 6720, durationMin: 61, avgRestSec: 107, weekNumber: 2, status: 'completed', exercises: [] },
      { id: 'h6', day: 'Leg Day', program: 'Push Pull Legs Split', date: 'Tue, Jun 30', volumeKg: 0, durationMin: 0, avgRestSec: 0, weekNumber: 2, status: 'skipped', exercises: [] },
      { id: 'h7', day: 'Push Day', program: 'Push Pull Legs Split', date: 'Fri, Jun 26', volumeKg: 7850, durationMin: 49, avgRestSec: 93, weekNumber: 1, status: 'completed', exercises: [] },
      { id: 'h8', day: 'Pull Day', program: 'Push Pull Legs Split', date: 'Thu, Jun 25', volumeKg: 6580, durationMin: 63, avgRestSec: 110, weekNumber: 1, status: 'completed', exercises: [] }
    ]
  };
}
