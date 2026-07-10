import { useEffect, useRef, useState } from 'react';
import { formatSetTime } from '../state/logic';

// Live stopwatch for time-tracked exercises (e.g. planks): tap Start to count up, Stop captures
// the elapsed seconds into the set. The -/+ steppers still work for manual entry either way.
export function SetTimeControl({ seconds, onCapture }: { seconds: number; onCapture: (sec: number) => void }) {
  const [running, setRunning] = useState(false);
  const [liveSec, setLiveSec] = useState(0);
  const startRef = useRef(0);

  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => setLiveSec(Math.round((Date.now() - startRef.current) / 1000)), 200);
    return () => window.clearInterval(id);
  }, [running]);

  const start = () => { startRef.current = Date.now(); setLiveSec(0); setRunning(true); };
  const stop = () => { setRunning(false); onCapture(liveSec); };

  return (
    <button
      onClick={running ? stop : start}
      style={{
        width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        background: running ? 'oklch(0.65 0.19 35 / 0.18)' : 'rgba(255,255,255,.07)',
        border: running ? '1px solid oklch(0.65 0.19 35 / 0.5)' : 'none',
        borderRadius: 14, padding: '10px 6px', color: running ? 'oklch(0.8 0.15 35)' : '#f5f0ea'
      }}
    >
      <span style={{ fontSize: 14 }}>{running ? '■' : '▶'}</span>
      <span className="num" style={{ fontSize: 15, fontWeight: 700 }}>{running ? formatSetTime(liveSec) : formatSetTime(seconds)}</span>
      <span style={{ font: "600 10px 'Inter'", opacity: 0.7 }}>{running ? 'Stop' : 'Start'}</span>
    </button>
  );
}
