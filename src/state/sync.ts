/**
 * Cloud sync. The whole app already persists as one localStorage blob (STORAGE_KEY); syncing is
 * mirroring that blob to the server, keyed to the signed-in account.
 *
 * Model — last-write-wins, single-user-across-devices:
 *  - On sign-in we PULL the server's copy and reconcile it against what's on this device, then
 *    write the winner to localStorage *before* the app reads it (so there's no flash of stale
 *    data that then swaps).
 *  - While signed in we PUSH (debounced) whenever local state changes.
 *  - localStorage stays the offline cache: a failed pull/push never blocks the app, it just
 *    leaves the change pending and retries.
 *
 * Conflict handling is deliberately simple (LWW by timestamp), which is the right call for one
 * person on several devices — the actual use case. Two devices edited between syncs is the only
 * lossy case, and the newer edit wins rather than anything merging. A sync-meta record tags the
 * local blob with the account it belongs to and tracks whether it has unpushed changes, so a
 * second account signing in on the same device can never see the first account's data.
 */

import { createInitialState } from '../data/initialState';
import { STORAGE_KEY } from './useApp';
import { COACH_API_URL, COACH_CONFIGURED } from './coach';
import { readMeta, writeMeta } from './syncMeta';
import type { Account } from './auth';
import type { AppState } from '../data/types';

function readLocalRaw(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeLocal(state: unknown): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* ignore */
  }
}

/** Preserve a departing account's unpushed blob under a recovery key instead of destroying it.
 *  Only fires when the blob is tagged to an account AND has unpushed changes — a clean blob is
 *  already on the server and needs no copy. */
function stashOrphanIfDirty(meta: { accountId: string; dirtyAt: number | null } | null, localRaw: string | null): void {
  if (!meta || meta.dirtyAt == null || localRaw == null) return;
  try {
    localStorage.setItem('alpha-lifts-orphan-' + meta.accountId, localRaw);
  } catch {
    /* storage full — best effort */
  }
}

/** Does the local blob represent a real, in-use session (vs. a fresh/empty install)? Used to
 *  decide whether anonymous on-device data is worth carrying up on first sign-in. */
function localHasData(raw: string | null): boolean {
  if (!raw) return false;
  try {
    const s = JSON.parse(raw) as Partial<AppState>;
    return s.onboarded === true || (Array.isArray(s.history) && s.history.length > 0) || (Array.isArray(s.dayOrder) && s.dayOrder.length > 0);
  } catch {
    return false;
  }
}

// --- server calls ---------------------------------------------------------------------------

interface ServerState {
  state: unknown;
  version: number;
  updatedAt: number;
}

/** GET /state. Returns null on any network/parse failure (offline, Worker down) — the caller
 *  treats null as "couldn't reach the server" and keeps local as-is. A signed-in account with no
 *  server row yet comes back as `{ state: null, version: 0 }`, which is NOT a failure. */
export async function pullServerState(token: string): Promise<ServerState | null> {
  if (!COACH_CONFIGURED) return null;
  try {
    const res = await fetch(`${COACH_API_URL}/state`, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) return null;
    return (await res.json()) as ServerState;
  } catch {
    return null;
  }
}

export type PushOutcome =
  | { status: 'ok'; version: number; updatedAt: number }
  /** The server row moved past baseVersion (another device pushed) — carries the server's
   *  current copy so the caller can decide LWW without another round trip. */
  | { status: 'conflict'; server: ServerState }
  | { status: 'failed' };

/**
 * PUT /state. `baseVersion` is the server version the pushed blob was based on (from sync-meta):
 * the Worker only accepts the write if the row is still at that version, else 409s with its
 * current copy — the optimistic-concurrency check that stops a stale device from silently
 * overwriting a newer device's data. 'failed' keeps the change marked dirty for retry.
 * `keepalive` lets the pagehide flush outlive the page (bodies over ~64KB may be refused by the
 * browser in that mode — best-effort by design).
 */
export async function pushServerState(
  token: string,
  state: unknown,
  baseVersion: number,
  keepalive = false
): Promise<PushOutcome> {
  if (!COACH_CONFIGURED) return { status: 'failed' };
  try {
    const res = await fetch(`${COACH_API_URL}/state`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ state, baseVersion }),
      keepalive
    });
    if (res.status === 409) {
      const server = (await res.json()) as ServerState;
      return { status: 'conflict', server };
    }
    if (!res.ok) return { status: 'failed' };
    const data = (await res.json()) as { version: number; updatedAt: number };
    return { status: 'ok', version: data.version, updatedAt: data.updatedAt };
  } catch {
    return { status: 'failed' };
  }
}

/** Adopt a server copy locally: write the blob + clean meta. The page must be reloaded (or be
 *  about to mount) for the running app to pick it up — callers own that choice. */
export function adoptServerState(accountId: string, server: ServerState): void {
  writeLocal(server.state);
  writeMeta({ accountId, serverVersion: server.version, dirtyAt: null });
}

/**
 * Final push before a sign-out, reading the blob straight from localStorage (the save effect has
 * already persisted the latest state). One LWW-retry on conflict, then gives up — returns true
 * when nothing unsynced remains. Called by AuthGate.logout so a pending change isn't silently
 * dropped with the session that was the only way to push it.
 */
export async function flushBeforeLogout(token: string, accountId: string): Promise<boolean> {
  if (!COACH_CONFIGURED || !isDirty()) return true;
  const raw = readLocalRaw();
  if (!raw) return true;
  let state: unknown;
  try {
    state = JSON.parse(raw);
  } catch {
    return true; // unreadable local blob — nothing meaningful to flush
  }
  const base = readMeta()?.serverVersion ?? 0;
  let res = await pushServerState(token, state, base);
  if (res.status === 'conflict') {
    if ((readMeta()?.dirtyAt ?? 0) >= res.server.updatedAt) {
      res = await pushServerState(token, state, res.server.version); // local is newer — retry on top
    } else {
      adoptServerState(accountId, res.server); // server is newer — our copy loses, nothing to flush
      return true;
    }
  }
  if (res.status === 'ok') {
    markPushed(accountId, res.version);
    return true;
  }
  return false;
}

// --- reconcile-on-sign-in -------------------------------------------------------------------

/**
 * Runs once when an account becomes active, BEFORE the app reads localStorage. Pulls the server
 * copy, decides what this device should show, and writes it to localStorage + updates sync-meta.
 * After this resolves, `useApp`'s loadInitial reads the reconciled blob.
 *
 * If `dirtyAt` is left set on the resulting meta, the push hook will send local up on mount.
 */
export async function reconcileOnSignIn(token: string, account: Account): Promise<void> {
  if (!COACH_CONFIGURED) return;

  const server = await pullServerState(token);
  const meta = readMeta();
  const localRaw = readLocalRaw();
  const ours = meta?.accountId === account.id;
  const serverHasState = !!server && server.version > 0;

  // Server unreachable: don't touch anything. If the local blob is ours, keep using it offline;
  // if it belongs to someone else we can't safely show it, but with no network there's nothing to
  // replace it with — the account routes are gated server-side anyway, so worst case is a brief
  // offline view that reconciles on the next successful pull.
  if (server === null) {
    if (!ours && meta) {
      // A different account is signing in but we can't reach the server to get their data.
      // Clear to a fresh state rather than showing the previous account's data — but stash the
      // outgoing blob first if it had unpushed changes (they were never on the server; wiping
      // was permanent loss).
      stashOrphanIfDirty(meta, localRaw);
      writeLocal(createInitialState());
      writeMeta({ accountId: account.id, serverVersion: 0, dirtyAt: null });
    } else if (!meta && localHasData(localRaw)) {
      // Anonymous local data, first sign-in, offline: claim it for this account and mark it to
      // push once we're back online.
      writeMeta({ accountId: account.id, serverVersion: 0, dirtyAt: Date.now() });
    } else if (!ours) {
      writeMeta({ accountId: account.id, serverVersion: 0, dirtyAt: null });
    }
    return;
  }

  if (!ours) {
    // Local blob isn't this account's. If it carried unpushed changes for its own account, stash
    // it under an orphan key before replacing it — recoverable rather than gone.
    stashOrphanIfDirty(meta, localRaw);
    if (serverHasState) {
      // Adopt the server copy.
      writeLocal(server.state);
      writeMeta({ accountId: account.id, serverVersion: server.version, dirtyAt: null });
    } else if (!meta && localHasData(localRaw)) {
      // First sign-in for this account, server empty, and there's real anonymous data on this
      // device — carry it up as this account's starting state (the migration path).
      writeMeta({ accountId: account.id, serverVersion: 0, dirtyAt: Date.now() });
    } else {
      // Server empty and either the local data belongs to a different account or there's nothing
      // worth keeping — start this account clean.
      writeLocal(createInitialState());
      writeMeta({ accountId: account.id, serverVersion: 0, dirtyAt: null });
    }
    return;
  }

  // Same account returning to this device.
  const dirty = !!meta && meta.dirtyAt !== null;
  const serverMoved = serverHasState && server.version > (meta?.serverVersion ?? 0);

  if (dirty && serverMoved) {
    // Both sides changed since we last synced — true conflict. Newer wins (LWW).
    if ((meta!.dirtyAt as number) >= server.updatedAt) {
      // Keep local, re-push it. Leave dirtyAt set so the push hook sends it.
      writeMeta({ accountId: account.id, serverVersion: server.version, dirtyAt: meta!.dirtyAt });
    } else {
      writeLocal(server.state);
      writeMeta({ accountId: account.id, serverVersion: server.version, dirtyAt: null });
    }
  } else if (dirty) {
    // Local has unpushed changes and the server hasn't moved — keep local, push it.
    writeMeta({ accountId: account.id, serverVersion: serverHasState ? server.version : 0, dirtyAt: meta!.dirtyAt });
  } else if (serverHasState) {
    // Clean local, server is source of truth (may have changed on another device).
    writeLocal(server.state);
    writeMeta({ accountId: account.id, serverVersion: server.version, dirtyAt: null });
  } else {
    // Ours per meta but the server has no row (e.g. reset server-side). Keep and re-push local.
    writeMeta({
      accountId: account.id,
      serverVersion: 0,
      dirtyAt: localHasData(localRaw) ? Date.now() : null
    });
  }
}

// --- push side ------------------------------------------------------------------------------

/** Mark the local blob as having unpushed changes. Called right before a push is scheduled. */
export function markDirty(accountId: string): void {
  const meta = readMeta();
  writeMeta({
    accountId,
    serverVersion: meta?.serverVersion ?? 0,
    dirtyAt: Date.now()
  });
}

/** Record a successful push: local now matches server at `version`, no longer dirty. */
export function markPushed(accountId: string, version: number): void {
  writeMeta({ accountId, serverVersion: version, dirtyAt: null });
}

export function isDirty(): boolean {
  return readMeta()?.dirtyAt != null;
}
