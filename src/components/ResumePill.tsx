import type { ViewModel } from '../state/viewModel';

export function ResumePill({ vm }: { vm: ViewModel }) {
  if (!vm.showResume) return null;
  return (
    <div style={{ position: 'absolute', left: 16, right: 16, bottom: 86, zIndex: 15 }}>
      <button onClick={vm.resumeWorkout} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, background: 'oklch(0.65 0.19 35)', border: 'none', color: '#0d0c0b', font: "700 12px 'Inter'", padding: '12px 16px', borderRadius: 100, boxShadow: '0 8px 24px rgba(0,0,0,.4)' }}>
        <span style={{ fontSize: 14 }}>▶</span>
        <span style={{ flex: 1, textAlign: 'left' }}>{vm.resumeText}</span>
        <span className="num" style={{ fontWeight: 700 }}>{vm.resumeElapsedText}</span>
      </button>
    </div>
  );
}
