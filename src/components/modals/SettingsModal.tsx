import type { ViewModel } from '../../state/viewModel';

export function SettingsModal({ vm }: { vm: ViewModel }) {
  const st = vm.settings;
  if (!st.open) return null;
  return (
    <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.55)', zIndex: 30, display: 'flex', alignItems: 'flex-end' }}>
      <div style={{ background: '#17140f', borderRadius: '24px 24px 0 0', width: '100%', maxHeight: '86%', display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
        <div style={{ padding: '18px 20px 6px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div className="num" style={{ fontSize: 17, fontWeight: 700 }}>Settings</div>
          <button onClick={st.close} style={{ background: 'rgba(255,255,255,.08)', border: 'none', color: '#f5f0ea', width: 28, height: 28, borderRadius: '50%', fontSize: 13 }}>✕</button>
        </div>
        <div style={{ padding: '16px 20px 24px' }}>
          <div style={{ font: "500 11px 'Inter'", color: 'rgba(245,240,234,.4)', letterSpacing: '.04em', marginBottom: 10 }}>UNITS</div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
            <button onClick={st.setKg} style={{ flex: 1, font: "700 13px 'Inter'", padding: 12, borderRadius: 12, border: 'none', background: st.unitsKgBg, color: st.unitsKgColor }}>Kilograms (kg)</button>
            <button onClick={st.setLb} style={{ flex: 1, font: "700 13px 'Inter'", padding: 12, borderRadius: 12, border: 'none', background: st.unitsLbBg, color: st.unitsLbColor }}>Pounds (lb)</button>
          </div>
          <div style={{ font: "500 11px 'Inter'", color: 'rgba(245,240,234,.4)', letterSpacing: '.04em', marginBottom: 10 }}>PROGRAMS</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
            {st.programsList.map(p => (
              <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'rgba(255,255,255,.04)', borderRadius: 14, padding: '12px 14px' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <input
                    value={p.name}
                    onChange={e => p.rename(e.target.value)}
                    style={{ width: '100%', background: 'none', border: 'none', color: '#f5f0ea', font: "600 13px 'Inter'", padding: 0 }}
                  />
                  <div style={{ font: "400 11px 'Inter'", color: 'rgba(245,240,234,.45)', marginTop: 2 }}>{p.count} days</div>
                </div>
                {p.isActive && (
                  <span style={{ font: "600 11px 'Inter'", padding: '6px 12px', borderRadius: 100, background: 'oklch(0.7 0.15 145 / 0.15)', color: 'oklch(0.75 0.15 145)' }}>Active</span>
                )}
                {p.showSwitch && (
                  <button onClick={p.switchTo} style={{ font: "600 11px 'Inter'", padding: '8px 14px', borderRadius: 100, border: '1px solid rgba(255,255,255,.2)', background: 'none', color: 'rgba(245,240,234,.75)' }}>Switch</button>
                )}
                {p.showDelete && (
                  <button onClick={p.remove} style={{ font: "600 11px 'Inter'", padding: '8px 10px', borderRadius: 100, border: 'none', background: 'none', color: p.deleteColor }}>{p.deleteLabel}</button>
                )}
              </div>
            ))}
            <button onClick={st.newProgram} style={{ width: '100%', background: 'none', border: '1px dashed rgba(255,255,255,.25)', color: 'rgba(245,240,234,.6)', font: "600 12px 'Inter'", padding: 12, borderRadius: 14 }}>+ Duplicate as New Program</button>
            <button onClick={st.openWizard} style={{ width: '100%', background: 'oklch(0.65 0.19 35 / 0.12)', border: '1px solid oklch(0.65 0.19 35 / 0.4)', color: 'oklch(0.78 0.15 35)', font: "600 12px 'Inter'", padding: 12, borderRadius: 14 }}>+ Create New Program from Scratch</button>
          </div>
          <div style={{ font: "500 11px 'Inter'", color: 'rgba(245,240,234,.4)', letterSpacing: '.04em', marginBottom: 10 }}>TRAINING PLAN</div>
          <div style={{ font: "400 11px 'Inter'", color: 'rgba(245,240,234,.4)', marginBottom: 10 }}>Applies to your current program, {vm.programName}.</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 24 }}>
            {st.trainingTypes.map(tt => (
              <button key={tt.key} onClick={tt.select} style={{ textAlign: 'left', background: tt.rowBg, border: `1px solid ${tt.rowBorder}`, borderRadius: 14, padding: '12px 14px', display: 'flex', gap: 10 }}>
                <span style={{ color: tt.dotColor, fontSize: 14, lineHeight: 1.4 }}>{tt.dot}</span>
                <span>
                  <div style={{ font: "600 13px 'Inter'", color: '#f5f0ea' }}>{tt.label}</div>
                  <div style={{ font: "400 11px/1.4 'Inter'", color: 'rgba(245,240,234,.5)', marginTop: 2 }}>{tt.desc}</div>
                </span>
              </button>
            ))}
          </div>

          <div style={{ font: "500 11px 'Inter'", color: 'rgba(245,240,234,.4)', letterSpacing: '.04em', marginBottom: 10 }}>FEEL</div>

          <div style={{ font: "500 12px 'Inter'", color: 'rgba(245,240,234,.75)', marginBottom: 4 }}>Rest Pacing</div>
          <div style={{ font: "400 11px 'Inter'", color: 'rgba(245,240,234,.4)', marginBottom: 8 }}>{st.restPacingDesc}</div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 18 }}>
            {st.restPacingOptions.map(o => (
              <button key={o.label} onClick={o.select} style={{ flex: 1, font: "600 12px 'Inter'", padding: 10, borderRadius: 10, border: 'none', background: o.bg, color: o.color }}>{o.label}</button>
            ))}
          </div>

          <div style={{ font: "500 12px 'Inter'", color: 'rgba(245,240,234,.75)', marginBottom: 4 }}>Coach Voice</div>
          <div style={{ font: "400 11px 'Inter'", color: 'rgba(245,240,234,.4)', marginBottom: 8 }}>{st.coachVoiceDesc}</div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 18 }}>
            {st.coachVoiceOptions.map(o => (
              <button key={o.label} onClick={o.select} style={{ flex: 1, font: "600 12px 'Inter'", padding: 10, borderRadius: 10, border: 'none', background: o.bg, color: o.color }}>{o.label}</button>
            ))}
          </div>

          <div style={{ font: "500 12px 'Inter'", color: 'rgba(245,240,234,.75)', marginBottom: 4 }}>Warm-Up Style</div>
          <div style={{ font: "400 11px 'Inter'", color: 'rgba(245,240,234,.4)', marginBottom: 8 }}>{st.warmupStyleDesc}</div>
          <div style={{ display: 'flex', gap: 8 }}>
            {st.warmupStyleOptions.map(o => (
              <button key={o.label} onClick={o.select} style={{ flex: 1, font: "600 12px 'Inter'", padding: 10, borderRadius: 10, border: 'none', background: o.bg, color: o.color }}>{o.label}</button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
