import type { ViewModel } from '../state/viewModel';

export function TabBar({ vm }: { vm: ViewModel }) {
  if (!vm.showTabs) return null;
  return (
    <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, display: 'flex', background: 'rgba(15,14,13,.92)', backdropFilter: 'blur(10px)', borderTop: '1px solid rgba(255,255,255,.08)', padding: '10px 20px 16px' }}>
      <button onClick={vm.goProgram} style={{ flex: 1, background: 'none', border: 'none', color: vm.tabProgramColor, font: "600 12px 'Inter'", display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
        <div style={{ fontSize: 18 }}>🏋</div>Program
      </button>
      <button onClick={vm.goProgress} style={{ flex: 1, background: 'none', border: 'none', color: vm.tabProgressColor, font: "600 12px 'Inter'", display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
        <div style={{ fontSize: 18 }}>📈</div>Progress
      </button>
      <button onClick={vm.goExercises} style={{ flex: 1, background: 'none', border: 'none', color: vm.tabExercisesColor, font: "600 12px 'Inter'", display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
        <div style={{ fontSize: 18 }}>📋</div>Exercises
      </button>
      <button onClick={vm.goAchievements} style={{ flex: 1, background: 'none', border: 'none', color: vm.tabAchievementsColor, font: "600 12px 'Inter'", display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, position: 'relative' }}>
        <div style={{ fontSize: 18, position: 'relative' }}>
          🏅
          {vm.hasNewAchievements && (
            <span style={{ position: 'absolute', top: -2, right: -4, width: 8, height: 8, borderRadius: '50%', background: 'oklch(0.65 0.19 35)', border: '1.5px solid #0f0e0d' }} />
          )}
        </div>
        Achievements
      </button>
    </div>
  );
}
