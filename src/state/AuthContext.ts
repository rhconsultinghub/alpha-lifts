import { createContext, useContext } from 'react';
import type { Account } from './auth';

/**
 * Ambient account info for the authed app. Provided by <AuthGate> and read wherever the UI needs
 * to know who's signed in (Settings account panel) or needs the bearer token (cloud sync, and the
 * coach once it authenticates by account). Kept out of AppState on purpose — see auth.ts.
 *
 * `configured: false` means the Worker URL isn't set, so the app is running anonymous/local-only;
 * `account`/`token` are null and `logout` is a no-op in that mode.
 */
export interface AuthContextValue {
  configured: boolean;
  account: Account | null;
  token: string | null;
  logout: () => void;
}

export const AuthContext = createContext<AuthContextValue>({
  configured: false,
  account: null,
  token: null,
  logout: () => {}
});

export function useAuth(): AuthContextValue {
  return useContext(AuthContext);
}
