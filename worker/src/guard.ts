/**
 * Request guards — body-size-capped JSON parsing, input sanitizers for everything that flows
 * into an LLM prompt, and the rate-limiter seam.
 *
 * Two attack surfaces these close (found in the 2026-08 security audit):
 *  - Unbounded request bodies: every route used to `await request.json()` with no size check,
 *    so a huge body was fully parsed into the isolate before any limit applied.
 *  - Unbounded/unvalidated LLM context: the client-supplied `context`/`answers`/`catalog`
 *    objects were joined straight into the (billed) system prompt with no length caps, letting
 *    a forged request stuff megabytes into input tokens. Sanitizers here rebuild each object
 *    field-by-field with hard caps, so nothing unbounded can reach the prompt.
 */

// ---------------------------------------------------------------------------------------------
// Capped JSON body reading

export type CappedJson<T> = { ok: true; value: T } | { ok: false; reason: 'too_large' | 'invalid' };

/**
 * Read + parse a JSON body, refusing anything over `maxBytes`. Checks Content-Length first so an
 * honestly-declared oversized body is rejected without reading it; a chunked/undeclared body is
 * still length-checked after reading, before parsing.
 */
export async function readJsonCapped<T>(request: Request, maxBytes: number): Promise<CappedJson<T>> {
  const declared = parseInt(request.headers.get('Content-Length') || '', 10);
  if (Number.isFinite(declared) && declared > maxBytes) return { ok: false, reason: 'too_large' };

  let text: string;
  try {
    text = await request.text();
  } catch {
    return { ok: false, reason: 'invalid' };
  }
  if (text.length > maxBytes) return { ok: false, reason: 'too_large' };
  try {
    return { ok: true, value: JSON.parse(text) as T };
  } catch {
    return { ok: false, reason: 'invalid' };
  }
}

/** Per-route body ceilings. Auth bodies are an email+password; AI bodies carry the exercise
 *  catalog + program context (~10-20 KB in normal use); state PUT is the whole AppState blob
 *  (server re-checks the serialized size against its own 2 MB cap after parsing). */
export const MAX_AUTH_BODY_BYTES = 8_192;
export const MAX_AI_BODY_BYTES = 65_536;
export const MAX_STATE_BODY_BYTES = 4_000_000;

// ---------------------------------------------------------------------------------------------
// Small sanitize primitives

/** A trimmed string capped at `max` chars, or undefined for anything non-string/empty. */
export function capStr(v: unknown, max: number): string | undefined {
  if (typeof v !== 'string') return undefined;
  const t = v.slice(0, max);
  return t.length ? t : undefined;
}

/** A finite number clamped to [min, max], or undefined. */
export function capNum(v: unknown, min: number, max: number): number | undefined {
  if (typeof v !== 'number' || !Number.isFinite(v)) return undefined;
  return Math.min(max, Math.max(min, v));
}

/** An array of capped strings, dropping non-strings, bounded in count and per-item length. */
export function capStrArray(v: unknown, maxItems: number, maxChars: number): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((x): x is string => typeof x === 'string')
    .slice(0, maxItems)
    .map(x => x.slice(0, maxChars));
}

/** Identity strings that get interpolated into KV keys — strip anything outside [A-Za-z0-9_-]. */
export function sanitizeId(v: unknown): string {
  if (typeof v !== 'string') return 'anonymous';
  const cleaned = v.slice(0, 128).replace(/[^A-Za-z0-9_-]/g, '');
  return cleaned || 'anonymous';
}

// ---------------------------------------------------------------------------------------------
// Catalog sanitizer (shared by coach context, onboarding answers, and parse-plan)

export interface CatalogGroup {
  muscle: string;
  names: string[];
}

/** Rebuild a client-supplied exercise catalog with hard caps: at most `maxGroups` muscle groups,
 *  `maxNames` names per group, `maxChars` chars per name. */
export function sanitizeCatalog(v: unknown, maxGroups = 16, maxNames = 60, maxChars = 80): CatalogGroup[] {
  if (!Array.isArray(v)) return [];
  const out: CatalogGroup[] = [];
  for (const g of v.slice(0, maxGroups)) {
    if (!g || typeof g !== 'object') continue;
    const muscle = capStr((g as { muscle?: unknown }).muscle, 40);
    if (!muscle) continue;
    const names = capStrArray((g as { names?: unknown }).names, maxNames, maxChars);
    if (names.length) out.push({ muscle, names });
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Rate limiting

/** Structural type for the Workers Rate Limiting API binding ([[ratelimits]] in wrangler.toml),
 *  declared here so this compiles regardless of the installed workers-types version. */
export interface RateLimiter {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

/**
 * True if the request may proceed. Fails OPEN when the binding is absent or errors — rate
 * limiting here is an abuse brake, not an access control; the real gates (session auth,
 * entitlement, budget) all fail closed independently.
 */
export async function allowRate(limiter: RateLimiter | undefined, key: string): Promise<boolean> {
  if (!limiter) return true;
  try {
    return (await limiter.limit({ key })).success;
  } catch {
    return true;
  }
}

/** The client IP as seen by Cloudflare — the rate-limit key for unauthenticated routes. */
export function clientIp(request: Request): string {
  return request.headers.get('CF-Connecting-IP') || 'unknown';
}
