import type { ViewModel } from '../../state/viewModel';

export function ExerciseHistoryModal({ vm }: { vm: ViewModel }) {
  const h = vm.exerciseHistoryModal as any;
  if (!h.open) return null;
  return (
    <div onClick={h.close} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.6)', zIndex: 32, display: 'flex', alignItems: 'flex-end' }}>
      <div onClick={e => e.stopPropagation()} style={{ background: '#17140f', borderRadius: '22px 22px 0 0', padding: '18px 20px 24px', width: '100%', maxHeight: '80%', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <div className="num" style={{ fontSize: 18, fontWeight: 700 }}>{h.name}</div>
          <button onClick={h.close} style={{ background: 'rgba(255,255,255,.08)', border: 'none', color: '#f5f0ea', width: 28, height: 28, borderRadius: '50%', fontSize: 13 }}>✕</button>
        </div>
        {h.empty && (
          <div style={{ padding: 16, borderRadius: 14, background: 'rgba(255,255,255,.04)', textAlign: 'center', font: "500 13px 'Inter'", color: 'rgba(245,240,234,.5)' }}>No history logged yet for this exercise.</div>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {h.entries.map((entry: any, i: number) => (
            <div key={i} style={{ background: 'rgba(255,255,255,.04)', borderRadius: 14, padding: '12px 14px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
                <div style={{ font: "600 13px 'Inter'" }}>{entry.date}</div>
                <div style={{ font: "500 11px 'Inter'", padding: '3px 9px', borderRadius: 100, background: 'rgba(255,255,255,.08)', color: 'rgba(245,240,234,.6)' }}>{entry.day}</div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {entry.sets.map((st: any, k: number) => (
                  <div key={k} style={{ display: 'flex', gap: 8, font: "400 12px 'Inter'", color: 'rgba(245,240,234,.7)' }}>
                    <span style={{ color: 'rgba(245,240,234,.4)', width: 44 }}>Set {st.num}</span>{st.text}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
