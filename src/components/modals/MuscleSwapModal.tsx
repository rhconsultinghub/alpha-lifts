import type { ViewModel } from '../../state/viewModel';

function OptionRow({ o }: { o: { label: string; muscle?: string; check: string; bg: string; border: string; stage: () => void } }) {
  return (
    <button onClick={o.stage} style={{ width: '100%', textAlign: 'left', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: o.bg, border: `1px solid ${o.border}`, color: '#f5f0ea', font: "600 13px 'Inter'", padding: '12px 14px', borderRadius: 12, marginBottom: 8 }}>
      <span>{o.label}{o.muscle && <span style={{ color: 'rgba(245,240,234,.4)', fontWeight: 400 }}> · {o.muscle}</span>}</span>
      <span style={{ color: 'oklch(0.72 0.17 35)' }}>{o.check}</span>
    </button>
  );
}

export function MuscleSwapModal({ vm }: { vm: ViewModel }) {
  const ms = vm.muscleSwap as any;
  if (!ms.open) return null;
  return (
    <div onClick={ms.backdrop} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.55)', zIndex: 30, display: 'flex', alignItems: 'flex-end' }}>
      <div onClick={e => e.stopPropagation()} style={{ background: '#17140f', borderRadius: '24px 24px 0 0', width: '100%', maxHeight: '82%', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '16px 20px 4px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div className="num" style={{ fontSize: 17, fontWeight: 700 }}>{ms.title}</div>
          <button onClick={ms.close} style={{ background: 'rgba(255,255,255,.08)', border: 'none', color: '#f5f0ea', width: 28, height: 28, borderRadius: '50%', fontSize: 13 }}>✕</button>
        </div>
        <div style={{ font: "400 12px 'Inter'", color: 'rgba(245,240,234,.45)', padding: '0 20px 4px' }}>Replacing {ms.exName}.</div>

        <div style={{ overflowY: 'auto', flex: 1, padding: '8px 20px 12px' }}>
          <div style={{ font: "500 11px 'Inter'", color: 'rgba(245,240,234,.4)', letterSpacing: '.04em', margin: '6px 0 8px' }}>APPLY TO WHICH DAY(S)</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
            {ms.dayOptions.map((d: any, i: number) => (
              <button key={i} onClick={d.toggle} style={{ font: "600 12px 'Inter'", padding: '9px 14px', borderRadius: 10, background: d.bg, border: `1px solid ${d.border}`, color: '#f5f0ea', display: 'flex', alignItems: 'center', gap: 6 }}>
                {d.label}<span style={{ color: 'oklch(0.72 0.17 35)' }}>{d.check}</span>
              </button>
            ))}
          </div>

          {ms.hasVariants && (
            <>
              <div style={{ font: "500 11px 'Inter'", color: 'rgba(245,240,234,.4)', letterSpacing: '.04em', margin: '6px 0 8px' }}>SAME MOVEMENT, DIFFERENT EQUIPMENT</div>
              {ms.variantOptions.map((o: any, i: number) => <OptionRow key={i} o={o} />)}
            </>
          )}
          <div style={{ font: "500 11px 'Inter'", color: 'rgba(245,240,234,.4)', letterSpacing: '.04em', margin: '6px 0 8px' }}>SAME MUSCLE GROUP</div>
          {ms.sameMuscleOptions.map((o: any, i: number) => <OptionRow key={i} o={o} />)}
          <button onClick={ms.toggleAll} style={{ background: 'none', border: 'none', color: 'oklch(0.72 0.15 35)', font: "600 12px 'Inter'", padding: '6px 0 10px' }}>{ms.showAllLabel}</button>
          {ms.showAll && (
            <>
              <div style={{ font: "500 11px 'Inter'", color: 'rgba(245,240,234,.4)', letterSpacing: '.04em', margin: '6px 0 8px' }}>OTHER MUSCLE GROUPS</div>
              {ms.otherMuscleOptions.map((o: any, i: number) => <OptionRow key={i} o={o} />)}
            </>
          )}
        </div>

        <div style={{ padding: '12px 20px 20px', borderTop: '1px solid rgba(255,255,255,.08)' }}>
          <button onClick={ms.confirm} disabled={ms.confirmDisabled} style={{ width: '100%', background: ms.confirmBg, color: '#0d0c0b', font: "700 14px 'Inter'", padding: 15, borderRadius: 14, border: 'none' }}>{ms.confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}
