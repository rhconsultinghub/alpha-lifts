import { useCallback, useEffect, useRef } from 'react';
import { useAuth } from './AuthContext';
import { isDirty, markDirty, markPushed, pushServerState, adoptServerState } from './sync';
import { readMeta, writeMeta } from './syncMeta';
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
 * Hardening from the 2026-08 audit, all in doPush():
 *  - Every push carries the server version it was based on; the Worker 409s if the row moved
 *    (another device pushed), instead of letting this device silently overwrite it.
 *  - On conflict: same LWW rule reconcileOnSignIn uses — local newer → re-push on top of the
 *    server's version; server newer → adopt it and reload (state is persisted, so a reload is
 *    lossless and is how the app already applies SW updates).
 *  - Dirty is only cleared when the state object that was pushed is still the current one —
 *    an edit that landed mid-flight used to be wiped clean by the older push's bookkeeping and
 *    could then be lost to the next boot's "clean local, adopt server" branch.
 *  - A pagehide/hidden flush (keepalive) sends a pending change before the tab dies, instead of
 *    letting the debounce window swallow it.
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
  const pushing = useRef(false);

  // Latest state, for handlers that fire outside the render that produced them.
  const stateRef = useRef(state);
  stateRef.current = state;

  const doPush = useCallback(async () => {
    if (!token || !account || pushing.current) return;
    pushing.current = true;
    try {
      const snapshot = stateRef.current;
      const serialized = JSON.stringify(snapshot);
      const base = readMeta()?.serverVersion ?? 0;

      let res = await pushServerState(token, snapshot, base);
      if (res.status === 'conflict') {
        const dirtyAt = readMeta()?.dirtyAt ?? 0;
        if (dirtyAt >= res.server.updatedAt) {
          // Local is newer (LWW) — retry the same blob on top of the server's current version.
          res = await pushServerState(token, snapshot, res.server.version);
        } else {
          // Server is newer — this device's blob loses. Adopt the server copy and reload so the
          // running app actually shows it; everything local worth keeping was, by LWW, older.
          adoptServerState(account.id, res.server);
          window.location.reload();
          return;
        }
      }

      if (res.status === 'ok') {
        // Only mark clean if no edit landed while the PUT was in flight — state identity changes
        // on every setState, so `snapshot === current` is an exact "nothing newer" check.
        if (stateRef.current === snapshot) {
          markPushed(account.id, res.version);
        } else {
          // Newer edits are pending (their debounce timer is running): record the advanced
          // server version but stay dirty so they push.
          const meta = readMeta();
          writeMeta({ accountId: account.id, serverVersion: res.version, dirtyAt: meta?.dirtyAt ?? Date.now() });
        }
        lastPushed.current = serialized;
      }
      // 'failed': meta stays dirty; the next edit, 'online' event, or pagehide flush retries.
    } finally {
      pushing.current = false;
    }
  }, [token, account]);

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
    timer.current = window.setTimeout(doPush, DEBOUNCE_MS);

    return () => {
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, [state, configured, token, account, doPush]);

  // Retry a pending push as soon as connectivity returns, and flush before the page is hidden or
  // torn down (keepalive lets the request outlive the page). Both go through doPush, whose
  // `pushing` latch stops them racing the debounce timer with out-of-order payloads.
  useEffect(() => {
    if (!configured || !token || !account) return;
    const onOnline = () => {
      if (isDirty()) void doPush();
    };
    const onPagehide = () => {
      if (!isDirty() || pushing.current) return;
      // Fire-and-forget: no awaiting in pagehide. Deliberately does NOT touch sync-meta — if the
      // send lands, the next boot's reconcile sees server.updatedAt >= dirtyAt and adopts the
      // (identical) server copy; if it doesn't, the blob is still marked dirty for a real retry.
      void pushServerState(token, stateRef.current, readMeta()?.serverVersion ?? 0, true);
    };
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') onPagehide();
    };
    window.addEventListener('online', onOnline);
    window.addEventListener('pagehide', onPagehide);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('pagehide', onPagehide);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [configured, token, account, doPush]);
}
