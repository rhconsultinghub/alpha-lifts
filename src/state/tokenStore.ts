/**
 * The session token's localStorage cell, in a dependency-free module. auth.ts, coach.ts, and
 * onboarding.ts all need to READ the token, but auth.ts imports from coach.ts (for the Worker
 * URL) — so coach/onboarding reading it via auth would be a cycle, and each previously hardcoded
 * the key string locally. One key, one reader, no cycles.
 */

export const TOKEN_KEY = 'alpha-lifts-auth-token';

export function getStoredToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}
