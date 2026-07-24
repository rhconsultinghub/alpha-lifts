# Alpha Lifts — AI coach backend

A Cloudflare Worker that proxies the Alpha Lifts chat to the Anthropic API.

## Why this exists

The app is a static PWA on GitHub Pages. It **cannot** call the Anthropic API directly — the
key would be in the JS bundle, which is world-readable. Three things must live here, not in
the client:

1. **The API key.**
2. **The system prompt and topic restriction** (`src/prompt.ts`). If the client sent the system
   prompt, a user could edit the request in devtools and use the key as a general-purpose
   Claude. The Worker ignores any `system` field a client sends and always builds its own.
3. **Usage metering** (`src/usage.ts`). Token counts come back in the API response; the Worker
   converts to dollars. A client-reported number is trivially spoofable.

## Setup

```sh
cd worker
npm install

# Local dev: put the key in .dev.vars (gitignored, never committed)
echo 'ANTHROPIC_API_KEY=sk-ant-...' > .dev.vars
npm run dev            # http://localhost:8787

# Deploy
npx wrangler secret put ANTHROPIC_API_KEY   # encrypted, not in wrangler.toml
npm run deploy
```

Then point the app at it. In `alpha-lifts/.env.local` for dev:

```
VITE_COACH_API_URL=http://localhost:8787
```

For the deployed app, set a **repository variable** named `VITE_COACH_API_URL` (Settings →
Secrets and variables → Actions → Variables) to the Worker's URL. `deploy.yml` passes it into
the build; leaving it unset is supported and just ships the "not configured" tab. It's a
variable rather than a secret because Vite inlines `VITE_*` into the bundle — it is public
either way, and the Worker's origin allowlist is the actual control.

`ALLOWED_ORIGINS` in `wrangler.toml` is set to `https://rhconsultinghub.github.io`, derived
from the git remote (`rhconsultinghub/alpha-lifts` → a project site is always
`https://<owner>.github.io`). It's the **origin only** — no `/alpha-lifts/` path. An origin not
on that list is rejected with a 403 *before* any API call, so a wrong value here shows up as
every request failing while costing nothing.

## Cost controls already in place

| Control | Where | Why |
|---|---|---|
| `MAX_TOKENS = 1024` | `index.ts` | Hard ceiling on cost per message. Fitness answers are short. |
| `MAX_HISTORY_MESSAGES = 20` | `index.ts` | History is re-sent and re-billed every message, so an uncapped chat costs quadratically more as it goes. This is the single most important one. |
| `MAX_MESSAGE_CHARS = 2000` | `index.ts` | Stops one giant paste from costing a lot. |
| `effort: 'low'` | `index.ts` | Short factual answers don't need deep reasoning; also cuts latency. |
| Origin allowlist | `index.ts` | Stops other sites spending your key through this Worker. |
| Per-device monthly cap | `usage.ts` (KV `USAGE`) | Hard $1.50/device/month spend limit — `checkBudget()` blocks (402 `budget_exhausted`) once a device's month-to-date spend hits `MONTHLY_LIMIT_MICRO_USD`. |

At Opus 4.8 pricing ($5/M in, $25/M out), a typical exchange lands around $0.01–0.03 once
context, history, and the coach-actions catalog/stats are included. **The enforced $1.50/device
monthly cap is therefore roughly 75–150 messages.** If that's too few, switching `MODEL` to
`claude-sonnet-5` or `claude-haiku-4-5` (both already priced in `usage.ts`) is a one-line change
— quality drops, message count rises several-fold. To change the cap, edit
`MONTHLY_LIMIT_MICRO_USD` in `usage.ts` (µUSD; 1,500,000 = $1.50) and redeploy.

**The cap is backed by a KV namespace** bound as `USAGE` (`wrangler.toml`). Create it once:

```sh
cd worker
npx wrangler kv namespace create USAGE     # prints an id
# paste that id into wrangler.toml's [[kv_namespaces]] block (replacing the placeholder)
npm run deploy
```

Keys are `spend:<userId>:<YYYY-MM>` (UTC month), self-expiring ~40 days out, so a new month
resets the budget with no cron. `usage.ts` **fails open** if the binding is absent — delete the
`[[kv_namespaces]]` block (or skip creating the namespace) to ship with metering off.

Scope caveat: `userId` is a device UUID the client mints, not a verified identity — clearing it
resets the budget, and a script can send fresh ids. So this cap limits an ordinary user on their
own device; it is not a defence against a determined forger. For that, set an **Anthropic Console
monthly spend limit** as the global backstop (recommended regardless).

## Phase 2 — the subscription wall

Per-device metering is now **implemented** (`checkBudget`/`recordSpend` against KV, see above).
What's still missing before that metering means anything as a *paid product* — two things,
neither built yet:

**1. A native app.** A PWA installed from a URL isn't in any store, so there's no IAP to gate
behind. This means wrapping the app — Capacitor is the natural fit for an existing Vite/React
PWA — and shipping to the App Store / Play Store, with StoreKit 2 or Play Billing for the
subscription itself.

**2. Real user identity.** The app has no accounts; everything is anonymous `localStorage`.
The `userId` the client sends today is a device UUID (`state/coach.ts`) and is **not a security
boundary** — anyone can clear it and get a fresh budget. Per-user billing needs an identity
that survives reinstalls, which means auth plus a server-side user record.

The flow once those exist:

```
App Store / Play  --receipt-->  your server: verify with Apple/Google
                                     |
                                     v
                          user record { userId, periodStart, spentMicroUsd }
                                     |
   app --POST /chat + auth token-->  Worker: checkBudget() -> call API -> recordSpend()
```

`checkBudget()`/`recordSpend()` in `src/usage.ts` are implemented against KV today, keyed on the
device `userId`. For a real paid product, swap that key for the verified user id and consider
**D1** instead of KV — KV is eventually consistent, so concurrent requests can both read a stale
balance (fine for a ~$1.50 personal cap; not fine when charges map to revenue). Slight overspend
is acceptable; silently losing charges is not.

Also worth deciding before you price this:

- **Apple and Google take 15–30%.** A $5 API budget on a $9.99/mo subscription leaves roughly
  $2.50–3.50 of margin before infrastructure. Sanity-check the price against real measured
  usage before committing to "$5 of tokens" publicly.
- **Verify receipts server-side.** A client-reported "I'm subscribed" is spoofable in exactly
  the same way the token count would be.
- **Add a rate limit** (per-minute, per-user) alongside the budget. The budget caps the month;
  it doesn't stop a script burning it all in ten minutes.

## Access allowlist

An optional invite-style gate: while on, only pre-approved ids may use the coach. It's the
private-phase form of a single, swappable "is this caller entitled?" check (`src/access.ts`) that
the paid phases later replace with a subscription/receipt lookup — the rest of the request path
(`isEntitled → checkBudget → API`) doesn't change.

Turn it on by setting `REQUIRE_ALLOWLIST = "true"` in `wrangler.toml` (default `"false"` = gate
off, anyone whose Origin is allowed can use the coach) and redeploy. Approve an id:

```sh
# The id is shown to each user at the bottom of the Coach tab ("Coach ID: …").
npx wrangler kv key put --binding=USAGE "allow:<coach-id>" "1"
# Revoke:
npx wrangler kv key delete --binding=USAGE "allow:<coach-id>"
```

Approved ids live as `allow:<id>` keys in the same `USAGE` KV namespace as the spend counters. An
unapproved caller gets a 403 `not_entitled` (mapped client-side to a "share your Coach ID" message
next to the id). Fails **closed** when the gate is required but KV is missing — a "require
allowlist" that couldn't read its list must deny, not allow.

Caveat, same as the budget: the id is a device UUID, not a verified identity — someone can mint a
new one, and you'd have to approve each. Fine for an invite list you control; it becomes a real
account id in the paid phases.

## Topic restriction

`src/prompt.ts` handles this with a system prompt: in-scope is the app, the user's own program
and history, and general fitness; everything else is declined. It also carves out two cases
that need care rather than a flat refusal — actual injuries (refer to a professional, don't
diagnose) and nutrition (everyday guidance yes, very-low-calorie or ED-adjacent no).

The prompt is the whole enforcement mechanism today, and that's a deliberate call: the worst
case for a determined user is wasting **their own** budget on off-topic questions, so the
budget cap is itself the backstop. If you later want a harder gate, the standard approach is a
cheap Haiku classifier call on the user's message before the main request — worth adding when
there's revenue attached, not before.
