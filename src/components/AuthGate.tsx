import { useEffect, useRef, useState } from 'react';
import {
  AUTH_CONFIGURED,
  clearSession,
  fetchMe,
  getCachedAccount,
  getToken,
  type Account
} from '../state/auth';
import { AuthContext } from '../state/AuthContext';
import { flushBeforeLogout } from '../state/sync';
import { LoginScreen } from './LoginScreen';
import { SyncBoundary } from './SyncBoundary';

/**
 * Decides whether to show the app or the sign-in screen, and provides account/token to everything
 * below via AuthContext.
 *
 * Three cases:
 *  - Accounts not configured (no Worker URL): render the app anonymous/local-only, exactly as
 *    before accounts existed. No gate.
 *  - A stored token: show the app immediately using the cached account (so a returning user isn't
 *    bounced to a login flash), and revalidate the token in the background. Only a definitive
 *    "unauthorized" from the server signs them out — a network failure keeps them in (offline PWA).
 *  - No token: show the sign-in screen.
 */

type Phase = 'checking' | 'anon' | 'authed';

export function AuthGate({ children }: { children: React.ReactNode }) {
  const [account, setAccount] = useState<Account | null>(() => getCachedAccount());
  const [token, setToken] = useState<string | null>(() => getToken());
  const [phase, setPhase] = useState<Phase>(() => {
    if (!AUTH_CONFIGURED) return 'authed';
    const t = getToken();
    if (!t) return 'anon';
    // Have a token + a cached account → straight into the app, revalidate in the background.
    // Token but no cached account (rare) → 'checking' until /auth/me resolves.
    return getCachedAccount() ? 'authed' : 'checking';
  });

  // Revalidate a stored token once on mount. The `validated` ref both prevents a duplicate fetch
  // and makes this idempotent under React StrictMode's double-invoke — deliberately NO cancel-on-
  // cleanup flag here: StrictMode runs the cleanup after the first invoke, and a cancel flag would
  // then discard the (single, ref-guarded) fetch's result, dropping the account refresh entirely.
  const validated = useRef(false);
  useEffect(() => {
    if (!AUTH_CONFIGURED || !token || validated.current) return;
    validated.current = true;
    fetchMe(token).then(res => {
      if (res.ok) {
        setAccount(res.account);
        setPhase('authed');
      } else if (res.reason === 'unauthorized') {
        // Token is bad/expired — sign out cleanly.
        clearSession();
        setToken(null);
        setAccount(null);
        setPhase('anon');
      } else {
        // Network failure. Stay signed in if we have a cached account; otherwise there's nothing
        // to show, so fall back to the sign-in screen (they can retry when back online).
        setPhase(prev => (prev === 'checking' ? (getCachedAccount() ? 'authed' : 'anon') : prev));
      }
    });
  }, [token]);

  function handleSuccess(newToken: string, newAccount: Account) {
    // signup()/login() already persisted the session; just reflect it in state.
    setToken(newToken);
    setAccount(newAccount);
    setPhase('authed');
  }

  async function logout() {
    // Push any unsynced change up BEFORE dropping the session — signing out used to discard a
    // pending debounced push, and the token it needed to send was gone. Bounded so a dead
    // network can't trap the user in a sign-out that never completes; on timeout/failure the
    // blob simply stays local (sign-out never deletes it), and syncs on the next sign-in.
    if (token && account) {
      await Promise.race([
        flushBeforeLogout(token, account.id),
        new Promise(resolve => setTimeout(resolve, 4000))
      ]).catch(() => {});
    }
    clearSession();
    setToken(null);
    setAccount(null);
    setPhase('anon');
  }

  if (phase === 'checking') {
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
          Loading…
        </div>
      </div>
    );
  }

  if (phase === 'anon') {
    return <LoginScreen onSuccess={handleSuccess} />;
  }

  function refreshSession(newToken: string, newAccount: Account) {
    setToken(newToken);
    setAccount(newAccount);
  }

  return (
    <AuthContext.Provider value={{ configured: AUTH_CONFIGURED, account, token, logout, refreshSession }}>
      <SyncBoundary token={token} account={account}>
        {children}
      </SyncBoundary>
    </AuthContext.Provider>
  );
}
