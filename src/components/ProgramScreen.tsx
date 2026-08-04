import type { ViewModel } from '../state/viewModel';

export function ProgramScreen({ vm }: { vm: ViewModel }) {
  return (
    <div style={{ padding: '24px 20px 100px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <img src={`${import.meta.env.BASE_URL}icon-192.png`} alt="" width={22} height={22} style={{ borderRadius: 6, display: 'block' }} />
          <span className="num" style={{ font: "700 13px 'Space Grotesk'", letterSpacing: '.12em', color: 'rgba(245,240,234,.85)' }}>ALPHA LIFTS</span>
        </div>
        <button onClick={vm.openSettings} style={{ background: 'rgba(255,255,255,.08)', border: 'none', color: '#f5f0ea', width: 30, height: 30, borderRadius: '50%', fontSize: 15 }}>⚙</button>
      </div>
      <div style={{ font: "600 13px 'Inter'", color: 'oklch(0.72 0.17 35)', marginBottom: 2 }}>{vm.homeGreeting}</div>
      <input
        value={vm.programName}
        onChange={e => vm.renameProgram(e.target.value)}
        className="num"
        style={{ fontSize: 30, fontWeight: 700, marginBottom: 10, background: 'none', border: 'none', color: '#f5f0ea', width: '100%', padding: 0 }}
      />
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        <button onClick={vm.openSettings} style={{ background: 'rgba(255,255,255,.06)', border: 'none', color: 'rgba(245,240,234,.65)', font: "600 11px 'Inter'", padding: '6px 12px', borderRadius: 100 }}>
          {vm.currentPlanLabel} · {vm.currentUnitsLabel} ▾
        </button>
        <button onClick={vm.openWeekReview} style={{ font: "600 11px 'Inter'", padding: '6px 12px', borderRadius: 100, border: 'none', background: 'rgba(255,255,255,.04)', color: 'rgba(245,240,234,.5)' }}>Week {vm.weekNumber} ▾</button>
      </div>

      <button onClick={vm.toggleMuscleBalance} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, width: '100%', background: 'none', border: 'none', padding: 0, marginBottom: 10 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span style={{ font: "500 11px 'Inter'", color: 'rgba(245,240,234,.4)', letterSpacing: '.04em' }}>MUSCLE BALANCE</span>
          {vm.muscleBalanceCollapsed && (
            <span style={{ font: "500 11px 'Inter'", color: 'rgba(245,240,234,.35)' }}>· {vm.muscleBalanceSummary}</span>
          )}
        </div>
        <span style={{ fontSize: 12, color: 'rgba(245,240,234,.4)', transform: vm.muscleBalanceCollapsed ? 'none' : 'rotate(180deg)', transition: 'transform .15s' }}>▾</span>
      </button>
      {!vm.muscleBalanceCollapsed && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 26, background: 'rgba(255,255,255,.03)', borderRadius: 14, padding: '10px 8px' }}>
          {vm.muscleBars.map(m => (
            <button key={m.name} onClick={m.drill} style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'none', border: 'none', padding: '5px 6px', borderRadius: 8, width: '100%' }}>
              <div style={{ width: 70, font: "500 11px 'Inter'", color: 'rgba(245,240,234,.65)', textAlign: 'left' }}>{m.name}</div>
              <div style={{ flex: 1, height: 4, borderRadius: 3, background: 'rgba(255,255,255,.1)', overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${m.pctClamped}%`, background: m.color }} />
              </div>
              <div className="num" style={{ width: 38, textAlign: 'right', fontSize: 11, fontWeight: 700, color: m.color }}>{m.pctText}</div>
            </button>
          ))}
        </div>
      )}
      {vm.muscleBalanceCollapsed && <div style={{ marginBottom: 26 }} />}

      {vm.deload.show && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: '12px 14px', borderRadius: 14, background: 'oklch(0.7 0.13 230 / 0.1)', border: '1px solid oklch(0.7 0.13 230 / 0.35)', marginBottom: 20 }}>
          <span style={{ fontSize: 15 }}>😴</span>
          <div style={{ flex: 1 }}>
            <div style={{ font: "600 12px 'Inter'", color: 'oklch(0.78 0.13 230)', marginBottom: 2 }}>Consider a deload</div>
            <div style={{ font: "400 12px/1.4 'Inter'", color: 'rgba(245,240,234,.8)' }}>{vm.deload.text}</div>
            <button onClick={vm.deload.dismiss} style={{ marginTop: 8, font: "600 11px 'Inter'", padding: '6px 12px', borderRadius: 100, border: '1px solid oklch(0.7 0.13 230 / 0.5)', background: 'none', color: 'oklch(0.78 0.13 230)' }}>Dismiss for this week</button>
          </div>
        </div>
      )}

      {vm.deloadWeek.mode !== 'none' && (
        <div style={{
          display: 'flex', gap: 8, alignItems: 'flex-start', padding: '12px 14px', borderRadius: 14,
          background: vm.deloadWeek.mode === 'active' ? 'oklch(0.72 0.14 155 / 0.12)' : 'oklch(0.7 0.13 230 / 0.1)',
          border: '1px solid ' + (vm.deloadWeek.mode === 'active' ? 'oklch(0.72 0.14 155 / 0.4)' : 'oklch(0.7 0.13 230 / 0.35)'),
          marginBottom: 20
        }}>
          <span style={{ fontSize: 15 }}>{vm.deloadWeek.mode === 'active' ? '🌱' : '😴'}</span>
          <div style={{ flex: 1 }}>
            <div style={{ font: "600 12px 'Inter'", color: vm.deloadWeek.mode === 'active' ? 'oklch(0.8 0.14 155)' : 'oklch(0.78 0.13 230)', marginBottom: 2 }}>{vm.deloadWeek.title}</div>
            <div style={{ font: "400 12px/1.4 'Inter'", color: 'rgba(245,240,234,.8)' }}>{vm.deloadWeek.text}</div>
            <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
              {vm.deloadWeek.mode === 'active' ? (
                <button onClick={vm.deloadWeek.end} style={{ font: "600 11px 'Inter'", padding: '6px 12px', borderRadius: 100, border: '1px solid oklch(0.72 0.14 155 / 0.5)', background: 'none', color: 'oklch(0.8 0.14 155)' }}>End deload early</button>
              ) : (
                <>
                  <button onClick={vm.deloadWeek.start} style={{ font: "600 11px 'Inter'", padding: '6px 12px', borderRadius: 100, border: 'none', background: 'oklch(0.7 0.13 230)', color: '#0d0c0b' }}>Start deload week</button>
                  <button onClick={vm.deloadWeek.defer} style={{ font: "600 11px 'Inter'", padding: '6px 12px', borderRadius: 100, border: '1px solid oklch(0.7 0.13 230 / 0.5)', background: 'none', color: 'oklch(0.78 0.13 230)' }}>Push back a week</button>
                  <button onClick={vm.deloadWeek.skip} style={{ font: "600 11px 'Inter'", padding: '6px 12px', borderRadius: 100, border: '1px solid rgba(255,255,255,.15)', background: 'none', color: 'rgba(245,240,234,.6)' }}>Skip this one</button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      <div style={{ font: "500 11px 'Inter'", color: 'rgba(245,240,234,.4)', letterSpacing: '.04em', marginBottom: 10 }}>TRAINING DAYS</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {vm.programDays.map(d => (
          <button key={d.key} onClick={d.open} style={{ textAlign: 'left', display: 'flex', alignItems: 'center', gap: 12, background: 'rgba(255,255,255,.04)', border: 'none', borderRadius: 16, padding: '14px 16px', color: '#f5f0ea', opacity: d.rowOpacity, width: '100%' }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', flex: 'none', background: d.dotColor }} />
            <div style={{ flex: 1 }}>
              <div style={{ font: "600 15px 'Inter'" }}>{d.label}</div>
              <div style={{ font: "400 12px 'Inter'", color: 'rgba(245,240,234,.45)', marginTop: 2 }}>{d.subtitle}</div>
            </div>
            <div style={{ font: "600 11px 'Inter'", padding: '4px 9px', borderRadius: 100, background: d.badgeBg, color: d.badgeColor }}>{d.badgeText}</div>
            <div style={{ fontSize: 14, color: 'rgba(245,240,234,.3)' }}>{d.chevron}</div>
          </button>
        ))}
      </div>
    </div>
  );
}
