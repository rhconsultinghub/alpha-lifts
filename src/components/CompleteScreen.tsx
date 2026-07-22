import type { ViewModel } from '../state/viewModel';

export function CompleteScreen({ vm }: { vm: ViewModel }) {
  const prCount = vm.completeSummary.filter(c => c.isPR).length;
  const earned = (vm.achievements as any).newlyUnlocked as any[];
  return (
    <div style={{ padding: '60px 24px 40px', textAlign: 'center' }}>
      <div style={{ fontSize: 44, marginBottom: 12 }}>🏁</div>
      <div className="num" style={{ fontSize: 28, fontWeight: 700, marginBottom: 6 }}>Workout Complete</div>
      <div style={{ font: "400 13px 'Inter'", color: 'rgba(245,240,234,.5)', marginBottom: prCount > 0 ? 10 : 28 }}>{vm.completeSubtitle}</div>
      {prCount > 0 && (
        <div style={{ font: "700 13px 'Inter'", color: 'oklch(0.8 0.16 90)', marginBottom: 28 }}>🏆 {prCount} new record{prCount > 1 ? 's' : ''} this session!</div>
      )}

      {earned.length > 0 && (
        <div style={{ textAlign: 'left', borderRadius: 16, padding: '14px 16px', background: 'oklch(0.65 0.19 35 / 0.1)', border: '1px solid oklch(0.65 0.19 35 / 0.35)', marginBottom: 24 }}>
          <div style={{ font: "700 12px 'Inter'", color: 'oklch(0.82 0.15 35)', marginBottom: 10 }}>
            🏅 {earned.length} badge{earned.length > 1 ? 's' : ''} earned since you last checked
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {earned.map(a => (
              <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 17, flex: 'none' }}>{a.icon}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ font: "600 13px 'Inter'", color: '#f5f0ea' }}>{a.tierName}</div>
                  <div style={{ font: "400 11px 'Inter'", color: 'rgba(245,240,234,.45)' }}>{a.title} · {a.tierText}</div>
                </div>
                <div className="num" style={{ flex: 'none', font: "700 13px 'Inter'", color: 'oklch(0.78 0.15 35)' }}>+{a.tierPoints}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {vm.planPrompt.show && (
        <div style={{ textAlign: 'left', display: 'flex', gap: 8, alignItems: 'flex-start', padding: 14, borderRadius: 14, background: 'oklch(0.65 0.19 35 / 0.1)', border: '1px solid oklch(0.65 0.19 35 / 0.35)', marginBottom: 24 }}>
          <span style={{ fontSize: 15 }}>⇄</span>
          <div style={{ flex: 1 }}>
            <div style={{ font: "400 12px/1.4 'Inter'", color: 'rgba(245,240,234,.85)' }}>{vm.planPrompt.text}</div>
            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              <button onClick={vm.planPrompt.apply} style={{ flex: 1, font: "700 12px 'Inter'", padding: 10, borderRadius: 10, border: 'none', background: 'oklch(0.65 0.19 35)', color: '#0d0c0b' }}>Update My Plan</button>
              <button onClick={vm.planPrompt.discard} style={{ flex: 1, font: "600 12px 'Inter'", padding: 10, borderRadius: 10, border: '1px solid rgba(255,255,255,.2)', background: 'none', color: 'rgba(245,240,234,.7)' }}>Just This Once</button>
            </div>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, textAlign: 'left', marginBottom: 28 }}>
        {vm.completeSummary.map((c, i) => (
          <div key={i} style={{ background: c.isPR ? 'oklch(0.78 0.15 90 / 0.08)' : 'rgba(255,255,255,.04)', border: c.isPR ? '1px solid oklch(0.78 0.15 90 / 0.4)' : '1px solid transparent', borderRadius: 14, padding: '12px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ font: "600 14px 'Inter'" }}>{c.name}</div>
              <div style={{ font: "400 11px 'Inter'", color: 'rgba(245,240,234,.45)', marginTop: 2 }}>{c.resultText}</div>
            </div>
            <div style={{ font: "600 11px 'Inter'", padding: '4px 9px', borderRadius: 100, background: c.badgeBg, color: c.badgeColor }}>{c.badgeText}</div>
          </div>
        ))}
      </div>

      <button onClick={vm.goProgram} style={{ width: '100%', background: 'oklch(0.65 0.19 35)', color: '#0d0c0b', font: "700 15px 'Inter'", padding: 16, borderRadius: 16, border: 'none' }}>Back to Program</button>
    </div>
  );
}
