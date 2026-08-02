import { useEffect, useRef, useState } from 'react';
import { reconcileOnSignIn } from '../state/sync';
import type { Account } from '../state/auth';

/**
 * Runs the sign-in reconcile (pull server state + decide what this device shows) BEFORE mounting
 * the app, so `useApp` reads an already-reconciled localStorage blob — no flash of stale data that
 * then swaps under the user.
 *
 * When there's no token/account (accounts not configured, or offline anonymous), it renders the
 * app immediately — reconcile is a no-op without an account.
 */
export function SyncBoundary({
  token,
  account,
  children
}: {
  token: string | null;
  account: Account | null;
  children: React.ReactNode;
}) {
  const [ready, setReady] = useState(() => !token || !account);
  const ran = useRef(false);

  useEffect(() => {
    if (!token || !account) {
      setReady(true);
      return;
    }
    if (ran.current) return; // guard StrictMode's double-invoke
    ran.current = true;
    reconcileOnSignIn(token, account).finally(() => setReady(true));
  }, [token, account]);

  if (!ready) {
    return (
      <div className="app-shell">
        <div
          className="scr"
          style={{
            background: '#0f0e0d',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: '100%',
            color: 'rgba(245,240,234,.4)',
            font: "400 13px 'Inter'"
          }}
        >
          Syncing your training…
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
