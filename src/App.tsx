import { useEffect, useRef } from 'react';
import { useApp } from './state/useApp';
import { buildViewModel } from './state/viewModel';
import { OnboardingScreen } from './components/OnboardingScreen';
import { ProgramScreen } from './components/ProgramScreen';
import { DayViewScreen } from './components/DayViewScreen';
import { DayBuilderScreen } from './components/DayBuilderScreen';
import { WorkoutScreen } from './components/WorkoutScreen';
import { CompleteScreen } from './components/CompleteScreen';
import { ProgressScreen } from './components/ProgressScreen';
import { ExercisesScreen } from './components/ExercisesScreen';
import { TabBar } from './components/TabBar';
import { ResumePill } from './components/ResumePill';
import { ExerciseDetailModal } from './components/modals/ExerciseDetailModal';
import { SwapModal } from './components/modals/SwapModal';
import { SettingsModal } from './components/modals/SettingsModal';
import { MuscleDrillModal } from './components/modals/MuscleDrillModal';
import { LibraryExerciseDetailModal } from './components/modals/LibraryExerciseDetailModal';
import { ExerciseFormModal } from './components/modals/ExerciseFormModal';
import { ExerciseHistoryModal } from './components/modals/ExerciseHistoryModal';
import { ArchiveDetailModal } from './components/modals/ArchiveDetailModal';
import { NewProgramWizardModal } from './components/modals/NewProgramWizardModal';
import { WeekReviewModal } from './components/modals/WeekReviewModal';

export default function App() {
  const { state, actions } = useApp();
  const vm = buildViewModel(state, actions);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo(0, 0);
  }, [state.screen]);

  if (vm.needsOnboarding) {
    return (
      <div className="app-shell">
        <div className="scr" style={{ background: '#0f0e0d' }}>
          <OnboardingScreen vm={vm} />
        </div>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <div className="scr" ref={scrollRef} style={{ background: '#0f0e0d' }}>
        {vm.isProgram && <ProgramScreen vm={vm} />}
        {vm.isDayView && <DayViewScreen vm={vm} />}
        {vm.isDayBuilder && <DayBuilderScreen vm={vm} />}
        {vm.isWorkout && <WorkoutScreen vm={vm} />}
        {vm.isComplete && <CompleteScreen vm={vm} />}
        {vm.isProgress && <ProgressScreen vm={vm} />}
        {vm.isExercises && <ExercisesScreen vm={vm} />}

        <ResumePill vm={vm} />
        <TabBar vm={vm} />

        <ExerciseDetailModal vm={vm} />
        <SwapModal vm={vm} />
        <SettingsModal vm={vm} />
        <MuscleDrillModal vm={vm} />
        <LibraryExerciseDetailModal vm={vm} />
        <ExerciseFormModal vm={vm} />
        <ExerciseHistoryModal vm={vm} />
        <ArchiveDetailModal vm={vm} />
        <NewProgramWizardModal vm={vm} />
        <WeekReviewModal vm={vm} />
      </div>
    </div>
  );
}
