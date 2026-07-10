import type { ViewModel } from '../../state/viewModel';

export function NewProgramWizardModal({ vm }: { vm: ViewModel }) {
  const w = vm.newProgramWizard as any;
  if (!w.open) return null;
  return (
    <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.55)', zIndex: 31, display: 'flex', alignItems: 'flex-end' }}>
      <div style={{ background: '#17140f', borderRadius: '24px 24px 0 0', width: '100%', maxHeight: '90%', display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
        <div style={{ padding: '18px 20px 6px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div className="num" style={{ fontSize: 17, fontWeight: 700 }}>New Program</div>
          <button onClick={w.close} style={{ background: 'rgba(255,255,255,.08)', border: 'none', color: '#f5f0ea', width: 28, height: 28, borderRadius: '50%', fontSize: 13 }}>✕</button>
        </div>
        <div style={{ padding: '14px 20px 4px' }}>
          <div style={{ font: "500 11px 'Inter'", color: 'rgba(245,240,234,.4)', letterSpacing: '.04em', marginBottom: 8 }}>NAME</div>
          <input value={w.name} onChange={e => w.setName(e.target.value)} placeholder="e.g. Off-Season Strength" style={{ width: '100%', background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.12)', color: '#f5f0ea', font: "600 14px 'Inter'", padding: '12px 14px', borderRadius: 12, marginBottom: 20 }} />

          <div style={{ font: "500 11px 'Inter'", color: 'rgba(245,240,234,.4)', letterSpacing: '.04em', marginBottom: 8 }}>TRAINING PLAN</div>
          <div style={{ font: "400 11px 'Inter'", color: 'rgba(245,240,234,.4)', marginBottom: 8 }}>Sets the rep style used as a default whenever an exercise is added.</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 20 }}>
            {w.planOptions.map((p: any, i: number) => (
              <button key={i} onClick={p.select} style={{ font: "600 12px 'Inter'", padding: '8px 12px', borderRadius: 100, border: `1px solid ${p.border}`, background: p.bg, color: p.color }}>{p.label}</button>
            ))}
          </div>

          <div style={{ font: "500 11px 'Inter'", color: 'rgba(245,240,234,.4)', letterSpacing: '.04em', marginBottom: 8 }}>WORKOUT SPLIT</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
            {w.splitOptions.map((sp: any, i: number) => (
              <button key={i} onClick={sp.select} style={{ textAlign: 'left', background: sp.bg, border: `1px solid ${sp.border}`, borderRadius: 14, padding: '12px 14px', display: 'flex', gap: 10 }}>
                <span style={{ color: sp.dotColor, fontSize: 14, lineHeight: 1.4 }}>{sp.dot}</span>
                <span style={{ flex: 1 }}>
                  <span style={{ display: 'block', font: "600 13px 'Inter'", color: '#f5f0ea' }}>{sp.label}</span>
                  <span style={{ display: 'block', font: "400 11px 'Inter'", color: 'rgba(245,240,234,.5)', marginTop: 2 }}>{sp.desc}</span>
                  {sp.preview && <span style={{ display: 'block', font: "500 10px 'Inter'", color: 'rgba(245,240,234,.35)', marginTop: 4 }}>{sp.preview}</span>}
                </span>
              </button>
            ))}
          </div>

          {w.showPrefill && (
            <>
              <div style={{ font: "500 11px 'Inter'", color: 'rgba(245,240,234,.4)', letterSpacing: '.04em', marginBottom: 8 }}>EXERCISES</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
                <button onClick={w.setPrefillRecommended} style={{ textAlign: 'left', padding: '12px 14px', borderRadius: 14, border: '1px solid rgba(255,255,255,.1)', background: w.prefillRecommendedBg, color: w.prefillRecommendedColor }}>
                  <span style={{ display: 'block', font: "600 13px 'Inter'" }}>Prepopulate recommended exercises</span>
                  <span style={{ display: 'block', font: "400 11px 'Inter'", opacity: 0.8, marginTop: 2 }}>Sets are calibrated to your training plan so weekly targets land close to 100%, not over.</span>
                </button>
                <button onClick={w.setPrefillScratch} style={{ textAlign: 'left', padding: '12px 14px', borderRadius: 14, border: '1px solid rgba(255,255,255,.1)', background: w.prefillScratchBg, color: w.prefillScratchColor }}>
                  <span style={{ display: 'block', font: "600 13px 'Inter'" }}>Start empty</span>
                  <span style={{ display: 'block', font: "400 11px 'Inter'", opacity: 0.8, marginTop: 2 }}>No exercises added — build each day yourself from the exercise library.</span>
                </button>
              </div>
            </>
          )}

          {w.isCustom && (
            <>
              <div style={{ font: "500 11px 'Inter'", color: 'rgba(245,240,234,.4)', letterSpacing: '.04em', marginBottom: 8 }}>DAYS</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
                {w.customDays.map((d: any, i: number) => (
                  <div key={i} style={{ background: 'rgba(255,255,255,.04)', borderRadius: 14, padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <input value={d.label} onChange={e => d.setLabel(e.target.value)} style={{ flex: 1, minWidth: 0, background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.1)', color: '#f5f0ea', font: "600 13px 'Inter'", padding: '8px 10px', borderRadius: 10 }} />
                    <button onClick={d.setTraining} style={{ font: "600 11px 'Inter'", padding: '8px 10px', borderRadius: 100, border: 'none', background: d.trainingBg, color: d.trainingColor }}>Training</button>
                    <button onClick={d.setRest} style={{ font: "600 11px 'Inter'", padding: '8px 10px', borderRadius: 100, border: 'none', background: d.restBg, color: d.restColor }}>Rest</button>
                    {d.canRemove && (
                      <button onClick={d.remove} style={{ flex: 'none', width: 24, height: 24, borderRadius: '50%', border: 'none', background: 'rgba(255,255,255,.08)', color: 'rgba(245,240,234,.6)', fontSize: 12 }}>✕</button>
                    )}
                  </div>
                ))}
              </div>
              <button onClick={w.addDay} style={{ width: '100%', background: 'none', border: '1px dashed rgba(255,255,255,.25)', color: 'rgba(245,240,234,.6)', font: "600 12px 'Inter'", padding: 12, borderRadius: 14, marginBottom: 8 }}>+ Add Day</button>
            </>
          )}
        </div>
        <div style={{ padding: '12px 20px 20px', borderTop: '1px solid rgba(255,255,255,.08)' }}>
          <button onClick={w.create} style={{ width: '100%', background: 'oklch(0.65 0.19 35)', color: '#0d0c0b', font: "700 14px 'Inter'", padding: 15, borderRadius: 14, border: 'none' }}>Create Program</button>
        </div>
      </div>
    </div>
  );
}
