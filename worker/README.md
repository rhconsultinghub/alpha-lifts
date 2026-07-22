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

At Opus 4.8 pricing ($5/M in, $25/M out), a typical exchange lands around $0.01–0.03 once
context and history are included. **A $5 monthly budget is therefore roughly 150–400 messages.**
If that's too few, switching `MODEL` to `claude-sonnet-5` or `claude-haiku-4-5` (both already
priced in `usage.ts`) is a one-line change — quality drops, message count rises several-fold.

## Phase 2 — the subscription wall

Two things must exist before metering means anything, and neither is built yet:

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

Fill in `checkBudget()` and `recordSpend()` in `src/usage.ts` against KV or D1. **Prefer D1** —
KV is eventually consistent, so concurrent requests can both read a stale balance. Slight
overspend on $5 is fine; silently losing charges is not.

Also worth deciding before you price this:

- **Apple and Google take 15–30%.** A $5 API budget on a $9.99/mo subscription leaves roughly
  $2.50–3.50 of margin before infrastructure. Sanity-check the price against real measured
  usage before committing to "$5 of tokens" publicly.
- **Verify receipts server-side.** A client-reported "I'm subscribed" is spoofable in exactly
  the same way the token count would be.
- **Add a rate limit** (per-minute, per-user) alongside the budget. The budget caps the month;
  it doesn't stop a script burning it all in ten minutes.

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
