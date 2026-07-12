import type { ViewModel } from '../../state/viewModel';

function OptionRow({ o }: { o: { label: string; muscle?: string; check: string; bg: string; border: string; stage: () => void } }) {
  return (
    <button onClick={o.stage} style={{ width: '100%', textAlign: 'left', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: o.bg, border: `1px solid ${o.border}`, color: '#f5f0ea', font: "600 13px 'Inter'", padding: '12px 14px', borderRadius: 12, marginBottom: 8 }}>
      <span>{o.label}{o.muscle && <span style={{ color: 'rgba(245,240,234,.4)', fontWeight: 400 }}> · {o.muscle}</span>}</span>
      <span style={{ color: 'oklch(0.72 0.17 35)' }}>{o.check}</span>
    </button>
  );
}

export function SwapModal({ vm }: { vm: ViewModel }) {
  const sw = vm.swap;
  if (!sw.open) return null;
  return (
    <div onClick={sw.backdrop} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.55)', zIndex: 30, display: 'flex', alignItems: 'flex-end' }}>
      <div onClick={e => e.stopPropagation()} style={{ background: '#17140f', borderRadius: '24px 24px 0 0', width: '100%', maxHeight: '82%', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '16px 20px 4px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div className="num" style={{ fontSize: 17, fontWeight: 700 }}>{sw.title}</div>
          <button onClick={sw.close} style={{ background: 'rgba(255,255,255,.08)', border: 'none', color: '#f5f0ea', width: 28, height: 28, borderRadius: '50%', fontSize: 13 }}>✕</button>
        </div>
        <div style={{ display: 'flex', gap: 6, padding: '10px 20px' }}>
          <button onClick={sw.tabEquip} style={{ flex: 1, font: "600 12px 'Inter'", padding: 10, borderRadius: 10, border: 'none', background: sw.equipTabBg, color: sw.equipTabColor }}>Change Equipment</button>
          <button onClick={sw.tabReplace} style={{ flex: 1, font: "600 12px 'Inter'", padding: 10, borderRadius: 10, border: 'none', background: sw.replaceTabBg, color: sw.replaceTabColor }}>Replace Exercise</button>
        </div>

        <div style={{ overflowY: 'auto', flex: 1, padding: '8px 20px 12px' }}>
          {sw.showEquip && (
            <>
              <div style={{ font: "400 12px 'Inter'", color: 'rgba(245,240,234,.45)', marginBottom: 10 }}>Same exercise, different equipment. Only affects {sw.exName}.</div>
              {sw.equipOptions.map((o: any, i: number) => <OptionRow key={i} o={o} />)}
            </>
          )}
          {sw.showReplace && (
            <>
              <input
                value={sw.query}
                onChange={e => sw.setQuery(e.target.value)}
                placeholder="Search by exercise or muscle…"
                style={{ width: '100%', background: 'rgba(255,255,255,.07)', border: 'none', borderRadius: 10, padding: '10px 12px', color: '#f5f0ea', font: "500 13px 'Inter'", marginBottom: 12 }}
              />
              {sw.noMatches ? (
                <div style={{ padding: '16px 0', textAlign: 'center', font: "500 12px 'Inter'", color: 'rgba(245,240,234,.4)' }}>No exercises match "{sw.query}".</div>
              ) : (
                <>
                  {sw.hasVariants && (
                    <>
                      <div style={{ font: "500 11px 'Inter'", color: 'rgba(245,240,234,.4)', letterSpacing: '.04em', margin: '6px 0 8px' }}>SAME MOVEMENT, DIFFERENT EQUIPMENT</div>
                      {sw.variantOptions.map((o: any, i: number) => <OptionRow key={i} o={o} />)}
                    </>
                  )}
                  {sw.sameMuscleOptions.length > 0 && (
                    <>
                      <div style={{ font: "500 11px 'Inter'", color: 'rgba(245,240,234,.4)', letterSpacing: '.04em', margin: '6px 0 8px' }}>SAME MUSCLE GROUP</div>
                      {sw.sameMuscleOptions.map((o: any, i: number) => <OptionRow key={i} o={o} />)}
                    </>
                  )}
                  {!sw.query && (
                    <button onClick={sw.toggleAll} style={{ background: 'none', border: 'none', color: 'oklch(0.72 0.15 35)', font: "600 12px 'Inter'", padding: '6px 0 10px' }}>{sw.showAllLabel}</button>
                  )}
                  {sw.showAll && sw.otherMuscleOptions.length > 0 && (
                    <>
                      <div style={{ font: "500 11px 'Inter'", color: 'rgba(245,240,234,.4)', letterSpacing: '.04em', margin: '6px 0 8px' }}>OTHER MUSCLE GROUPS</div>
                      {sw.otherMuscleOptions.map((o: any, i: number) => <OptionRow key={i} o={o} />)}
                    </>
                  )}
                </>
              )}
            </>
          )}
        </div>

        <div style={{ padding: '12px 20px 20px', borderTop: '1px solid rgba(255,255,255,.08)' }}>
          <button onClick={sw.confirm} disabled={sw.confirmDisabled} style={{ width: '100%', background: sw.confirmBg, color: '#0d0c0b', font: "700 14px 'Inter'", padding: 15, borderRadius: 14, border: 'none' }}>{sw.confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}
