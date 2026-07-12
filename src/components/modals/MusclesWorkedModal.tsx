import type { ViewModel } from '../../state/viewModel';
import { BodyDiagram } from '../BodyDiagram';

export function MusclesWorkedModal({ vm }: { vm: ViewModel }) {
  if (!vm.showBodyModal || !vm.currentDay) return null;
  const isFront = vm.bodyView === 'front';
  return (
    <div onClick={vm.closeBodyModal} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.6)', zIndex: 30, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div onClick={e => e.stopPropagation()} style={{ background: '#17140f', borderRadius: 22, padding: '18px 18px 20px', width: 240 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <div style={{ font: "500 11px 'Inter'", color: 'rgba(245,240,234,.4)', letterSpacing: '.04em' }}>MUSCLES WORKED</div>
          <button onClick={vm.closeBodyModal} style={{ background: 'rgba(255,255,255,.08)', border: 'none', color: '#f5f0ea', width: 26, height: 26, borderRadius: '50%', fontSize: 12 }}>✕</button>
        </div>
        <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
          <button onClick={() => vm.setBodyView('front')} style={{ flex: 1, font: "600 10px 'Inter'", padding: '6px 0', borderRadius: 100, border: 'none', background: isFront ? 'oklch(0.65 0.19 35)' : 'rgba(255,255,255,.06)', color: isFront ? '#0d0c0b' : 'rgba(245,240,234,.6)' }}>Front</button>
          <button onClick={() => vm.setBodyView('back')} style={{ flex: 1, font: "600 10px 'Inter'", padding: '6px 0', borderRadius: 100, border: 'none', background: !isFront ? 'oklch(0.65 0.19 35)' : 'rgba(255,255,255,.06)', color: !isFront ? '#0d0c0b' : 'rgba(245,240,234,.6)' }}>Back</button>
        </div>
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <BodyDiagram view={vm.bodyView} ranks={vm.currentDay.diagramRanks} width={200} height={404} />
        </div>
      </div>
    </div>
  );
}
