import { useEffect, useState } from 'react';
import { formatElapsed } from './logic';

/**
 * Component-local 1-second clocks for time displays (workout elapsed, rest countdown).
 *
 * These exist so ticking a clock re-renders ONLY the leaf component showing it. The app used to
 * drive both displays through global state — a `forceTick` interval re-rendering the whole tree
 * every second for elapsed time, and restTick writing `restRemaining` into AppState every second
 * — which meant a full view-model rebuild, a JSON.stringify of the entire state for persistence,
 * and a dirtied cloud-sync debounce, once per second for the length of every workout. Both
 * displays derive from absolute timestamps that already live in state (startedAt, restEndAt), so
 * only the deriving needs a timer, not the source of truth.
 */

/** Epoch-ms "now", refreshed every second while `active` (frozen, no interval, otherwise). */
export function useNowTick(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [active]);
  return now;
}

/** Live "12:34"-style elapsed text for a workout started at `startedAt`; '' when not running. */
export function useElapsedText(startedAt: number | null | undefined): string {
  const now = useNowTick(startedAt != null);
  return startedAt != null ? formatElapsed(now - startedAt) : '';
}

/** Live rest countdown ("1:27" + percent-remaining) derived from the absolute restEndAt. */
export function useRestClock(
  resting: boolean,
  restEndAt: number | null | undefined,
  restTotal: number
): { restText: string; restPct: number } {
  const now = useNowTick(resting && restEndAt != null);
  const remaining = resting && restEndAt != null ? Math.max(0, Math.round((restEndAt - now) / 1000)) : 0;
  const mm = Math.floor(remaining / 60);
  const ss = String(remaining % 60).padStart(2, '0');
  return {
    restText: mm + ':' + ss,
    restPct: restTotal > 0 ? Math.min(100, Math.round((remaining / restTotal) * 100)) : 0
  };
}
