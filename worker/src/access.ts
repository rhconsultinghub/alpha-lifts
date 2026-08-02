/**
 * Access control — the "is this caller allowed to use the coach?" gate.
 *
 * This is deliberately ONE swappable function (`isEntitled`) sitting next to the budget check,
 * because it's the seam every future monetization model plugs into without touching the rest of
 * the request path:
 *   - private phase (now): an allowlist of approved ids in KV
 *   - public web later:    an active Stripe subscription lookup
 *   - app stores later:    a verified Apple/Google IAP receipt lookup
 * In every case the request path is: verify identity → isEntitled() → checkBudget() → call API.
 *
 * Identity today is the client's device UUID (`userId`), which is NOT a security boundary — it's
 * self-minted and resettable. That's fine for a private, invite-style allowlist you control; it
 * becomes a real, verified account id when the paid phases land. See worker/README.md.
 */

import { findUserById } from './db';

export interface AccessEnv {
  USAGE?: KVNamespace;
  /** "true" turns the allowlist on. Anything else (incl. unset) leaves the gate OFF — allow all,
   *  so an un-configured build behaves like before this feature existed. */
  REQUIRE_ALLOWLIST?: string;
  /** D1 backing accounts. When present, an active subscription on the account is itself an
   *  entitlement — this is the "subscription tied to the account" path the README describes. */
  DB?: D1Database;
}

/** KV key marking a device/account as approved. Presence = allowed; value is unused. */
export function allowKey(userId: string): string {
  return `allow:${userId}`;
}

export async function isEntitled(env: AccessEnv, userId: string): Promise<boolean> {
  // Gate off unless explicitly required.
  if ((env.REQUIRE_ALLOWLIST ?? '').toLowerCase() !== 'true') return true;

  // An active subscription on the account grants access outright — the primary paid path. Only
  // matters when `userId` is a real account id (an authenticated request); a device UUID won't
  // match a users row, so this quietly falls through to the allowlist below. When billing lands,
  // writing `sub_status = 'active'` on the user row is all it takes to entitle them here.
  if (env.DB) {
    const user = await findUserById(env.DB, userId);
    if (user && user.sub_status === 'active') return true;
  }

  // Otherwise fall back to the invite allowlist. Required but no store to check against — fail
  // CLOSED. Unlike the budget check (which fails open on a missing binding, since its job is only
  // to cap spend), an access gate that can't read its list must deny, or "require allowlist"
  // would silently mean "allow everyone" the moment KV is misconfigured.
  const kv = env.USAGE;
  if (!kv) return false;

  return (await kv.get(allowKey(userId))) != null;
}
