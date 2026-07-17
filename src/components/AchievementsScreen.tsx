import { useEffect } from 'react';
import type { ViewModel } from '../state/viewModel';

export function AchievementsScreen({ vm }: { vm: ViewModel }) {
  const a = vm.achievements as any;

  // Marks currently-unlocked achievements as "seen" once this screen has actually rendered (and
  // shown any NEW badges) rather than bundling it into the nav action itself — doing it on
  // navigation would clear the NEW state before the user ever saw it, since both updates would
  // land in the same render pass.
  useEffect(() => {
    a.markSeen();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div style={{ padding: '24px 20px 100px' }}>
      <div className="num" style={{ fontSize: 30, fontWeight: 700, marginBottom: 4 }}>Achievements</div>
      <div style={{ font: "400 12px 'Inter'", color: 'rgba(245,240,234,.45)', marginBottom: 22 }}>Badges earned from your real training history.</div>

      <div style={{ background: 'linear-gradient(160deg, oklch(0.22 0.05 35), #17140f 70%)', borderRadius: 20, padding: '20px 18px', marginBottom: 26, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div className="num" style={{ fontSize: 34, fontWeight: 700, color: 'oklch(0.78 0.15 35)' }}>{a.totalPoints}</div>
          <div style={{ font: "500 11px 'Inter'", color: 'rgba(245,240,234,.5)' }}>of {a.totalPossiblePoints} points</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div className="num" style={{ fontSize: 20, fontWeight: 700 }}>{a.unlockedCount}/{a.totalCount}</div>
          <div style={{ font: "500 11px 'Inter'", color: 'rgba(245,240,234,.5)' }}>badges unlocked</div>
        </div>
      </div>

      {a.categories.map((cat: any) => (
        <div key={cat.key} style={{ marginBottom: 24 }}>
          <div style={{ font: "500 11px 'Inter'", color: 'rgba(245,240,234,.4)', letterSpacing: '.04em', marginBottom: 10 }}>{cat.label.toUpperCase()}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {cat.items.map((it: any) => (
              <div key={it.id} style={{
                display: 'flex', gap: 12, alignItems: 'center', padding: '12px 14px', borderRadius: 16,
                background: it.unlocked ? 'oklch(0.65 0.19 35 / 0.1)' : 'rgba(255,255,255,.03)',
                border: it.unlocked ? '1px solid oklch(0.65 0.19 35 / 0.35)' : '1px solid rgba(255,255,255,.06)'
              }}>
                <div style={{
                  flex: 'none', width: 42, height: 42, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20,
                  background: it.unlocked ? 'oklch(0.65 0.19 35 / 0.18)' : 'rgba(255,255,255,.05)',
                  filter: it.unlocked ? 'none' : 'grayscale(1) opacity(0.5)'
                }}>{it.icon}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <div style={{ font: "600 13px 'Inter'", color: it.unlocked ? '#f5f0ea' : 'rgba(245,240,234,.6)' }}>{it.name}</div>
                    {it.isNew && (
                      <span style={{ font: "700 9px 'Inter'", padding: '2px 6px', borderRadius: 100, background: 'oklch(0.65 0.19 35)', color: '#0d0c0b' }}>NEW</span>
                    )}
                  </div>
                  <div style={{ font: "400 11px 'Inter'", color: 'rgba(245,240,234,.45)', marginTop: 2 }}>{it.description}</div>
                  {!it.unlocked && (
                    <div style={{ marginTop: 8 }}>
                      <div style={{ height: 4, borderRadius: 3, background: 'rgba(255,255,255,.08)', overflow: 'hidden', marginBottom: 4 }}>
                        <div style={{ height: '100%', width: `${it.progressPct}%`, background: 'oklch(0.65 0.19 35 / 0.6)' }} />
                      </div>
                      <div style={{ font: "500 10px 'Inter'", color: 'rgba(245,240,234,.4)' }}>{it.progressLabel}</div>
                    </div>
                  )}
                </div>
                <div style={{ flex: 'none', textAlign: 'right' }}>
                  <div className="num" style={{ fontSize: 13, fontWeight: 700, color: it.unlocked ? 'oklch(0.78 0.15 35)' : 'rgba(245,240,234,.35)' }}>{it.points}</div>
                  <div style={{ font: "500 9px 'Inter'", color: 'rgba(245,240,234,.3)' }}>pts</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
