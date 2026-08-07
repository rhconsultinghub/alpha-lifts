import type { ViewModel } from '../../state/viewModel';
import { Sheet } from '../Sheet';

export function ExerciseHistoryModal({ vm }: { vm: ViewModel }) {
  const h = vm.exerciseHistoryModal;
  if (!h.open) return null;
  return (
    <Sheet z={32} dim={0.6} radius={22} maxHeight="80%" padding="18px 20px calc(24px + var(--safe-b))" scrollY onClose={h.close}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <div className="num" style={{ fontSize: 18, fontWeight: 700 }}>{h.name}</div>
          <button aria-label="Close" onClick={h.close} style={{ background: 'rgba(255,255,255,.08)', border: 'none', color: '#f5f0ea', width: 28, height: 28, borderRadius: '50%', fontSize: 13 }}>✕</button>
        </div>
        {h.empty && (
          <div style={{ padding: 16, borderRadius: 14, background: 'rgba(255,255,255,.04)', textAlign: 'center', font: "500 13px 'Inter'", color: 'rgba(245,240,234,.5)' }}>No history logged yet for this exercise.</div>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {h.entries.map((entry, i) => (
            <div key={i} style={{ background: 'rgba(255,255,255,.04)', borderRadius: 14, padding: '12px 14px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
                <div style={{ font: "600 13px 'Inter'" }}>{entry.date}</div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'baseline' }}>
                  {entry.equipLabel && <div style={{ font: "500 11px 'Inter'", padding: '3px 9px', borderRadius: 100, background: 'oklch(0.65 0.19 35 / 0.16)', color: 'oklch(0.78 0.16 35)' }}>{entry.equipLabel}</div>}
                  <div style={{ font: "500 11px 'Inter'", padding: '3px 9px', borderRadius: 100, background: 'rgba(255,255,255,.08)', color: 'rgba(245,240,234,.6)' }}>{entry.day}</div>
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {entry.sets.map((st, k) => (
                  <div key={k} style={{ display: 'flex', gap: 8, font: "400 12px 'Inter'", color: 'rgba(245,240,234,.7)' }}>
                    <span style={{ color: 'rgba(245,240,234,.4)', width: 44 }}>Set {st.num}</span>{st.text}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
    </Sheet>
  );
}
