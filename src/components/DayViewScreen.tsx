import { useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import type { ViewModel } from '../state/viewModel';
import { ExercisePhoto } from './ExercisePhoto';
import { BodyDiagram } from './BodyDiagram';
import { MusclesWorkedModal } from './modals/MusclesWorkedModal';

const LONG_PRESS_MS = 280;
const MOVE_CANCEL_PX = 12;

// Press-and-hold drag reordering, engaged only from the ⠿ handle (not the row itself) so it can't
// fight with the row's own tap-to-edit / photo-tap / swap-button targets. After a short hold the
// row "pops out" (lifts, scales up, accent outline, a haptic tick) and then follows the finger,
// while the other rows slide to open a gap at the drop position — so it's always clear both that a
// drag is engaged and where the row will land. The exercises array is never permuted mid-drag: the
// dragged row keeps its original index and just renders translated, and the others render shifted by
// one row-height toward/away from the gap; only on release does a single reorderExercise call
// commit, sidestepping stale-index races against the flurry of pointermove re-renders.
export function DayViewScreen({ vm }: { vm: ViewModel }) {
  const d = vm.currentDay;
  const [drag, setDrag] = useState<{ p0: number; startY: number; rowH: number; dy: number; target: number } | null>(null);
  const [pressing, setPressing] = useState<number | null>(null);
  const longPressTimer = useRef<number | null>(null);
  const pressRef = useRef<{ startY: number; rowH: number } | null>(null);

  if (!d) return null;
  const exercises: any[] = d.exercises;

  const clearLongPress = () => {
    if (longPressTimer.current != null) { window.clearTimeout(longPressTimer.current); longPressTimer.current = null; }
  };

  const handlePointerDown = (e: ReactPointerEvent, position: number) => {
    const startY = e.clientY;
    const rowEl = (e.currentTarget as HTMLElement).closest('[data-dvrow]') as HTMLElement | null;
    const rowH = rowEl?.offsetHeight || 96;
    const pointerId = e.pointerId;
    const target = e.currentTarget as HTMLElement;
    clearLongPress();
    pressRef.current = { startY, rowH };
    setPressing(position);
    longPressTimer.current = window.setTimeout(() => {
      longPressTimer.current = null;
      target.setPointerCapture?.(pointerId);
      if (navigator.vibrate) navigator.vibrate(15); // haptic "pop" on pickup (mobile only, no-op elsewhere)
      setDrag({ p0: position, startY, rowH, dy: 0, target: position });
    }, LONG_PRESS_MS);
  };

  const handlePointerMove = (e: ReactPointerEvent) => {
    // pre-engage: a finger that travels before the hold completes is a scroll, not a pickup — cancel
    if (longPressTimer.current != null && pressRef.current && Math.abs(e.clientY - pressRef.current.startY) > MOVE_CANCEL_PX) {
      clearLongPress();
      setPressing(null);
    }
    if (!drag) return;
    const dy = e.clientY - drag.startY;
    const target = Math.max(0, Math.min(exercises.length - 1, drag.p0 + Math.round(dy / drag.rowH)));
    if (dy !== drag.dy || target !== drag.target) setDrag({ ...drag, dy, target });
  };

  const finishDrag = () => {
    clearLongPress();
    setPressing(null);
    pressRef.current = null;
    if (drag && drag.target !== drag.p0) exercises[drag.p0].reorderTo(drag.target);
    setDrag(null);
  };

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
                <button key={i} onClick={wu.open} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, background: 'none', border: 'none', padding: '4px 0', textAlign: 'left', cursor: 'pointer' }}>
                  <span style={{ font: "500 12px 'Inter'", color: 'rgba(245,240,234,.8)' }}>{wu.name} <span style={{ color: 'rgba(245,240,234,.3)' }}>›</span></span>
                  <span style={{ flex: 'none', font: "500 11px 'Inter'", color: 'rgba(245,240,234,.4)' }}>{wu.cue}</span>
                </button>
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

        {exercises.map((ex, i) => {
          const isDragged = !!drag && drag.p0 === i;
          const isPressing = pressing === i && !drag;
          // Non-dragged rows slide by one row-height to open the gap the dragged row will drop into.
          let shift = 0;
          if (drag && !isDragged) {
            if (drag.target > drag.p0 && i > drag.p0 && i <= drag.target) shift = -drag.rowH;
            else if (drag.target < drag.p0 && i >= drag.target && i < drag.p0) shift = drag.rowH;
          }
          return (
            <div
              key={ex.id + '-' + i}
              data-dvrow="1"
              style={{
                padding: '18px 0', borderBottom: '1px solid rgba(255,255,255,.1)', display: 'flex', gap: 14, position: 'relative',
                transform: isDragged ? `translateY(${drag.dy}px) scale(1.03)` : `translateY(${shift}px)`,
                transition: isDragged ? 'none' : 'transform 160ms cubic-bezier(.2,.7,.3,1)',
                zIndex: isDragged ? 5 : 'auto',
                background: isDragged ? 'rgba(30,25,20,.96)' : 'transparent',
                boxShadow: isDragged ? '0 14px 32px rgba(0,0,0,.55)' : 'none',
                outline: isDragged ? '1px solid oklch(0.65 0.19 35 / 0.55)' : 'none',
                outlineOffset: -1,
                borderRadius: isDragged ? 14 : 0,
                opacity: isPressing ? 0.7 : 1
              }}
            >
              <ExercisePhoto id={ex.id} pattern={ex.pattern} onClick={ex.openDetail} />
              <button onClick={ex.openQuickEdit} style={{ flex: 1, minWidth: 0, background: 'none', border: 'none', padding: 0, textAlign: 'left' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                  <span style={{ font: "600 18px 'Inter'", color: '#f5f0ea' }}>{ex.name}</span>
                  <span onClick={(e) => { e.stopPropagation(); ex.openSwap(); }} style={{ flex: 'none', font: "600 10px 'Inter'", padding: '4px 9px', borderRadius: 100, border: '1px solid rgba(255,255,255,.2)', color: 'rgba(245,240,234,.6)' }}>⇄ Swap</span>
                </div>
                <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                  <span style={{ font: "500 11px 'Inter'", padding: '5px 10px', borderRadius: 100, background: 'rgba(255,255,255,.08)' }}>{ex.setsText}</span>
                  <span style={{ font: "600 11px 'Inter'", padding: '5px 10px', borderRadius: 100, background: 'oklch(0.65 0.19 35)', color: '#0d0c0b' }}>{ex.targetText}</span>
                  {ex.supersetBadge && (
                    <span style={{ font: "600 11px 'Inter'", padding: '5px 10px', borderRadius: 100, background: 'oklch(0.7 0.13 230 / 0.15)', color: 'oklch(0.78 0.13 230)' }}>⚡ Superset</span>
                  )}
                </div>
                <div style={{ font: "500 11px 'Inter'", color: 'rgba(245,240,234,.4)', marginTop: 8 }}>🔒 {ex.equipLabel} · {ex.muscle}</div>
              </button>
              <div
                onPointerDown={(e) => handlePointerDown(e, i)}
                onPointerMove={handlePointerMove}
                onPointerUp={finishDrag}
                onPointerCancel={finishDrag}
                title="Press and hold to reorder"
                style={{ flex: 'none', alignSelf: 'center', width: 32, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', color: isDragged ? 'oklch(0.78 0.15 35)' : 'rgba(245,240,234,.3)', fontSize: 18, touchAction: 'none', cursor: drag ? 'grabbing' : 'grab' }}
              >⠿</div>
            </div>
          );
        })}

        <button onClick={vm.startWorkout} style={{ width: '100%', marginTop: 20, background: 'oklch(0.65 0.19 35)', color: '#0d0c0b', font: "700 15px 'Inter'", textAlign: 'center', padding: 16, borderRadius: 16, border: 'none' }}>Start Workout</button>
      </div>

      <MusclesWorkedModal vm={vm} />
    </>
  );
}
