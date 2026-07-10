import type { ViewModel } from '../../state/viewModel';

export function WeekReviewModal({ vm }: { vm: ViewModel }) {
  const wr = vm.weekReview;
  if (!wr.open) return null;
  return (
    <div onClick={wr.close} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.6)', zIndex: 30, display: 'flex', alignItems: 'flex-end' }}>
      <div onClick={e => e.stopPropagation()} style={{ background: '#17140f', borderRadius: '22px 22px 0 0', padding: '18px 20px 22px', width: '100%', maxHeight: '80%', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {wr.selected != null && (
              <button onClick={wr.back} style={{ background: 'rgba(255,255,255,.08)', border: 'none', color: '#f5f0ea', width: 28, height: 28, borderRadius: '50%', fontSize: 14 }}>‹</button>
            )}
            <div className="num" style={{ fontSize: 18, fontWeight: 700 }}>{wr.selected != null ? wr.selectedLabel : 'Program History'}</div>
          </div>
          <button onClick={wr.close} style={{ background: 'rgba(255,255,255,.08)', border: 'none', color: '#f5f0ea', width: 28, height: 28, borderRadius: '50%', fontSize: 13 }}>✕</button>
        </div>

        {wr.selected == null ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {wr.weeks.map(w => (
              <button key={w.num} onClick={w.select} style={{ textAlign: 'left', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,255,255,.04)', border: 'none', borderRadius: 14, padding: '12px 14px', color: '#f5f0ea' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ font: "600 14px 'Inter'" }}>{w.label}</span>
                  {w.isCurrent && (
                    <span style={{ font: "600 9px 'Inter'", padding: '2px 7px', borderRadius: 100, background: 'oklch(0.7 0.15 145 / 0.15)', color: 'oklch(0.75 0.15 145)' }}>Current</span>
                  )}
                </div>
                <span style={{ font: "400 11px 'Inter'", color: 'rgba(245,240,234,.45)' }}>{w.sessionCount} session{w.sessionCount === 1 ? '' : 's'} ›</span>
              </button>
            ))}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {wr.sessions.length === 0 && (
              <div style={{ padding: 16, borderRadius: 14, background: 'rgba(255,255,255,.04)', textAlign: 'center', font: "500 13px 'Inter'", color: 'rgba(245,240,234,.5)' }}>No sessions logged for this week.</div>
            )}
            {wr.sessions.map(r => (
              <button key={r.id} onClick={r.open} style={{ textAlign: 'left', background: 'rgba(255,255,255,.04)', border: 'none', borderRadius: 14, padding: '12px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: '#f5f0ea' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <div style={{ font: "600 14px 'Inter'" }}>{r.day}</div>
                    <span style={{ font: "600 9px 'Inter'", padding: '2px 7px', borderRadius: 100, background: r.statusBg, color: r.statusColor }}>{r.statusText}</span>
                  </div>
                  <div style={{ font: "400 11px 'Inter'", color: 'rgba(245,240,234,.45)', marginTop: 2 }}>{r.date}</div>
                </div>
                {r.showVolume && (
                  <div style={{ textAlign: 'right' }}>
                    <div className="num" style={{ fontSize: 13, fontWeight: 700, color: 'oklch(0.72 0.17 35)' }}>{r.volume}</div>
                    <div style={{ font: "400 10px 'Inter'", color: 'rgba(245,240,234,.4)' }}>volume</div>
                  </div>
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
