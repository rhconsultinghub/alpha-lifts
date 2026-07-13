import type { ViewModel } from '../state/viewModel';
import { ExercisePhoto } from './ExercisePhoto';
import { SetTimeControl } from './SetTimeControl';

export function WorkoutScreen({ vm }: { vm: ViewModel }) {
  const w = vm.workout;
  if (!w) return null;
  return (
    <>
      <div style={{ padding: '18px 20px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,.08)' }}>
        <button onClick={vm.exitWorkout} style={{ background: 'rgba(255,255,255,.08)', border: 'none', color: '#f5f0ea', width: 30, height: 30, borderRadius: '50%', fontSize: 14 }}>‹</button>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
          <div style={{ font: "600 12px 'Inter'", color: 'rgba(245,240,234,.6)' }}>{w.progressText}</div>
          <div className="num" style={{ font: "700 12px 'Space Grotesk'", color: 'oklch(0.72 0.17 35)' }}>⏱ {w.elapsedText}</div>
        </div>
        <button onClick={w.endEarly} style={{ background: 'none', border: 'none', color: 'rgba(245,240,234,.4)', fontSize: 11, fontWeight: 600 }}>End</button>
      </div>

      {vm.confirmEndEarly && (
        <div style={{ padding: '8px 20px', background: 'oklch(0.65 0.19 35 / 0.15)', textAlign: 'center', font: "600 11px 'Inter'", color: 'oklch(0.78 0.15 35)' }}>{w.endEarlyLabel} — tap End again</div>
      )}

      <div style={{ display: 'flex', gap: 8, overflowX: 'auto', padding: '12px 20px', borderBottom: '1px solid rgba(255,255,255,.06)' }}>
        {w.navList.map((n: any, i: number) => (
          <button key={i} onClick={n.go} style={{ flex: 'none', display: 'flex', alignItems: 'center', gap: 7, background: n.bg, border: `1px solid ${n.border}`, color: n.color, font: "600 11px 'Inter'", padding: '6px 12px 6px 6px', borderRadius: 100, whiteSpace: 'nowrap' }}>
            <span style={{ width: 22, height: 22, borderRadius: '50%', flex: 'none', overflow: 'hidden', background: 'rgba(0,0,0,.15)', display: 'flex' }}><ExercisePhoto id={n.id} pattern={n.pattern} size={22} radius={0} /></span>
            {n.name}<span style={{ opacity: 0.7 }}>{n.statusText}</span>
          </button>
        ))}
        <button onClick={w.openAddExercise} style={{ flex: 'none', display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: '1px dashed rgba(255,255,255,.25)', color: 'rgba(245,240,234,.6)', font: "600 11px 'Inter'", padding: '6px 12px', borderRadius: 100, whiteSpace: 'nowrap' }}>+ Add Exercise</button>
      </div>

      <div style={{ padding: '12px 20px 140px' }}>
        <div style={{ display: 'flex', gap: 14, marginBottom: 14 }}>
          <ExercisePhoto id={w.id} pattern={w.pattern} size={76} radius={16} onClick={w.openDetail} />
          <div style={{ flex: 1 }}>
            <div className="num" style={{ fontSize: 21, fontWeight: 700 }}>{w.exName}</div>
            <div style={{ font: "500 11px 'Inter'", color: 'rgba(245,240,234,.45)', marginTop: 3 }}>{w.muscle} · {w.equipLabel}</div>
            <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
              <button onClick={w.openSwap} style={{ font: "600 10px 'Inter'", padding: '4px 9px', borderRadius: 100, border: '1px solid rgba(255,255,255,.2)', background: 'none', color: 'rgba(245,240,234,.6)' }}>⇄ Swap</button>
              <button onClick={w.openDetail} style={{ font: "600 10px 'Inter'", padding: '4px 9px', borderRadius: 100, border: '1px solid rgba(255,255,255,.2)', background: 'none', color: 'rgba(245,240,234,.6)' }}>▶ How-to</button>
              {w.canMoveUp && (
                <button onClick={w.moveUp} style={{ font: "600 10px 'Inter'", padding: '4px 9px', borderRadius: 100, border: '1px solid rgba(255,255,255,.2)', background: 'none', color: 'rgba(245,240,234,.6)' }}>↑ Move Up</button>
              )}
              {w.canMoveDown && (
                <button onClick={w.moveDown} style={{ font: "600 10px 'Inter'", padding: '4px 9px', borderRadius: 100, border: '1px solid rgba(255,255,255,.2)', background: 'none', color: 'rgba(245,240,234,.6)' }}>↓ Move Down</button>
              )}
              {w.canRemoveExercise && (
                <button onClick={w.removeExercise} style={{ font: "600 10px 'Inter'", padding: '4px 9px', borderRadius: 100, border: '1px solid rgba(255,255,255,.2)', background: 'none', color: 'oklch(0.72 0.17 35)' }}>✕ Remove</button>
              )}
            </div>
          </div>
        </div>

        {w.supersetPartnerName && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '10px 14px', borderRadius: 14, background: 'oklch(0.7 0.13 230 / 0.1)', border: '1px solid oklch(0.7 0.13 230 / 0.35)', marginBottom: 14 }}>
            <span style={{ fontSize: 14 }}>⚡</span>
            <span style={{ font: "500 12px/1.4 'Inter'", color: 'oklch(0.78 0.13 230)' }}>Paired with {w.supersetPartnerName} — no rest between until both sets are done.</span>
          </div>
        )}

        <button onClick={w.viewHistory} style={{ width: '100%', textAlign: 'left', padding: '12px 14px', borderRadius: 14, background: 'oklch(0.65 0.19 35 / 0.12)', border: '1px solid oklch(0.65 0.19 35 / 0.4)', marginBottom: 18 }}>
          <div style={{ font: "600 12px 'Inter'", color: 'oklch(0.8 0.15 35)' }}>{w.recTitle}</div>
          <div style={{ font: "400 12px/1.4 'Inter'", color: 'rgba(245,240,234,.75)', marginTop: 2 }}>{w.recNote} <span style={{ textDecoration: 'underline', color: 'oklch(0.8 0.15 35)' }}>View history</span></div>
        </button>

        {w.warmup.show && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: '12px 14px', borderRadius: 14, background: 'oklch(0.7 0.13 230 / 0.1)', border: '1px solid oklch(0.7 0.13 230 / 0.35)', marginBottom: 16 }}>
            <span style={{ fontSize: 15 }}>🔥</span>
            <div>
              <div style={{ font: "600 12px 'Inter'", color: 'oklch(0.78 0.13 230)' }}>Warm-up</div>
              <div style={{ font: "400 12px/1.4 'Inter'", color: 'rgba(245,240,234,.7)', marginTop: 2 }}>{w.warmup.note}</div>
              <div className="num" style={{ fontSize: 13, fontWeight: 700, marginTop: 6, color: 'rgba(245,240,234,.85)' }}>{w.warmup.setsText}</div>
            </div>
          </div>
        )}

        <div style={{ font: "500 10px 'Inter'", color: 'rgba(245,240,234,.4)', letterSpacing: '.04em', marginBottom: 10 }}>WORKING SETS</div>

        {w.sets.map((s: any, i: number) => (
          <div key={i} style={{ borderRadius: 18, background: s.cardBg, border: `1px solid ${s.cardBorder}`, padding: 14, marginBottom: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div>
                <span className="num" style={{ fontSize: 15, fontWeight: 700 }}>Set {s.num}</span>
                <span style={{ font: "400 11px 'Inter'", color: 'rgba(245,240,234,.4)' }}> · target {s.targetText}</span>
                {s.hasLast && (
                  <button onClick={s.viewHistory} style={{ display: 'block', background: 'none', border: 'none', padding: 0, marginTop: 2, font: "500 11px 'Inter'", color: 'oklch(0.72 0.17 35)', textDecoration: 'underline', cursor: 'pointer' }}>Last time: {s.lastText}</button>
                )}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                {w.canRemoveSet && (
                  <button onClick={s.remove} style={{ width: 32, height: 32, borderRadius: '50%', border: 'none', background: 'rgba(255,255,255,.06)', color: 'rgba(245,240,234,.45)', fontSize: 13 }}>✕</button>
                )}
                <button onClick={s.toggleDone} aria-pressed={s.done} style={{ width: 40, height: 40, flex: 'none', borderRadius: '50%', border: 'none', background: s.doneBg, color: s.doneColor, fontSize: 17 }}>✓</button>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <div style={{ flex: 1 }}>
                <div style={{ font: "500 10px 'Inter'", color: 'rgba(245,240,234,.4)', letterSpacing: '.04em', marginBottom: 6, textAlign: 'center' }}>WEIGHT ({w.unitsLabel})</div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(255,255,255,.07)', borderRadius: 14, padding: 6 }}>
                  <button onClick={s.decWeight} style={{ width: 38, height: 38, flex: 'none', borderRadius: 10, border: 'none', background: 'rgba(255,255,255,.1)', color: '#f5f0ea', fontSize: 17 }}>–</button>
                  <input type="number" value={s.weight} onChange={e => s.setWeight(parseFloat(e.target.value) || 0)} style={{ width: 56, fontSize: 17 }} />
                  <button onClick={s.incWeight} style={{ width: 38, height: 38, flex: 'none', borderRadius: 10, border: 'none', background: 'rgba(255,255,255,.1)', color: '#f5f0ea', fontSize: 17 }}>+</button>
                </div>
                {s.platesText && (
                  <div style={{ font: "500 10px 'Inter'", color: 'rgba(245,240,234,.4)', textAlign: 'center', marginTop: 4 }}>🏋 {s.platesText}</div>
                )}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ font: "500 10px 'Inter'", color: 'rgba(245,240,234,.4)', letterSpacing: '.04em', marginBottom: 6, textAlign: 'center' }}>{s.isTime ? 'TIME (SEC)' : 'REPS'}</div>
                {s.isTime ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <SetTimeControl seconds={s.reps} onCapture={(sec) => s.setReps(sec)} />
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
                      <button onClick={s.decReps} style={{ width: 26, height: 26, flex: 'none', borderRadius: 8, border: 'none', background: 'rgba(255,255,255,.08)', color: 'rgba(245,240,234,.7)', fontSize: 13 }}>–</button>
                      <span style={{ font: "500 10px 'Inter'", color: 'rgba(245,240,234,.4)' }}>adjust 5s</span>
                      <button onClick={s.incReps} style={{ width: 26, height: 26, flex: 'none', borderRadius: 8, border: 'none', background: 'rgba(255,255,255,.08)', color: 'rgba(245,240,234,.7)', fontSize: 13 }}>+</button>
                    </div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(255,255,255,.07)', borderRadius: 14, padding: 6 }}>
                    <button onClick={s.decReps} style={{ width: 38, height: 38, flex: 'none', borderRadius: 10, border: 'none', background: 'rgba(255,255,255,.1)', color: '#f5f0ea', fontSize: 17 }}>–</button>
                    <input type="number" value={s.reps} onChange={e => s.setReps(parseInt(e.target.value) || 0)} style={{ width: 56, fontSize: 17 }} />
                    <button onClick={s.incReps} style={{ width: 38, height: 38, flex: 'none', borderRadius: 10, border: 'none', background: 'rgba(255,255,255,.1)', color: '#f5f0ea', fontSize: 17 }}>+</button>
                  </div>
                )}
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 10 }}>
              <span style={{ font: "500 10px 'Inter'", color: 'rgba(245,240,234,.4)', letterSpacing: '.04em' }}>RIR</span>
              {s.rirOptions.map((o: any) => (
                <button key={o.v} onClick={o.select} style={{ width: 26, height: 26, borderRadius: '50%', border: 'none', background: o.bg, color: o.color, font: "700 10px 'Inter'" }}>{o.label}</button>
              ))}
            </div>
          </div>
        ))}
        <button onClick={w.addSet} style={{ width: '100%', marginTop: 4, background: 'none', border: '1px dashed rgba(255,255,255,.25)', color: 'rgba(245,240,234,.6)', font: "600 13px 'Inter'", padding: 13, borderRadius: 14 }}>+ Add Set</button>
      </div>

      {w.resting && (
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, background: '#17140f', borderTop: '1px solid rgba(255,255,255,.1)', padding: '16px 20px', boxShadow: '0 -10px 30px rgba(0,0,0,.4)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <div style={{ font: "500 11px 'Inter'", color: 'rgba(245,240,234,.5)', letterSpacing: '.03em' }}>RESTING</div>
            <div className="num" style={{ fontSize: 24, fontWeight: 700, color: 'oklch(0.72 0.17 35)' }}>{w.restText}</div>
          </div>
          <div style={{ height: 6, borderRadius: 4, background: 'rgba(255,255,255,.1)', overflow: 'hidden', marginBottom: 12 }}>
            <div style={{ height: '100%', width: `${w.restPct}%`, background: 'oklch(0.65 0.19 35)' }} />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={w.restMinus} style={{ flex: 1, background: 'rgba(255,255,255,.08)', border: 'none', color: '#f5f0ea', font: "600 12px 'Inter'", padding: 10, borderRadius: 10 }}>-15s</button>
            <button onClick={w.restPlus} style={{ flex: 1, background: 'rgba(255,255,255,.08)', border: 'none', color: '#f5f0ea', font: "600 12px 'Inter'", padding: 10, borderRadius: 10 }}>+15s</button>
            <button onClick={w.restSkip} style={{ flex: 1, background: 'oklch(0.65 0.19 35)', border: 'none', color: '#0d0c0b', font: "700 12px 'Inter'", padding: 10, borderRadius: 10 }}>Skip</button>
          </div>
        </div>
      )}

      {!w.resting && w.workoutAllDone && (
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: '16px 20px', background: '#17140f', borderTop: '1px solid rgba(255,255,255,.1)' }}>
          <button onClick={w.completeWorkout} style={{ width: '100%', background: 'oklch(0.7 0.15 145)', color: '#0d0c0b', font: "700 15px 'Inter'", padding: 16, borderRadius: 16, border: 'none' }}>✓ Complete Workout</button>
        </div>
      )}
      {!w.resting && !w.workoutAllDone && w.canAdvance && (
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: '16px 20px', background: '#17140f', borderTop: '1px solid rgba(255,255,255,.1)' }}>
          <button onClick={w.advance} style={{ width: '100%', background: 'oklch(0.65 0.19 35)', color: '#0d0c0b', font: "700 15px 'Inter'", padding: 16, borderRadius: 16, border: 'none' }}>{w.advanceLabel}</button>
        </div>
      )}
    </>
  );
}
