import { useEffect, useRef } from 'react';
import { useAuth } from './AuthContext';
import { isDirty, markDirty, markPushed, pushServerState } from './sync';
import type { AppState } from '../data/types';

/**
 * Debounced push side of cloud sync. Mounted inside the app (where AppState lives) and fed the
 * current state; whenever it changes it schedules a PUT /state ~1.5s after the last edit, so a
 * flurry of taps during a workout becomes one request, not dozens.
 *
 * The pull/reconcile half already ran in <SyncBoundary> before the app mounted, so on a clean
 * mount the current state already matches the server and nothing is pushed. Only genuine local
 * edits (or a first-sign-in carry-up that left the blob marked dirty) trigger a push.
 *
 * No-op when accounts aren't configured or nobody's signed in.
 */

const DEBOUNCE_MS = 1500;

export function useCloudSync(state: AppState): void {
  const { configured, token, account } = useAuth();

  // Serialized form of what the server last confirmed it has, so we can skip pushing when nothing
  // actually changed. null = "unknown / needs a push".
  const lastPushed = useRef<string | null>(null);
  const inited = useRef(false);
  const timer = useRef<number | null>(null);

  // Latest state, for the online-retry handler (which fires outside the render that produced it).
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    if (!configured || !token || !account) return;

    const serialized = JSON.stringify(state);

    // First run for this session: establish the baseline. If sync-meta says we're clean, the
    // current blob equals the server's and there's nothing to push. If it's dirty (a carry-up or
    // an offline edit from before), fall through and push it.
    if (!inited.current) {
      inited.current = true;
      if (!isDirty()) {
        lastPushed.current = serialized;
        return;
      }
    }

    if (serialized === lastPushed.current) return;

    markDirty(account.id);
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(async () => {
      const res = await pushServerState(token, state);
      if (res) {
        markPushed(account.id, res.version);
        lastPushed.current = serialized;
      }
      // On failure the meta stays dirty; the next edit (or an 'online' event) retries.
    }, DEBOUNCE_MS);

    return () => {
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, [state, configured, token, account]);

  // Retry a pending push as soon as connectivity returns, without waiting for the next edit.
  useEffect(() => {
    if (!configured || !token || !account) return;
    const onOnline = async () => {
      if (!isDirty()) return;
      const serialized = JSON.stringify(stateRef.current);
      const res = await pushServerState(token, stateRef.current);
      if (res) {
        markPushed(account.id, res.version);
        lastPushed.current = serialized;
      }
    };
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, [configured, token, account]);
}
