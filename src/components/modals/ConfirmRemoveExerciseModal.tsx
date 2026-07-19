import type { ViewModel } from '../../state/viewModel';

// Guards the mid-workout "✕ Remove" action. Removing an exercise from a live session drops it from
// the day and discards anything already logged against it, with no undo — too destructive to sit
// one mis-tap away from the set-logging controls it lives next to.
export function ConfirmRemoveExerciseModal({ vm }: { vm: ViewModel }) {
  const c = vm.confirmRemoveExercise as any;
  if (!c.show) return null;
  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 45, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, background: 'rgba(6,6,5,.6)', backdropFilter: 'blur(2px)' }}>
      <div style={{ width: '100%', maxWidth: 330, background: 'linear-gradient(160deg, oklch(0.22 0.05 35), #14120f 75%)', border: '1px solid rgba(255,255,255,.12)', borderRadius: 22, padding: '24px 22px', boxShadow: '0 20px 50px rgba(0,0,0,.55)' }}>
        <div style={{ fontSize: 28, marginBottom: 10 }}>⚠️</div>
        <div style={{ font: "700 18px 'Inter'", color: '#f5f0ea', marginBottom: 6 }}>Remove {c.name}?</div>
        <div style={{ font: "400 13px/1.5 'Inter'", color: 'rgba(245,240,234,.6)', marginBottom: 20 }}>
          It’ll be dropped from today’s workout{c.loggedSets > 0
            ? <>, including the <span style={{ color: 'oklch(0.78 0.15 35)', fontWeight: 600 }}>{c.loggedSets} set{c.loggedSets === 1 ? '' : 's'}</span> you’ve already logged</>
            : ''}. This can’t be undone.
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <button onClick={c.confirm} style={{ width: '100%', background: 'oklch(0.65 0.19 35)', color: '#0d0c0b', font: "700 15px 'Inter'", padding: 15, borderRadius: 14, border: 'none' }}>Remove exercise</button>
          <button onClick={c.cancel} style={{ width: '100%', background: 'none', color: 'rgba(245,240,234,.65)', font: "600 14px 'Inter'", padding: 13, borderRadius: 14, border: '1px solid rgba(255,255,255,.15)' }}>Keep it</button>
        </div>
      </div>
    </div>
  );
}
