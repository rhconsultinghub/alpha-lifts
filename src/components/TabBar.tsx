import type { ViewModel } from '../state/viewModel';

export function TabBar({ vm }: { vm: ViewModel }) {
  if (!vm.showTabs) return null;
  return (
    // No backdrop-filter: at 97% opacity the blur was invisible anyway, and re-rasterizing a blur
    // against scrolling content every frame was the single most expensive thing in the scroll path.
    // Bottom padding consumes the safe-area inset so the labels clear the Android gesture pill.
    <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, display: 'flex', background: 'rgba(15,14,13,.97)', borderTop: '1px solid rgba(255,255,255,.08)', padding: '10px 8px calc(16px + var(--safe-b))' }}>
      <button onClick={vm.goProgram} style={{ flex: 1, background: 'none', border: 'none', color: vm.tabProgramColor, font: "600 10px 'Inter'", display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: 0, whiteSpace: 'nowrap' }}>
        <div style={{ fontSize: 18 }}>🏋</div>Program
      </button>
      <button onClick={vm.goProgress} style={{ flex: 1, background: 'none', border: 'none', color: vm.tabProgressColor, font: "600 10px 'Inter'", display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: 0, whiteSpace: 'nowrap' }}>
        <div style={{ fontSize: 18 }}>📈</div>Progress
      </button>
      <button onClick={vm.goExercises} style={{ flex: 1, background: 'none', border: 'none', color: vm.tabExercisesColor, font: "600 10px 'Inter'", display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: 0, whiteSpace: 'nowrap' }}>
        <div style={{ fontSize: 18 }}>📋</div>Exercises
      </button>
      {/* Deliberately no unread/new dot on this tab: achievements are a reward to discover, not an
          inbox to clear, and a permanent nagging badge reads as a chore. The per-badge "NEW" chip
          inside the Achievements screen still marks freshly-cleared tiers once you're in there. */}
      <button onClick={vm.goAchievements} style={{ flex: 1, background: 'none', border: 'none', color: vm.tabAchievementsColor, font: "600 10px 'Inter'", display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: 0, whiteSpace: 'nowrap' }}>
        <div style={{ fontSize: 18 }}>🏅</div>
        Achievements
      </button>
      <button onClick={vm.goCoach} style={{ flex: 1, background: 'none', border: 'none', color: vm.tabCoachColor, font: "600 10px 'Inter'", display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: 0, whiteSpace: 'nowrap' }}>
        <div style={{ fontSize: 18 }}>💬</div>
        Coach
      </button>
    </div>
  );
}
