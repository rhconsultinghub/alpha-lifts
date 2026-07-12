import type { ViewModel } from '../state/viewModel';

export function DayBuilderScreen({ vm }: { vm: ViewModel }) {
  const dayLabel = vm.currentDay ? vm.currentDay.label : '';
  return (
    <>
      <div style={{ padding: '22px 20px 16px', borderBottom: '1px solid rgba(255,255,255,.08)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <button onClick={vm.closeDayBuilder} style={{ background: 'rgba(255,255,255,.08)', border: 'none', color: '#f5f0ea', width: 30, height: 30, borderRadius: '50%', fontSize: 14 }}>‹</button>
          <div className="num" style={{ fontSize: 17, fontWeight: 700 }}>Edit {dayLabel}</div>
          <button onClick={vm.closeDayBuilder} style={{ background: 'oklch(0.65 0.19 35)', border: 'none', color: '#0d0c0b', font: "700 12px 'Inter'", padding: '8px 14px', borderRadius: 100 }}>Done</button>
        </div>
      </div>

      <div style={{ padding: '16px 20px 40px' }}>
        <div style={{ font: "500 11px 'Inter'", color: 'rgba(245,240,234,.4)', letterSpacing: '.04em', marginBottom: 8 }}>LIVE MUSCLE BALANCE</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 20, background: 'rgba(255,255,255,.03)', borderRadius: 12, padding: 12 }}>
          {vm.muscleBars.map(m => (
            <div key={m.name} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 70, font: "500 11px 'Inter'", color: 'rgba(245,240,234,.65)' }}>{m.name}</div>
              <div style={{ flex: 1, height: 6, borderRadius: 4, background: 'rgba(255,255,255,.1)', overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${m.pctClamped}%`, background: m.color }} />
              </div>
              <div className="num" style={{ width: 38, textAlign: 'right', fontSize: 11, fontWeight: 700, color: m.color }}>{m.pctText}</div>
            </div>
          ))}
        </div>

        {vm.builderExercises.map((ex: any, i: number) => (
          <div key={i} style={{ background: 'rgba(255,255,255,.04)', borderRadius: 16, padding: 14, marginBottom: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
              <button onClick={ex.openDetail} style={{ background: 'none', border: 'none', padding: 0, textAlign: 'left', font: "600 16px 'Inter'", color: '#f5f0ea' }}>{ex.name}</button>
              <button onClick={ex.remove} style={{ flex: 'none', width: 24, height: 24, borderRadius: '50%', border: 'none', background: 'rgba(255,255,255,.08)', color: 'rgba(245,240,234,.6)', fontSize: 12 }}>✕</button>
            </div>
            <div style={{ font: "400 11px 'Inter'", color: 'rgba(245,240,234,.4)', margin: '2px 0 10px' }}>{ex.muscle} · {ex.repText}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(255,255,255,.06)', borderRadius: 100, padding: '4px 6px' }}>
                <button onClick={ex.decSets} style={{ width: 22, height: 22, borderRadius: '50%', border: 'none', background: 'rgba(255,255,255,.1)', color: '#f5f0ea' }}>–</button>
                <div className="num" style={{ fontSize: 12, fontWeight: 700, width: 44, textAlign: 'center' }}>{ex.sets} sets</div>
                <button onClick={ex.incSets} style={{ width: 22, height: 22, borderRadius: '50%', border: 'none', background: 'rgba(255,255,255,.1)', color: '#f5f0ea' }}>+</button>
              </div>
              <button onClick={ex.openEquip} style={{ font: "600 11px 'Inter'", padding: '6px 12px', borderRadius: 100, border: '1px solid rgba(255,255,255,.2)', background: 'none', color: 'rgba(245,240,234,.75)' }}>{ex.equipLabel} ▾</button>
              <button onClick={ex.openReplace} style={{ font: "600 11px 'Inter'", padding: '6px 12px', borderRadius: 100, border: 'none', background: 'none', color: 'oklch(0.72 0.15 35)' }}>⇄ Replace</button>
              {ex.canLinkNext && (
                <button onClick={ex.toggleLinkNext} style={{ font: "600 11px 'Inter'", padding: '6px 12px', borderRadius: 100, border: `1px solid ${ex.isLinkedToNext ? 'oklch(0.7 0.13 230 / 0.6)' : 'rgba(255,255,255,.2)'}`, background: ex.isLinkedToNext ? 'oklch(0.7 0.13 230 / 0.15)' : 'none', color: ex.isLinkedToNext ? 'oklch(0.78 0.13 230)' : 'rgba(245,240,234,.6)' }}>{ex.isLinkedToNext ? '🔗✓ Linked' : '🔗 Link Next'}</button>
              )}
            </div>
          </div>
        ))}

        <button onClick={vm.openAddExercise} style={{ width: '100%', marginTop: 8, background: 'none', border: '1px dashed rgba(255,255,255,.25)', color: 'rgba(245,240,234,.7)', font: "600 13px 'Inter'", padding: 14, borderRadius: 14 }}>+ Add Exercise</button>
      </div>
    </>
  );
}
