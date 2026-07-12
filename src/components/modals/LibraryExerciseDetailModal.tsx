import type { ViewModel } from '../../state/viewModel';
import { ExercisePhoto } from '../ExercisePhoto';
import { VideoEmbed } from '../VideoEmbed';

export function LibraryExerciseDetailModal({ vm }: { vm: ViewModel }) {
  const d = vm.libraryDetail as any;
  if (!d.open) return null;
  return (
    <div style={{ position: 'absolute', inset: 0, background: '#0f0e0d', zIndex: 20, overflowY: 'auto' }} className="scr">
      <div style={{ padding: '18px 20px 40px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <button onClick={d.close} style={{ background: 'rgba(255,255,255,.08)', border: 'none', color: '#f5f0ea', width: 30, height: 30, borderRadius: '50%', fontSize: 14 }}>✕</button>
          {d.isCustom && (
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={d.edit} style={{ font: "600 11px 'Inter'", padding: '7px 12px', borderRadius: 100, border: '1px solid rgba(255,255,255,.2)', background: 'none', color: 'rgba(245,240,234,.75)' }}>Edit</button>
              <button onClick={d.delete} style={{ font: "600 11px 'Inter'", padding: '7px 12px', borderRadius: 100, border: 'none', background: 'none', color: d.deleteColor }}>{d.deleteLabel}</button>
            </div>
          )}
        </div>
        <div style={{ width: '100%', height: 180, borderRadius: 18, marginBottom: 16, overflow: 'hidden' }}>
          <ExercisePhoto id={d.id} pattern={d.pattern} size={180} radius={18} />
        </div>
        <div className="num" style={{ fontSize: 24, fontWeight: 700 }}>{d.name}</div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '10px 0 16px' }}>
          {d.equipChips.map((e: any, i: number) => (
            <span key={i} style={{ font: "600 11px 'Inter'", padding: '5px 10px', borderRadius: 100, background: 'rgba(255,255,255,.08)' }}>{e.label}</span>
          ))}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16, background: 'rgba(255,255,255,.03)', borderRadius: 12, padding: '10px 12px' }}>
          <div style={{ font: "400 12px 'Inter'", color: 'rgba(245,240,234,.55)' }}><span style={{ color: 'rgba(245,240,234,.8)', fontWeight: 600 }}>Primary:</span> {d.muscle}</div>
          <div style={{ font: "400 12px 'Inter'", color: 'rgba(245,240,234,.55)' }}><span style={{ color: 'rgba(245,240,234,.8)', fontWeight: 600 }}>Secondary:</span> {d.secondaryText}</div>
          <div style={{ font: "400 12px 'Inter'", color: 'rgba(245,240,234,.55)' }}><span style={{ color: 'rgba(245,240,234,.8)', fontWeight: 600 }}>Rest between sets:</span> {d.restText}</div>
          <div style={{ font: "400 12px 'Inter'", color: 'rgba(245,240,234,.55)' }}><span style={{ color: 'rgba(245,240,234,.8)', fontWeight: 600 }}>Rep range:</span> {d.repText}</div>
          <div style={{ font: "400 12px 'Inter'", color: 'rgba(245,240,234,.55)' }}><span style={{ color: 'rgba(245,240,234,.8)', fontWeight: 600 }}>Type:</span> {d.typeText}</div>
        </div>
        <div style={{ font: "500 11px 'Inter'", color: 'rgba(245,240,234,.4)', letterSpacing: '.04em', marginBottom: 6 }}>HOW TO</div>
        <div style={{ font: "400 14px/1.6 'Inter'", color: 'rgba(245,240,234,.8)', marginBottom: d.videoId ? 16 : 0 }}>{d.cue}</div>

        {d.videoId && <VideoEmbed videoId={d.videoId} title={d.name + ' tutorial'} />}
      </div>
    </div>
  );
}
