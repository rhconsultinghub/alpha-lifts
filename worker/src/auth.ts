/**
 * Auth primitives — password hashing and stateless session tokens.
 *
 * Everything here is built on WebCrypto (`crypto.subtle`), which is available in the Workers
 * runtime with no dependency. Two independent pieces:
 *
 *  1. Password hashing — PBKDF2-HMAC-SHA256. Stored as a self-describing string
 *     `pbkdf2$<iterations>$<salt-b64url>$<hash-b64url>` so the parameters travel with the hash and
 *     can be raised later without breaking existing rows (verify reads the iteration count out of
 *     the stored value, it isn't hardcoded on the verify path).
 *
 *  2. Session tokens — a compact JWT (HS256) signed with the `SESSION_SECRET` Worker secret. The
 *     token carries only the user id and an expiry; the server re-verifies the signature on every
 *     request, so nothing about identity is trusted from the client beyond "this token verifies."
 *     Stateless by design: no session table to read, and signing out is client-side (drop the
 *     token) — acceptable because tokens are short-lived. Bumping SESSION_SECRET invalidates all
 *     outstanding tokens at once, which is the break-glass revoke.
 */

// --- base64url helpers (JWT + hash encoding) ------------------------------------------------

function b64urlEncode(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlDecode(s: string): Uint8Array {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4));
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + pad);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

const enc = new TextEncoder();

/** Constant-time-ish string compare. Both inputs are our own base64url, equal length in the
 *  happy path; short-circuiting on length is fine (it isn't the secret). */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// --- password hashing -----------------------------------------------------------------------

const PBKDF2_ITERATIONS = 100_000;
const PBKDF2_HASH_BITS = 256;

async function deriveBits(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    key,
    PBKDF2_HASH_BITS
  );
  return new Uint8Array(bits);
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await deriveBits(password, salt, PBKDF2_ITERATIONS);
  return `pbkdf2$${PBKDF2_ITERATIONS}$${b64urlEncode(salt)}$${b64urlEncode(hash)}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 4 || parts[0] !== 'pbkdf2') return false;
  const iterations = parseInt(parts[1], 10);
  if (!Number.isFinite(iterations) || iterations <= 0) return false;
  const salt = b64urlDecode(parts[2]);
  const hash = await deriveBits(password, salt, iterations);
  return timingSafeEqual(b64urlEncode(hash), parts[3]);
}

// --- session tokens (JWT, HS256) ------------------------------------------------------------

export interface SessionPayload {
  /** user id */
  sub: string;
  /** issued-at, epoch seconds */
  iat: number;
  /** expiry, epoch seconds */
  exp: number;
}

/** Token lifetime. Long enough that a daily user rarely re-logs in; short enough that a leaked
 *  token isn't valid forever. The client silently re-logs in on a 401. */
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
    'verify'
  ]);
}

export async function signSession(userId: string, secret: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = b64urlEncode(enc.encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' })));
  const payload: SessionPayload = { sub: userId, iat: now, exp: now + SESSION_TTL_SECONDS };
  const body = b64urlEncode(enc.encode(JSON.stringify(payload)));
  const signingInput = `${header}.${body}`;
  const sig = await crypto.subtle.sign('HMAC', await hmacKey(secret), enc.encode(signingInput));
  return `${signingInput}.${b64urlEncode(new Uint8Array(sig))}`;
}

/** Verify signature + expiry. Returns the payload on success, null on any failure (bad shape,
 *  bad signature, expired). Never throws — callers treat null as "not authenticated". */
export async function verifySession(token: string, secret: string): Promise<SessionPayload | null> {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [header, body, sig] = parts;
  const signingInput = `${header}.${body}`;
  let valid: boolean;
  try {
    valid = await crypto.subtle.verify('HMAC', await hmacKey(secret), b64urlDecode(sig), enc.encode(signingInput));
  } catch {
    return null;
  }
  if (!valid) return null;

  let payload: SessionPayload;
  try {
    payload = JSON.parse(new TextDecoder().decode(b64urlDecode(body)));
  } catch {
    return null;
  }
  if (typeof payload.sub !== 'string' || typeof payload.exp !== 'number') return null;
  if (payload.exp < Math.floor(Date.now() / 1000)) return null;
  return payload;
}

/** Pull the bearer token out of an Authorization header and verify it. Central helper so every
 *  authenticated route derives identity the same way — from the token, never from the body. */
export async function authenticate(request: Request, secret: string): Promise<SessionPayload | null> {
  const header = request.headers.get('Authorization');
  if (!header || !header.startsWith('Bearer ')) return null;
  return verifySession(header.slice(7).trim(), secret);
}
