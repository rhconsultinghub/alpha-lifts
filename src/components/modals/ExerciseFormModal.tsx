import type { ViewModel } from '../../state/viewModel';

function Chip({ o }: { o: { label: string; select?: () => void; toggle?: () => void; bg: string; color: string; border: string } }) {
  return (
    <button onClick={o.select || o.toggle} style={{ font: "600 12px 'Inter'", padding: '8px 12px', borderRadius: 100, border: `1px solid ${o.border}`, background: o.bg, color: o.color }}>{o.label}</button>
  );
}

export function ExerciseFormModal({ vm }: { vm: ViewModel }) {
  const f = vm.exerciseForm as any;
  if (!f.open) return null;
  return (
    <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.55)', zIndex: 30, display: 'flex', alignItems: 'flex-end' }}>
      <div style={{ background: '#17140f', borderRadius: '24px 24px 0 0', width: '100%', maxHeight: '88%', display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
        <div style={{ padding: '18px 20px 6px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div className="num" style={{ fontSize: 17, fontWeight: 700 }}>{f.title}</div>
          <button onClick={f.close} style={{ background: 'rgba(255,255,255,.08)', border: 'none', color: '#f5f0ea', width: 28, height: 28, borderRadius: '50%', fontSize: 13 }}>✕</button>
        </div>
        <div style={{ padding: '14px 20px 4px' }}>
          <div style={{ font: "500 11px 'Inter'", color: 'rgba(245,240,234,.4)', letterSpacing: '.04em', marginBottom: 8 }}>NAME</div>
          <input value={f.name} onChange={e => f.setName(e.target.value)} placeholder="e.g. Cable Row" style={{ width: '100%', background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.12)', color: '#f5f0ea', font: "600 14px 'Inter'", padding: '12px 14px', borderRadius: 12, marginBottom: 18 }} />

          <div style={{ font: "500 11px 'Inter'", color: 'rgba(245,240,234,.4)', letterSpacing: '.04em', marginBottom: 8 }}>PRIMARY MUSCLE</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 18 }}>
            {f.muscleOptions.map((m: any, i: number) => <Chip key={i} o={m} />)}
          </div>

          <div style={{ font: "500 11px 'Inter'", color: 'rgba(245,240,234,.4)', letterSpacing: '.04em', marginBottom: 8 }}>SECONDARY MUSCLES</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 18 }}>
            {f.secondaryOptions.map((m: any, i: number) => <Chip key={i} o={m} />)}
          </div>

          <div style={{ font: "500 11px 'Inter'", color: 'rgba(245,240,234,.4)', letterSpacing: '.04em', marginBottom: 8 }}>EQUIPMENT</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 18 }}>
            {f.equipOptions.map((e: any, i: number) => <Chip key={i} o={e} />)}
          </div>

          <div style={{ font: "500 11px 'Inter'", color: 'rgba(245,240,234,.4)', letterSpacing: '.04em', marginBottom: 8 }}>MOVEMENT PATTERN</div>
          <div style={{ font: "400 11px 'Inter'", color: 'rgba(245,240,234,.4)', marginBottom: 8 }}>Exercises sharing a pattern get suggested as swaps for each other — e.g. barbell vs dumbbell row.</div>
          <input value={f.pattern} onChange={e => f.setPattern(e.target.value)} placeholder="e.g. row" style={{ width: '100%', background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.12)', color: '#f5f0ea', font: "600 14px 'Inter'", padding: '12px 14px', borderRadius: 12, marginBottom: 18 }} />

          <div style={{ font: "500 11px 'Inter'", color: 'rgba(245,240,234,.4)', letterSpacing: '.04em', marginBottom: 8 }}>TYPE</div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 18 }}>
            <button onClick={f.setCompound} style={{ flex: 1, font: "700 13px 'Inter'", padding: 12, borderRadius: 12, border: 'none', background: f.compoundBg, color: f.compoundColor }}>Compound</button>
            <button onClick={f.setIsolation} style={{ flex: 1, font: "700 13px 'Inter'", padding: 12, borderRadius: 12, border: 'none', background: f.isolationBg, color: f.isolationColor }}>Isolation</button>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
            <div style={{ font: "500 11px 'Inter'", color: 'rgba(245,240,234,.4)', letterSpacing: '.04em' }}>REST BETWEEN SETS</div>
            <div className="num" style={{ fontSize: 13, fontWeight: 700 }}>{f.restText}</div>
          </div>
          <input type="range" min={30} max={240} step={15} value={f.restBase} onChange={e => f.setRest(Number(e.target.value))} style={{ width: '100%', marginBottom: 18 }} />

          <div style={{ font: "500 11px 'Inter'", color: 'rgba(245,240,234,.4)', letterSpacing: '.04em', marginBottom: 8 }}>TRACKING</div>
          <div style={{ font: "400 11px 'Inter'", color: 'rgba(245,240,234,.4)', marginBottom: 8 }}>Time-based exercises (like planks) get a start/stop timer during the workout instead of a rep counter.</div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 18 }}>
            <button onClick={f.setTrackingReps} style={{ flex: 1, font: "700 13px 'Inter'", padding: 12, borderRadius: 12, border: 'none', background: f.trackingRepsBg, color: f.trackingRepsColor }}>Reps</button>
            <button onClick={f.setTrackingTime} style={{ flex: 1, font: "700 13px 'Inter'", padding: 12, borderRadius: 12, border: 'none', background: f.trackingTimeBg, color: f.trackingTimeColor }}>Time</button>
          </div>

          <div style={{ font: "500 11px 'Inter'", color: 'rgba(245,240,234,.4)', letterSpacing: '.04em', marginBottom: 8 }}>{f.rangeLabel}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
            <input type="number" value={f.repLo} onChange={e => f.setRepLo(e.target.value)} style={{ width: 60, background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.12)', borderRadius: 10, padding: 10 }} />
            <span style={{ color: 'rgba(245,240,234,.4)' }}>to</span>
            <input type="number" value={f.repHi} onChange={e => f.setRepHi(e.target.value)} style={{ width: 60, background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.12)', borderRadius: 10, padding: 10 }} />
            <span style={{ color: 'rgba(245,240,234,.45)', font: "400 12px 'Inter'" }}>{f.rangeUnit}</span>
          </div>

          <div style={{ font: "500 11px 'Inter'", color: 'rgba(245,240,234,.4)', letterSpacing: '.04em', marginBottom: 8 }}>FORM CUE</div>
          <textarea value={f.cue} onChange={e => f.setCue(e.target.value)} placeholder="Coaching cue shown during the workout" rows={3} style={{ width: '100%', background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.12)', color: '#f5f0ea', font: "400 13px 'Inter'", padding: '12px 14px', borderRadius: 12, marginBottom: 8, resize: 'none' }} />

          {f.error && <div style={{ font: "600 12px 'Inter'", color: 'oklch(0.72 0.17 35)', marginBottom: 4 }}>{f.error}</div>}
        </div>
        <div style={{ padding: '12px 20px 20px', borderTop: '1px solid rgba(255,255,255,.08)', display: 'flex', gap: 10 }}>
          {f.showDelete && (
            <button onClick={f.delete} style={{ font: "600 13px 'Inter'", padding: '15px 16px', borderRadius: 14, border: 'none', background: 'none', color: f.deleteColor }}>{f.deleteLabel}</button>
          )}
          <button onClick={f.save} style={{ flex: 1, background: 'oklch(0.65 0.19 35)', color: '#0d0c0b', font: "700 14px 'Inter'", padding: 15, borderRadius: 14, border: 'none' }}>{f.saveLabel}</button>
        </div>
      </div>
    </div>
  );
}
