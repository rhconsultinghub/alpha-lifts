/**
 * Usage metering.
 *
 * Enforces a per-device monthly spend cap, backed by a KV namespace (binding `USAGE`). When the
 * binding isn't present (e.g. `wrangler dev` without KV, or a build that never created the
 * namespace) it fails OPEN — allows the request and reports `limit: 0` (not enforced) — so a
 * missing binding degrades to the old stub behaviour rather than locking the coach out entirely.
 *
 * Two decisions baked in here, both deliberate:
 *
 * 1. We meter in DOLLARS, not tokens. Token counts are meaningless as a budget — input and
 *    output are priced differently and every model has its own rate. "$1.50 of tokens" only has
 *    a stable meaning as $1.50 of spend.
 * 2. Cost is computed server-side from the API's own `usage` response. A client-reported
 *    count is trivially spoofable by anyone who opens devtools.
 *
 * Scope caveat (unchanged from the design notes): `userId` is a device UUID the client mints,
 * not a verified identity — anyone can clear it for a fresh budget. So this cap limits an
 * ordinary user's spend on their own device; it is NOT a defence against a determined caller
 * forging requests. The real backstop for that is an Anthropic Console monthly spend limit.
 * KV (not D1) is used deliberately here: it's eventually consistent, so two requests racing can
 * both read a stale balance and slightly overshoot — fine for a ~$1.50 personal cap, where a
 * few cents of overshoot is acceptable and simplicity/zero-setup-friction wins.
 */

/** Per-device monthly budget, in micro-dollars. 1,500,000 µUSD = $1.50. */
export const MONTHLY_LIMIT_MICRO_USD = 1_500_000;

/** The KV binding we read/write. Declared structurally so usage.ts doesn't force a KVNamespace
 *  type onto every caller — the real binding satisfies it, and it's optional so a Worker without
 *  the namespace still typechecks and runs (fail-open, see above). */
export interface UsageEnv {
  USAGE?: KVNamespace;
}

/** KV key for a user's spend this calendar month (UTC). A new month = a fresh key = a reset
 *  budget, with no cron needed; old keys self-expire (see recordSpend). */
function periodKey(userId: string): string {
  const now = new Date();
  const month = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
  return `spend:${userId}:${month}`;
}

/** Per-million-token USD pricing, keyed by model id. Update when you change MODEL. */
const PRICING: Record<string, { input: number; output: number }> = {
  'claude-opus-4-8': { input: 5, output: 25 },
  'claude-sonnet-5': { input: 3, output: 15 },
  'claude-haiku-4-5': { input: 1, output: 5 }
};

export interface ApiUsage {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens?: number | null;
  cache_read_input_tokens?: number | null;
}

/** Cost of one API call in micro-dollars (millionths of a dollar), as an integer. */
export function costMicroUsd(model: string, usage: ApiUsage): number {
  const rate = PRICING[model];
  if (!rate) return 0; // unknown model: record zero rather than guess a wrong number

  // Cache writes bill at ~1.25x input, cache reads at ~0.1x. Both are zero today (we don't
  // set cache_control yet) but the terms are here so the number stays right if that changes.
  const inputTokens =
    usage.input_tokens +
    (usage.cache_creation_input_tokens ?? 0) * 1.25 +
    (usage.cache_read_input_tokens ?? 0) * 0.1;

  const usd = (inputTokens / 1_000_000) * rate.input + (usage.output_tokens / 1_000_000) * rate.output;
  return Math.round(usd * 1_000_000);
}

export interface BudgetVerdict {
  allowed: boolean;
  /** Micro-dollars spent this period. */
  spent: number;
  /** Micro-dollars allotted this period. 0 means "not enforced". */
  limit: number;
}

/**
 * Called BEFORE the API request. Reads this device's spend for the current month and blocks
 * once it's at/over the monthly cap. Fails open when KV isn't bound (limit: 0 = not enforced).
 */
export async function checkBudget(env: UsageEnv, userId: string): Promise<BudgetVerdict> {
  const kv = env.USAGE;
  if (!kv) return { allowed: true, spent: 0, limit: 0 };

  const raw = await kv.get(periodKey(userId));
  const spent = raw ? parseInt(raw, 10) || 0 : 0;
  return { allowed: spent < MONTHLY_LIMIT_MICRO_USD, spent, limit: MONTHLY_LIMIT_MICRO_USD };
}

/**
 * Called AFTER a successful API response, with the real cost. Read-modify-write on the month's
 * counter. Not atomic (KV has no atomic increment) — two racing requests can under-count by
 * one, which for a ~$1.50 personal cap is acceptable slop, not a correctness problem. The key
 * is written with a ~40-day TTL so a month's counter self-cleans well after that month ends,
 * refreshed on every write within the month.
 */
export async function recordSpend(env: UsageEnv, userId: string, microUsd: number): Promise<void> {
  const kv = env.USAGE;
  if (!kv || microUsd <= 0) return;

  const key = periodKey(userId);
  const raw = await kv.get(key);
  const spent = raw ? parseInt(raw, 10) || 0 : 0;
  await kv.put(key, String(spent + microUsd), { expirationTtl: 60 * 60 * 24 * 40 });
}
