/**
 * The sync-meta record: a tiny localStorage entry (separate from the synced blob itself) tagging
 * the local AppState blob with which account it belongs to, which server version it was last
 * reconciled against, and whether it has unpushed local changes.
 *
 * Lives in its own module (rather than sync.ts) so useApp can clear it on Reset App without a
 * useApp ⇄ sync import cycle — sync.ts imports STORAGE_KEY from useApp.
 */

const META_KEY = 'alpha-lifts-sync-meta';

export interface SyncMeta {
  /** Which account the local STORAGE_KEY blob belongs to. */
  accountId: string;
  /** Server `version` we last saw — lets us detect the server moving on from under us. */
  serverVersion: number;
  /** Epoch ms of local's last unpushed change, or null when local is in sync with the server. */
  dirtyAt: number | null;
}

export function readMeta(): SyncMeta | null {
  try {
    const raw = localStorage.getItem(META_KEY);
    return raw ? (JSON.parse(raw) as SyncMeta) : null;
  } catch {
    return null;
  }
}

export function writeMeta(meta: SyncMeta): void {
  try {
    localStorage.setItem(META_KEY, JSON.stringify(meta));
  } catch {
    /* ignore */
  }
}

/** Forget the sync relationship entirely — used by Reset App, so the wiped device doesn't still
 *  claim to be somebody's synced copy at a stale server version. */
export function clearSyncMeta(): void {
  try {
    localStorage.removeItem(META_KEY);
  } catch {
    /* ignore */
  }
}
