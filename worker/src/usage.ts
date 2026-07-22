/**
 * Usage metering.
 *
 * STUBBED FOR THE TEST PHASE — this records cost and always allows the request. The shape
 * is the real one, so turning enforcement on later is filling in two function bodies plus a
 * KV binding, not a rewrite of the request path.
 *
 * Two decisions baked in here, both deliberate:
 *
 * 1. We meter in DOLLARS, not tokens. Token counts are meaningless as a budget — input and
 *    output are priced differently and every model has its own rate. "$5 of tokens" only has
 *    a stable meaning as $5 of spend.
 * 2. Cost is computed server-side from the API's own `usage` response. A client-reported
 *    count is trivially spoofable by anyone who opens devtools.
 */

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
 * Called BEFORE the API request. Today: always allows.
 *
 * Phase 2 (real subscribers): look up `userId` in KV/D1, compare spend against the period's
 * allotment, and return allowed:false when over. That userId must come from a verified
 * subscription receipt — see README. The device UUID the client sends today is a stand-in
 * with no security value: anyone can generate a new one to reset their own budget.
 */
export async function checkBudget(_env: unknown, _userId: string): Promise<BudgetVerdict> {
  return { allowed: true, spent: 0, limit: 0 };
}

/**
 * Called AFTER a successful API response, with the real cost.
 *
 * Phase 2: atomically increment the user's period spend. Note KV is eventually consistent —
 * if exact accounting matters, use D1 (or Durable Objects) rather than KV here. Slight
 * over-spend on a $5 budget is acceptable; double-counting or silent loss is not.
 */
export async function recordSpend(_env: unknown, _userId: string, _microUsd: number): Promise<void> {
  // no-op during the test phase
}
