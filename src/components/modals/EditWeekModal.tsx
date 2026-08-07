import type { ViewModel } from '../../state/viewModel';

/**
 * Permanent edits to the week's shape on the ACTIVE program: which days exist, what each is
 * called, training vs. rest, and their order. Distinct from the Skip button on Day View, which
 * only marks a day as not-happening for the current week.
 *
 * Deliberately the same controls as the New Program wizard's custom-split editor — that flow can
 * only build a brand-new program (it mints a new id and resets the week counter), so this is the
 * in-place equivalent. Turning a day to rest keeps its exercises, so it's fully reversible; only
 * deleting a day discards anything, and that's confirm-gated.
 */
export function EditWeekModal({ vm }: { vm: ViewModel }) {
  const w = vm.editWeek;
  if (!w.open) return null;
  return (
    <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.55)', zIndex: 30, display: 'flex', alignItems: 'flex-end' }} onClick={w.close}>
      <div onClick={e => e.stopPropagation()} style={{ background: '#17140f', borderRadius: '22px 22px 0 0', width: '100%', maxHeight: '86%', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '18px 20px 6px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div className="num" style={{ fontSize: 17, fontWeight: 700 }}>Edit Week</div>
          <button aria-label="Close" onClick={w.close} style={{ background: 'rgba(255,255,255,.08)', border: 'none', color: '#f5f0ea', width: 28, height: 28, borderRadius: '50%', fontSize: 13 }}>✕</button>
        </div>
        <div style={{ padding: '0 20px 10px', font: "400 11px/1.5 'Inter'", color: 'rgba(245,240,234,.4)' }}>{w.note}</div>

        <div style={{ overflowY: 'auto', flex: 1, padding: '4px 20px calc(20px + var(--safe-b))' }}>
          {w.rows.map((d) => (
            <div key={d.key} style={{ background: 'rgba(255,255,255,.04)', borderRadius: 14, padding: 12, marginBottom: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 34, flex: 'none', font: "600 10px 'Inter'", color: 'rgba(245,240,234,.4)' }}>{d.dow.slice(0, 3)}</div>
                <input
                  value={d.label}
                  onChange={e => d.setLabel(e.target.value)}
                  style={{ flex: 1, minWidth: 0, background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.1)', borderRadius: 10, padding: '8px 10px', color: '#f5f0ea', font: "600 13px 'Inter'" }}
                />
                <button aria-label="Move up" onClick={d.moveUp} disabled={!d.canMoveUp} style={{ flex: 'none', width: 24, height: 24, borderRadius: '50%', border: 'none', background: 'rgba(255,255,255,.08)', color: d.canMoveUp ? 'rgba(245,240,234,.75)' : 'rgba(245,240,234,.25)', fontSize: 12 }}>↑</button>
                <button aria-label="Move down" onClick={d.moveDown} disabled={!d.canMoveDown} style={{ flex: 'none', width: 24, height: 24, borderRadius: '50%', border: 'none', background: 'rgba(255,255,255,.08)', color: d.canMoveDown ? 'rgba(245,240,234,.75)' : 'rgba(245,240,234,.25)', fontSize: 12 }}>↓</button>
                {d.canRemove && (
                  <button aria-label="Close" onClick={d.remove} style={{ flex: 'none', width: 24, height: 24, borderRadius: '50%', border: 'none', background: 'rgba(255,255,255,.08)', color: 'rgba(245,240,234,.6)', fontSize: 12 }}>✕</button>
                )}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10 }}>
                <button onClick={d.setTraining} style={{ font: "600 11px 'Inter'", padding: '6px 14px', borderRadius: 100, border: 'none', background: d.trainingBg, color: d.trainingColor }}>Training</button>
                <button onClick={d.setRest} style={{ font: "600 11px 'Inter'", padding: '6px 14px', borderRadius: 100, border: 'none', background: d.restBg, color: d.restColor }}>Rest</button>
                <div style={{ flex: 1, textAlign: 'right', font: "500 10px 'Inter'", color: 'rgba(245,240,234,.35)' }}>
                  {d.keptNote || d.subtitle}
                </div>
              </div>
            </div>
          ))}
          {w.canAddDay ? (
            <button onClick={w.addDay} style={{ width: '100%', marginTop: 2, background: 'none', border: '1px dashed rgba(255,255,255,.25)', color: 'rgba(245,240,234,.7)', font: "600 13px 'Inter'", padding: 14, borderRadius: 14 }}>+ Add Day</button>
          ) : (
            <div style={{ font: "400 11px/1.5 'Inter'", color: 'rgba(245,240,234,.35)', textAlign: 'center', padding: '8px 4px' }}>{w.fullNote}</div>
          )}
        </div>
      </div>

      {/* Deleting a day is the only destructive action here, so it gets the same blocking confirm
          as removing a mid-workout exercise. */}
      {w.confirmRemove.show && (
        <div onClick={e => e.stopPropagation()} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.6)', zIndex: 45, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ width: '100%', maxWidth: 330, background: 'linear-gradient(160deg, oklch(0.22 0.05 35), #14120f 75%)', border: '1px solid rgba(255,255,255,.12)', borderRadius: 22, padding: '24px 22px', boxShadow: '0 20px 50px rgba(0,0,0,.55)' }}>
            <div style={{ fontSize: 26, marginBottom: 10 }}>⚠️</div>
            <div className="num" style={{ fontSize: 19, fontWeight: 700, marginBottom: 8 }}>Delete {w.confirmRemove.label}?</div>
            <div style={{ font: "400 13px/1.5 'Inter'", color: 'rgba(245,240,234,.6)', marginBottom: 18 }}>
              {(w.confirmRemove.exCount ?? 0) > 0
                ? `This removes the day and its ${w.confirmRemove.exCount} exercise${w.confirmRemove.exCount === 1 ? '' : 's'} from your plan. To keep them, make it a rest day instead.`
                : 'This removes the day from your plan.'}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <button onClick={w.confirmRemove.confirm} style={{ width: '100%', background: 'oklch(0.65 0.19 35)', border: 'none', color: '#0d0c0b', font: "700 13px 'Inter'", padding: 13, borderRadius: 14 }}>Delete day</button>
              <button onClick={w.confirmRemove.cancel} style={{ width: '100%', background: 'none', border: '1px solid rgba(255,255,255,.18)', color: 'rgba(245,240,234,.75)', font: "600 13px 'Inter'", padding: 13, borderRadius: 14 }}>Keep it</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
