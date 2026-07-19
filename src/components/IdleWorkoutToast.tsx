import type { ViewModel } from '../state/viewModel';

// Shown when a workout has been open with no in-app interaction for the idle timeout (30 min). A
// deliberately blocking dialog rather than a dismissible toast: it's a decision (are you still
// training, or did you walk off and leave it running?) that we want an explicit answer to, so the
// elapsed timer and any pending session don't quietly keep accumulating.
export function IdleWorkoutToast({ vm }: { vm: ViewModel }) {
  const p = vm.idlePrompt;
  if (!p.show) return null;
  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, background: 'rgba(6,6,5,.6)', backdropFilter: 'blur(2px)' }}>
      <div style={{ width: '100%', maxWidth: 340, background: 'linear-gradient(160deg, oklch(0.22 0.05 35), #14120f 75%)', border: '1px solid rgba(255,255,255,.12)', borderRadius: 22, padding: '24px 22px', boxShadow: '0 20px 50px rgba(0,0,0,.55)' }}>
        <div style={{ fontSize: 30, marginBottom: 10 }}>⏳</div>
        <div style={{ font: "700 19px 'Inter'", color: '#f5f0ea', marginBottom: 6 }}>Still working out?</div>
        <div style={{ font: "400 13px/1.5 'Inter'", color: 'rgba(245,240,234,.6)', marginBottom: 20 }}>
          Your workout has been running for {p.elapsedText} with no activity for a while{p.exerciseName ? <>, currently on <span style={{ color: 'rgba(245,240,234,.85)', fontWeight: 600 }}>{p.exerciseName}</span></> : ''}.
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <button onClick={p.continueWorkout} style={{ width: '100%', background: 'oklch(0.65 0.19 35)', color: '#0d0c0b', font: "700 15px 'Inter'", padding: 15, borderRadius: 14, border: 'none' }}>Continue workout</button>
          <button onClick={p.endWorkout} style={{ width: '100%', background: 'none', color: 'rgba(245,240,234,.65)', font: "600 14px 'Inter'", padding: 13, borderRadius: 14, border: '1px solid rgba(255,255,255,.15)' }}>End workout</button>
        </div>
      </div>
    </div>
  );
}
