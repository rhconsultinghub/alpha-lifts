import { useEffect, useMemo, useRef } from 'react';
import { useApp } from './state/useApp';
import { useCloudSync } from './state/useCloudSync';
import { buildViewModel } from './state/viewModel';
import { OnboardingScreen } from './components/OnboardingScreen';
import { ProgramScreen } from './components/ProgramScreen';
import { DayViewScreen } from './components/DayViewScreen';
import { DayBuilderScreen } from './components/DayBuilderScreen';
import { WorkoutScreen } from './components/WorkoutScreen';
import { CompleteScreen } from './components/CompleteScreen';
import { ProgressScreen } from './components/ProgressScreen';
import { ExercisesScreen } from './components/ExercisesScreen';
import { AchievementsScreen } from './components/AchievementsScreen';
import { CoachScreen } from './components/CoachScreen';
import { TabBar } from './components/TabBar';
import { AppTutorial } from './components/AppTutorial';
import { ResumePill } from './components/ResumePill';
import { RestToast } from './components/RestToast';
import { IdleWorkoutToast } from './components/IdleWorkoutToast';
import { ConfirmRemoveExerciseModal } from './components/modals/ConfirmRemoveExerciseModal';
import { ExerciseDetailModal } from './components/modals/ExerciseDetailModal';
import { ExerciseQuickEditModal } from './components/modals/ExerciseQuickEditModal';
import { SwapModal } from './components/modals/SwapModal';
import { SettingsModal } from './components/modals/SettingsModal';
import { MuscleDrillModal } from './components/modals/MuscleDrillModal';
import { MuscleSwapModal } from './components/modals/MuscleSwapModal';
import { WarmupDetailModal } from './components/modals/WarmupDetailModal';
import { LibraryExerciseDetailModal } from './components/modals/LibraryExerciseDetailModal';
import { ExerciseFormModal } from './components/modals/ExerciseFormModal';
import { ExerciseHistoryModal } from './components/modals/ExerciseHistoryModal';
import { ArchiveDetailModal } from './components/modals/ArchiveDetailModal';
import { NewProgramWizardModal } from './components/modals/NewProgramWizardModal';
import { WeekReviewModal } from './components/modals/WeekReviewModal';
import { EditWeekModal } from './components/modals/EditWeekModal';

// Fixed data-safety banner (storage full / corrupt state recovered). Deliberately rendered from
// App directly rather than through the view model: it reports infrastructure state (localStorage
// health), not app state, and it must be visible on every screen including onboarding.
function StorageNoticeBanner({ text }: { text: string }) {
  return (
    <div style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 70, background: '#7a2e2e', color: '#f5f0ea', font: "500 12px 'Inter'", lineHeight: 1.45, padding: '10px 14px', textAlign: 'center' }}>
      ⚠️ {text}
    </div>
  );
}

export default function App() {
  const { state, actions, storageNotice } = useApp();
  // Mirror local state to the server (debounced) while signed in; no-op otherwise.
  useCloudSync(state);
  // Rebuild the (large) view model only when state actually changes. `actions` is deliberately
  // not a dependency: it's a fresh object literal each render, but every callback inside it is a
  // useCallback whose deps are state slices — so any render where a callback's identity changed
  // is a render where `state` changed too, and the memo re-runs with that render's fresh actions.
  // Renders where state is unchanged (auth context updates, parent re-renders) safely reuse the
  // previous VM.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const vm = useMemo(() => buildViewModel(state, actions), [state]);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo(0, 0);
  }, [state.screen]);

  if (vm.needsOnboarding) {
    return (
      <div className="app-shell">
        {storageNotice && <StorageNoticeBanner text={storageNotice} />}
        <div className="scr" style={{ background: '#0f0e0d' }}>
          <OnboardingScreen vm={vm} />
        </div>
      </div>
    );
  }

  return (
    <div className="app-shell">
      {storageNotice && <StorageNoticeBanner text={storageNotice} />}
      <div className="scr" ref={scrollRef} style={{ background: '#0f0e0d' }}>
        {vm.isProgram && <ProgramScreen vm={vm} />}
        {vm.isDayView && <DayViewScreen vm={vm} />}
        {vm.isDayBuilder && <DayBuilderScreen vm={vm} />}
        {vm.isWorkout && <WorkoutScreen vm={vm} />}
        {vm.isComplete && <CompleteScreen vm={vm} />}
        {vm.isProgress && <ProgressScreen vm={vm} />}
        {vm.isExercises && <ExercisesScreen vm={vm} />}
        {vm.isAchievements && <AchievementsScreen vm={vm} />}
        {vm.isCoach && <CoachScreen vm={vm} />}

        <ExerciseDetailModal vm={vm} />
        <ExerciseQuickEditModal vm={vm} />
        <SwapModal vm={vm} />
        <SettingsModal vm={vm} />
        <MuscleDrillModal vm={vm} />
        <MuscleSwapModal vm={vm} />
        <WarmupDetailModal vm={vm} />
        <LibraryExerciseDetailModal vm={vm} />
        <ExerciseFormModal vm={vm} />
        <ExerciseHistoryModal vm={vm} />
        <ArchiveDetailModal vm={vm} />
        <NewProgramWizardModal vm={vm} />
        <WeekReviewModal vm={vm} />
        <EditWeekModal vm={vm} />
        <RestToast vm={vm} />
        <ConfirmRemoveExerciseModal vm={vm} />
        <IdleWorkoutToast vm={vm} />
        <AppTutorial vm={vm} />
      </div>

      {/* Bottom-anchored chrome lives OUTSIDE .scr on purpose. Both are position:absolute against
          .app-shell, so while they were rendered inside the scroller the browser had to hold them
          still against a moving contents layer every frame — which, combined with the tab bar's
          backdrop-filter, is what made the bar shimmer and lag while scrolling. Moving them out
          changes no coordinates (their containing block was already .app-shell) and preserves the
          z-index ladder: .scr is position:static so it creates no stacking context, and every modal
          inside it still resolves against .app-shell at z 20-60, above these. */}
      <ResumePill vm={vm} />
      <TabBar vm={vm} />
    </div>
  );
}
