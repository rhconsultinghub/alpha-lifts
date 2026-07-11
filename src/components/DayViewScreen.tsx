import type { ViewModel } from '../state/viewModel';
import { ExercisePhoto } from './ExercisePhoto';
import { BodyDiagram } from './BodyDiagram';
import { MusclesWorkedModal } from './modals/MusclesWorkedModal';

export function DayViewScreen({ vm }: { vm: ViewModel }) {
  const d = vm.currentDay;
  if (!d) return null;
  return (
    <>
      <div style={{ background: 'linear-gradient(160deg, oklch(0.22 0.05 35), #0f0e0d 65%)', padding: '22px 20px 20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <button onClick={vm.goProgram} style={{ background: 'rgba(255,255,255,.08)', border: 'none', color: '#f5f0ea', width: 30, height: 30, borderRadius: '50%', fontSize: 14 }}>‹</button>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={d.toggleSkip} style={{ font: "600 11px 'Inter'", padding: '7px 12px', borderRadius: 100, border: '1px solid rgba(255,255,255,.2)', background: 'none', color: d.skipColor }}>{d.skipLabel}</button>
            <button onClick={vm.openDayBuilder} style={{ background: 'rgba(255,255,255,.08)', border: 'none', color: '#f5f0ea', width: 30, height: 30, borderRadius: '50%', fontSize: 14 }}>✎</button>
          </div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <div>
            <div style={{ font: "500 12px 'Inter'", color: 'rgba(245,240,234,.5)', letterSpacing: '.04em' }}>{d.dow}</div>
            <div className="num" style={{ fontSize: 34, fontWeight: 700, margin: '2px 0 14px' }}>{d.label}</div>
          </div>
          <button onClick={vm.openBodyModal} title="Muscles worked" style={{ flex: 'none', background: 'rgba(255,255,255,.06)', border: 'none', borderRadius: 12, padding: '4px 8px 0', marginBottom: 8 }}>
            <BodyDiagram view={vm.bodyView} ranks={d.diagramRanks} width={34} height={63} />
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
          {d.muscleBars.map((m: any) => (
            <div key={m.name} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 66, font: "500 11px 'Inter'", color: 'rgba(245,240,234,.7)' }}>{m.name}</div>
              <div style={{ flex: 1, height: 6, borderRadius: 4, background: 'rgba(255,255,255,.1)', overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${m.pctClamped}%`, background: m.color }} />
              </div>
              <div className="num" style={{ width: 34, textAlign: 'right', fontSize: 11, fontWeight: 700, color: m.color }}>{m.pctText}</div>
            </div>
          ))}
        </div>

        {d.hasWarning && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: '10px 12px', borderRadius: 12, background: 'rgba(0,0,0,.3)' }}>
            <span style={{ fontSize: 15 }}>⚠️</span>
            <span style={{ font: "500 12px/1.4 'Inter'", color: d.warningColor }}>{d.warningText}</span>
          </div>
        )}
      </div>

      <div style={{ padding: '6px 20px 40px' }}>
        {d.warmups.length > 0 && (
          <div style={{ padding: '14px 16px', borderRadius: 14, background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.08)', marginBottom: 18 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
              <span style={{ fontSize: 14 }}>🔥</span>
              <span style={{ font: "600 12px 'Inter'", color: '#f5f0ea' }}>Warm-Up First</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {d.warmups.map((wu: any, i: number) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                  <span style={{ font: "500 12px 'Inter'", color: 'rgba(245,240,234,.8)' }}>{wu.name}</span>
                  <span style={{ flex: 'none', font: "500 11px 'Inter'", color: 'rgba(245,240,234,.4)' }}>{wu.cue}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {d.balanceTip.show && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: '12px 14px', borderRadius: 14, background: 'oklch(0.7 0.13 230 / 0.1)', border: '1px solid oklch(0.7 0.13 230 / 0.35)', marginBottom: 18 }}>
            <span style={{ fontSize: 15 }}>💡</span>
            <div style={{ flex: 1 }}>
              <div style={{ font: "400 12px/1.4 'Inter'", color: 'rgba(245,240,234,.8)' }}>{d.balanceTip.text}</div>
              <button onClick={d.balanceTip.swap} style={{ marginTop: 8, font: "600 11px 'Inter'", padding: '6px 12px', borderRadius: 100, border: '1px solid oklch(0.7 0.13 230 / 0.5)', background: 'none', color: 'oklch(0.78 0.13 230)' }}>{d.balanceTip.ctaLabel}</button>
            </div>
          </div>
        )}

        {d.exercises.map((ex: any, i: number) => (
          <div key={i} style={{ padding: '18px 0', borderBottom: '1px solid rgba(255,255,255,.1)', display: 'flex', gap: 14 }}>
            <ExercisePhoto pattern={ex.pattern} onClick={ex.openDetail} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                <button onClick={ex.openDetail} style={{ background: 'none', border: 'none', padding: 0, textAlign: 'left', font: "600 18px 'Inter'", color: '#f5f0ea' }}>{ex.name}</button>
                <button onClick={ex.openSwap} style={{ flex: 'none', font: "600 10px 'Inter'", padding: '4px 9px', borderRadius: 100, border: '1px solid rgba(255,255,255,.2)', background: 'none', color: 'rgba(245,240,234,.6)' }}>⇄ Swap</button>
              </div>
              <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                <span style={{ font: "500 11px 'Inter'", padding: '5px 10px', borderRadius: 100, background: 'rgba(255,255,255,.08)' }}>{ex.setsText}</span>
                <span style={{ font: "600 11px 'Inter'", padding: '5px 10px', borderRadius: 100, background: 'oklch(0.65 0.19 35)', color: '#0d0c0b' }}>{ex.targetText}</span>
              </div>
              <div style={{ font: "500 11px 'Inter'", color: 'rgba(245,240,234,.4)', marginTop: 8 }}>🔒 {ex.equipLabel} · {ex.muscle}</div>
            </div>
          </div>
        ))}

        <button onClick={vm.startWorkout} style={{ width: '100%', marginTop: 20, background: 'oklch(0.65 0.19 35)', color: '#0d0c0b', font: "700 15px 'Inter'", textAlign: 'center', padding: 16, borderRadius: 16, border: 'none' }}>Start Workout</button>
      </div>

      <MusclesWorkedModal vm={vm} />
    </>
  );
}
