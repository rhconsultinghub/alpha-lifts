import { useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import type { ViewModel } from '../state/viewModel';
import { ExercisePhoto } from './ExercisePhoto';
import { BodyDiagram } from './BodyDiagram';
import { MusclesWorkedModal } from './modals/MusclesWorkedModal';

const LONG_PRESS_MS = 450;
const MOVE_CANCEL_PX = 10;

// Press-and-hold drag reordering, engaged only from the ⠿ handle (not the row itself) so it can't
// fight with the row's own tap-to-edit / photo-tap / swap-button targets. While dragging, the
// visual order is tracked entirely in local component state (`drag.order`, a permutation of
// display positions) and only committed to the real program via a single reorderExercise call on
// release — dispatching mid-gesture would race the async re-render against a flurry of pointermove
// events and reorder against stale indices.
export function DayViewScreen({ vm }: { vm: ViewModel }) {
  const d = vm.currentDay;
  const [drag, setDrag] = useState<{ p0: number; startY: number; rowH: number; order: number[]; position: number } | null>(null);
  const longPressTimer = useRef<number | null>(null);
  const rowRef = useRef<HTMLDivElement | null>(null);

  if (!d) return null;
  const exercises: any[] = d.exercises;

  const clearLongPress = () => {
    if (longPressTimer.current != null) { window.clearTimeout(longPressTimer.current); longPressTimer.current = null; }
  };

  const handlePointerDown = (e: ReactPointerEvent, position: number) => {
    const startY = e.clientY;
    const rowH = rowRef.current?.offsetHeight || 90;
    const pointerId = e.pointerId;
    const target = e.currentTarget as HTMLElement;
    clearLongPress();
    longPressTimer.current = window.setTimeout(() => {
      longPressTimer.current = null;
      target.setPointerCapture?.(pointerId);
      const order = exercises.map((_, k) => k);
      setDrag({ p0: position, startY, rowH, order, position });
    }, LONG_PRESS_MS);
  };

  const handlePointerMove = (e: ReactPointerEvent) => {
    if (longPressTimer.current != null && Math.abs(e.clientY - (drag?.startY ?? e.clientY)) > MOVE_CANCEL_PX) {
      clearLongPress();
    }
    if (!drag) return;
    const steps = Math.round((e.clientY - drag.startY) / drag.rowH);
    const newPosition = Math.max(0, Math.min(exercises.length - 1, drag.p0 + steps));
    if (newPosition !== drag.position) {
      const order = exercises.map((_, k) => k);
      const [moved] = order.splice(drag.p0, 1);
      order.splice(newPosition, 0, moved);
      setDrag({ ...drag, order, position: newPosition });
    }
  };

  const finishDrag = () => {
    clearLongPress();
    if (drag && drag.position !== drag.p0) exercises[drag.p0].reorderTo(drag.position);
    setDrag(null);
  };

  const displayOrder = drag ? drag.order : exercises.map((_, k) => k);

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

        {displayOrder.map((origIdx, displayPos) => {
          const ex = exercises[origIdx];
          const isDragged = !!drag && displayPos === drag.position;
          return (
            <div
              key={ex.id + '-' + origIdx}
              ref={displayPos === 0 ? rowRef : undefined}
              style={{
                padding: '18px 0', borderBottom: '1px solid rgba(255,255,255,.1)', display: 'flex', gap: 14,
                background: isDragged ? 'rgba(255,255,255,.05)' : 'transparent',
                boxShadow: isDragged ? '0 8px 20px rgba(0,0,0,.4)' : 'none',
                borderRadius: isDragged ? 14 : 0,
                position: 'relative', zIndex: isDragged ? 1 : 'auto'
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
                onPointerDown={(e) => handlePointerDown(e, origIdx)}
                onPointerMove={handlePointerMove}
                onPointerUp={finishDrag}
                onPointerCancel={finishDrag}
                title="Press and hold to reorder"
                style={{ flex: 'none', alignSelf: 'center', width: 32, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(245,240,234,.3)', fontSize: 18, touchAction: 'none', cursor: 'grab' }}
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
