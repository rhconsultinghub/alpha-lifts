import type { ViewModel } from '../../state/viewModel';

export function ArchiveDetailModal({ vm }: { vm: ViewModel }) {
  const d = vm.archiveDetail as any;
  if (!d.open) return null;
  return (
    <div onClick={d.close} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.6)', zIndex: 33, display: 'flex', alignItems: 'flex-end' }}>
      <div onClick={e => e.stopPropagation()} style={{ background: '#17140f', borderRadius: '22px 22px 0 0', padding: '18px 20px 24px', width: '100%', maxHeight: '80%', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
          <div className="num" style={{ fontSize: 18, fontWeight: 700 }}>{d.day}</div>
          <button onClick={d.close} style={{ background: 'rgba(255,255,255,.08)', border: 'none', color: '#f5f0ea', width: 28, height: 28, borderRadius: '50%', fontSize: 13 }}>✕</button>
        </div>
        <div style={{ font: "400 12px 'Inter'", color: 'rgba(245,240,234,.45)', marginBottom: 14 }}>{d.date} · {d.weekLabel}</div>
        {d.isSkipped ? (
          <div style={{ padding: 16, borderRadius: 14, background: 'rgba(255,255,255,.04)', textAlign: 'center', font: "500 13px 'Inter'", color: 'rgba(245,240,234,.5)' }}>This day was skipped, no exercises logged.</div>
        ) : (
          <>
            <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
              <div style={{ flex: 1, background: 'rgba(255,255,255,.04)', borderRadius: 12, padding: 10, textAlign: 'center' }}>
                <div className="num" style={{ fontSize: 15, fontWeight: 700, color: 'oklch(0.72 0.17 35)' }}>{d.volume}</div>
                <div style={{ font: "400 10px 'Inter'", color: 'rgba(245,240,234,.4)' }}>volume</div>
              </div>
              <div style={{ flex: 1, background: 'rgba(255,255,255,.04)', borderRadius: 12, padding: 10, textAlign: 'center' }}>
                <div className="num" style={{ fontSize: 15, fontWeight: 700 }}>{d.durationText}</div>
                <div style={{ font: "400 10px 'Inter'", color: 'rgba(245,240,234,.4)' }}>duration</div>
              </div>
            </div>
            {d.exercises.length === 0 ? (
              <div style={{ padding: 16, borderRadius: 14, background: 'rgba(255,255,255,.04)', textAlign: 'center', font: "500 13px 'Inter'", color: 'rgba(245,240,234,.5)' }}>No per-exercise detail logged for this session.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {d.exercises.map((ex: any, i: number) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,255,255,.04)', borderRadius: 12, padding: '10px 12px' }}>
                    <div>
                      <div style={{ font: "600 13px 'Inter'" }}>{ex.name}</div>
                      <div style={{ font: "400 11px 'Inter'", color: 'rgba(245,240,234,.45)', marginTop: 2 }}>{ex.resultText}</div>
                    </div>
                    <span style={{ font: "600 10px 'Inter'", padding: '4px 9px', borderRadius: 100, background: ex.badgeBg, color: ex.badgeColor }}>{ex.badgeText}</span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
