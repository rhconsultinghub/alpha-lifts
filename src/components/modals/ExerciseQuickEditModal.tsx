import type { ViewModel } from '../../state/viewModel';
import { SetTimeControl } from '../SetTimeControl';

// Day View's tap-to-edit modal — lets the user directly correct the plan's working weight/reps
// (via a manualTarget override, since the day slot's own `last` is normally outranked by cross-
// day exerciseHistory — see effectiveLast() in logic.ts) plus sets/equipment, without having to
// enter the full Day Builder just to nudge one exercise. Separate from ExerciseDetailModal, which
// stays reachable via the exercise photo and shows read-only info/how-to/video instead.
export function ExerciseQuickEditModal({ vm }: { vm: ViewModel }) {
  const q = vm.quickEdit as any;
  if (!q.open) return null;
  return (
    <div style={{ position: 'absolute', inset: 0, background: '#0f0e0d', zIndex: 20, overflowY: 'auto' }} className="scr">
      <div style={{ padding: '18px 20px 40px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
          <button onClick={q.close} style={{ background: 'rgba(255,255,255,.08)', border: 'none', color: '#f5f0ea', width: 30, height: 30, borderRadius: '50%', fontSize: 14 }}>✕</button>
          <button onClick={q.openInfo} style={{ background: 'none', border: 'none', color: 'rgba(245,240,234,.5)', font: "500 12px 'Inter'" }}>ℹ️ Info</button>
        </div>

        <div className="num" style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>{q.name}</div>
        <div style={{ font: "500 12px 'Inter'", color: 'rgba(245,240,234,.4)', marginBottom: 22 }}>{q.muscle}</div>

        <div style={{ font: "500 10px 'Inter'", color: 'rgba(245,240,234,.4)', letterSpacing: '.04em', marginBottom: 10 }}>SETS</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'rgba(255,255,255,.06)', borderRadius: 14, padding: 8, marginBottom: 22 }}>
          <button onClick={q.decSets} style={{ width: 40, height: 40, flex: 'none', borderRadius: 10, border: 'none', background: 'rgba(255,255,255,.1)', color: '#f5f0ea', fontSize: 18 }}>–</button>
          <div className="num" style={{ flex: 1, textAlign: 'center', fontSize: 18, fontWeight: 700 }}>{q.sets} sets</div>
          <button onClick={q.incSets} style={{ width: 40, height: 40, flex: 'none', borderRadius: 10, border: 'none', background: 'rgba(255,255,255,.1)', color: '#f5f0ea', fontSize: 18 }}>+</button>
        </div>

        {!q.isBodyweight && (
          <>
            <div style={{ font: "500 10px 'Inter'", color: 'rgba(245,240,234,.4)', letterSpacing: '.04em', marginBottom: 10 }}>WORKING WEIGHT ({q.unitsLabel})</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'rgba(255,255,255,.06)', borderRadius: 14, padding: 8, marginBottom: q.platesText ? 4 : 22 }}>
              <button onClick={q.decWeight} style={{ width: 40, height: 40, flex: 'none', borderRadius: 10, border: 'none', background: 'rgba(255,255,255,.1)', color: '#f5f0ea', fontSize: 18 }}>–</button>
              <input type="number" value={q.weight} onChange={(e: any) => q.setWeight(parseFloat(e.target.value) || 0)} style={{ flex: 1, textAlign: 'center', fontSize: 18 }} />
              <button onClick={q.incWeight} style={{ width: 40, height: 40, flex: 'none', borderRadius: 10, border: 'none', background: 'rgba(255,255,255,.1)', color: '#f5f0ea', fontSize: 18 }}>+</button>
            </div>
            {q.platesText && (
              <div style={{ font: "500 11px 'Inter'", color: 'rgba(245,240,234,.4)', marginBottom: 22 }}>🏋 {q.platesText}</div>
            )}
          </>
        )}

        <div style={{ font: "500 10px 'Inter'", color: 'rgba(245,240,234,.4)', letterSpacing: '.04em', marginBottom: 10 }}>{q.isTime ? 'TIME (SEC)' : 'REPS'}</div>
        {q.isTime ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 22 }}>
            <SetTimeControl seconds={q.reps} onCapture={(sec: number) => q.setReps(sec)} />
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
              <button onClick={q.decReps} style={{ width: 30, height: 30, flex: 'none', borderRadius: 8, border: 'none', background: 'rgba(255,255,255,.08)', color: 'rgba(245,240,234,.7)', fontSize: 14 }}>–</button>
              <span style={{ font: "500 11px 'Inter'", color: 'rgba(245,240,234,.4)' }}>adjust 5s</span>
              <button onClick={q.incReps} style={{ width: 30, height: 30, flex: 'none', borderRadius: 8, border: 'none', background: 'rgba(255,255,255,.08)', color: 'rgba(245,240,234,.7)', fontSize: 14 }}>+</button>
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'rgba(255,255,255,.06)', borderRadius: 14, padding: 8, marginBottom: 22 }}>
            <button onClick={q.decReps} style={{ width: 40, height: 40, flex: 'none', borderRadius: 10, border: 'none', background: 'rgba(255,255,255,.1)', color: '#f5f0ea', fontSize: 18 }}>–</button>
            <input type="number" value={q.reps} onChange={(e: any) => q.setReps(parseInt(e.target.value) || 0)} style={{ flex: 1, textAlign: 'center', fontSize: 18 }} />
            <button onClick={q.incReps} style={{ width: 40, height: 40, flex: 'none', borderRadius: 10, border: 'none', background: 'rgba(255,255,255,.1)', color: '#f5f0ea', fontSize: 18 }}>+</button>
          </div>
        )}

        <button onClick={q.openEquip} style={{ width: '100%', background: 'none', border: '1px solid rgba(255,255,255,.2)', color: '#f5f0ea', font: "600 13px 'Inter'", padding: 14, borderRadius: 14 }}>{q.equipLabel} — change equipment ▾</button>
      </div>
    </div>
  );
}
