import type { ViewModel } from '../../state/viewModel';
import { Sheet } from '../Sheet';

export function MuscleDrillModal({ vm }: { vm: ViewModel }) {
  const md = vm.muscleDrill;
  if (!md.open) return null;
  return (
    <Sheet dim={0.6} radius={22} maxHeight="80%" padding="18px 20px calc(22px + var(--safe-b))" scrollY onClose={vm.closeMuscleDrill}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
          <div className="num" style={{ fontSize: 18, fontWeight: 700 }}>{md.name}</div>
          <button aria-label="Close" onClick={vm.closeMuscleDrill} style={{ background: 'rgba(255,255,255,.08)', border: 'none', color: '#f5f0ea', width: 28, height: 28, borderRadius: '50%', fontSize: 13 }}>✕</button>
        </div>
        <div className="num" style={{ fontSize: 13, fontWeight: 700, color: md.color, marginBottom: 14 }}>{md.setsText} sets/week · range {md.rangeText} · {md.statusLabel}</div>
        {md.alsoTargets.length > 0 && (
          <>
            <div style={{ font: "500 11px 'Inter'", color: 'rgba(245,240,234,.4)', letterSpacing: '.04em', marginBottom: 8 }}>MUSCLES TARGETED</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 16 }}>
              <span style={{ font: "600 11px 'Inter'", padding: '5px 10px', borderRadius: 100, background: 'oklch(0.65 0.19 35)', color: '#0d0c0b' }}>{md.name} · primary</span>
              {md.alsoTargets.map((m: string, i: number) => (
                <span key={i} style={{ font: "600 11px 'Inter'", padding: '5px 10px', borderRadius: 100, background: 'rgba(255,255,255,.08)', color: 'rgba(245,240,234,.75)' }}>{m}</span>
              ))}
            </div>
          </>
        )}
        <div style={{ font: "500 11px 'Inter'", color: 'rgba(245,240,234,.4)', letterSpacing: '.04em', marginBottom: 8 }}>CONTRIBUTING EXERCISES</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 18 }}>
          {md.rows.map((r, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,255,255,.04)', borderRadius: 12, padding: '10px 12px' }}>
              <div>
                <div style={{ font: "600 13px 'Inter'" }}>{r.name}</div>
                <div style={{ font: "400 11px 'Inter'", color: 'rgba(245,240,234,.45)', marginTop: 2 }}>{r.day} · {r.equip}</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ font: "600 11px 'Inter'", padding: '5px 10px', borderRadius: 100, background: 'rgba(255,255,255,.08)' }}>{r.sets} sets</div>
                <button onClick={r.switchExercise} style={{ font: "600 11px 'Inter'", padding: '6px 10px', borderRadius: 100, border: 'none', background: 'oklch(0.65 0.19 35 / 0.15)', color: 'oklch(0.75 0.17 35)' }}>⇄ Switch</button>
              </div>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8, padding: '12px 14px', borderRadius: 14, background: 'oklch(0.7 0.13 230 / 0.1)', border: '1px solid oklch(0.7 0.13 230 / 0.35)' }}>
          <span style={{ fontSize: 15 }}>💡</span>
          <div style={{ font: "400 12px/1.4 'Inter'", color: 'rgba(245,240,234,.8)' }}>{md.rec}</div>
        </div>
    </Sheet>
  );
}
