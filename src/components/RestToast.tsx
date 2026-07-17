import type { ViewModel } from '../state/viewModel';

// Persistent, always-on-top rest countdown. The big in-page rest card in WorkoutScreen already
// shows this, but it's hidden behind any modal (exercise history, swap, etc. all render as
// full-screen overlays) — this floats above everything (including modals) so the live countdown
// stays visible no matter what the user is doing mid-rest, updating every second while the app is
// foregrounded (see alerts.ts/useApp.ts for the best-effort background/minimized equivalent).
export function RestToast({ vm }: { vm: ViewModel }) {
  const w = vm.workout;
  if (!w || !w.resting) return null;
  return (
    <div style={{ position: 'absolute', left: 16, right: 16, top: 12, zIndex: 30, pointerEvents: 'none' }}>
      <div style={{ pointerEvents: 'auto', display: 'flex', alignItems: 'center', gap: 10, background: 'rgba(15,14,13,.94)', backdropFilter: 'blur(10px)', border: '1px solid oklch(0.65 0.19 35 / 0.4)', borderRadius: 100, padding: '8px 8px 8px 14px', boxShadow: '0 8px 24px rgba(0,0,0,.45)' }}>
        <span style={{ fontSize: 13 }}>⏱</span>
        <span style={{ font: "500 12px 'Inter'", color: 'rgba(245,240,234,.65)', flex: 'none' }}>Resting</span>
        <div style={{ flex: 1, height: 4, borderRadius: 3, background: 'rgba(255,255,255,.1)', overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${w.restPct}%`, background: 'oklch(0.65 0.19 35)' }} />
        </div>
        <span className="num" style={{ fontSize: 14, fontWeight: 700, color: 'oklch(0.78 0.15 35)', flex: 'none' }}>{w.restText}</span>
        <button onClick={w.restSkip} style={{ flex: 'none', font: "700 11px 'Inter'", padding: '6px 10px', borderRadius: 100, border: 'none', background: 'rgba(255,255,255,.1)', color: 'rgba(245,240,234,.8)' }}>Skip</button>
      </div>
    </div>
  );
}
