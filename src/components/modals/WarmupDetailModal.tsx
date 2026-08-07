import type { ViewModel } from '../../state/viewModel';
import { VideoEmbed } from '../VideoEmbed';
import { Sheet } from '../Sheet';

export function WarmupDetailModal({ vm }: { vm: ViewModel }) {
  const wd = vm.warmupDetail;
  if (!wd.open) return null;
  return (
    <Sheet dim={0.6} radius={22} maxHeight="85%" padding="18px 20px calc(28px + var(--safe-b))" scrollY onClose={wd.close}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
          <div className="num" style={{ fontSize: 18, fontWeight: 700 }}>{wd.name}</div>
          <button aria-label="Close" onClick={wd.close} style={{ background: 'rgba(255,255,255,.08)', border: 'none', color: '#f5f0ea', width: 28, height: 28, borderRadius: '50%', fontSize: 13 }}>✕</button>
        </div>
        <div style={{ font: "600 11px 'Inter'", color: 'oklch(0.72 0.17 35)', marginBottom: 14 }}>{wd.cue}</div>

        <div style={{ font: "500 11px 'Inter'", color: 'rgba(245,240,234,.4)', letterSpacing: '.04em', marginBottom: 6 }}>HOW TO</div>
        <div style={{ font: "400 14px/1.6 'Inter'", color: 'rgba(245,240,234,.8)', marginBottom: wd.videoId ? 16 : 0 }}>{wd.howTo}</div>

        {wd.videoId && <VideoEmbed videoId={wd.videoId} title={wd.name + ' tutorial'} />}
    </Sheet>
  );
}
