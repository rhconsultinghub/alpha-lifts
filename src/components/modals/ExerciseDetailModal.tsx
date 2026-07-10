import type { ViewModel } from '../../state/viewModel';
import { ExercisePhoto } from '../ExercisePhoto';

export function ExerciseDetailModal({ vm }: { vm: ViewModel }) {
  const d = vm.detail;
  if (!d.open) return null;
  return (
    <div style={{ position: 'absolute', inset: 0, background: '#0f0e0d', zIndex: 20, overflowY: 'auto' }} className="scr">
      <div style={{ padding: '18px 20px 40px' }}>
        <button onClick={d.close} style={{ background: 'rgba(255,255,255,.08)', border: 'none', color: '#f5f0ea', width: 30, height: 30, borderRadius: '50%', fontSize: 14, marginBottom: 16 }}>✕</button>
        <div style={{ width: '100%', height: 180, borderRadius: 18, marginBottom: 16, overflow: 'hidden' }}>
          <ExercisePhoto pattern={d.pattern} size={180} radius={18} />
        </div>
        <div className="num" style={{ fontSize: 24, fontWeight: 700 }}>{d.name}</div>
        <div style={{ display: 'flex', gap: 6, margin: '10px 0 16px' }}>
          <span style={{ font: "600 11px 'Inter'", padding: '5px 10px', borderRadius: 100, background: 'rgba(255,255,255,.08)' }}>{d.equipLabel}</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16, background: 'rgba(255,255,255,.03)', borderRadius: 12, padding: '10px 12px' }}>
          <div style={{ font: "400 12px 'Inter'", color: 'rgba(245,240,234,.55)' }}><span style={{ color: 'rgba(245,240,234,.8)', fontWeight: 600 }}>Primary:</span> {d.muscle}</div>
          <div style={{ font: "400 12px 'Inter'", color: 'rgba(245,240,234,.55)' }}><span style={{ color: 'rgba(245,240,234,.8)', fontWeight: 600 }}>Secondary:</span> {d.secondaryText}</div>
        </div>

        <div style={{ font: "500 11px 'Inter'", color: 'rgba(245,240,234,.4)', letterSpacing: '.04em', marginBottom: 6 }}>HOW TO</div>
        <div style={{ font: "400 14px/1.6 'Inter'", color: 'rgba(245,240,234,.8)', marginBottom: 24 }}>{d.cue}</div>

        <button onClick={d.openSwap} style={{ width: '100%', background: 'none', border: '1px solid rgba(255,255,255,.2)', color: '#f5f0ea', font: "600 13px 'Inter'", padding: 14, borderRadius: 14 }}>⇄ Swap this exercise</button>
      </div>
    </div>
  );
}
