# Alpha Lifts — Project Handoff

A mobile-first fitness progress tracker. React + Vite + TypeScript, fully client-side (no
backend — all data lives in `localStorage`), deployed as an installable PWA to GitHub Pages.

Originally ported from a Claude Design prototype (`Fitness App.dc.html`, a single-file
sc-if/sc-for template + JS state machine — not present in this repo, just background on where
the domain logic originated) into a proper typed React app, then extended significantly beyond
the original design across several rounds of feature work.

## Commands

```
npm install
npm run dev       # local dev server, http://localhost:5173
npm run build     # tsc -b && vite build -> dist/ (also generates the PWA service worker/manifest)
npx tsc -b        # typecheck only
```

No test suite exists — verification has been done manually via Playwright browser automation
during development (see "Verification approach" below), not via an automated CI test suite.

## Architecture

Single directional data flow, mirroring the original prototype's `renderVals()` pattern:

```
useApp() (src/state/useApp.ts)
  → { state, actions }               plain AppState object + callback actions, useState-based
buildViewModel(state, actions) (src/state/viewModel.ts)
  → ViewModel                        pure function; pre-computes every string/color/handler a
                                      component needs so components stay dumb/presentational
<Component vm={vm} />                components just read vm.foo.bar, never touch state/actions
                                      or do calculations directly
```

- **`src/state/logic.ts`** — pure calculation functions (recommendation math, muscle volume,
  rest timers, warmup ramp logic, chart data shaping). No React, no state mutation.
- **`src/state/useApp.ts`** — all state + actions. `AppState` shape is `src/data/types.ts`.
  Persisted to `localStorage` (key `fitness-app-state-v1`) via a `useEffect` on every state
  change, loaded via `loadInitial()` which shallow-merges persisted JSON over
  `createInitialState()` defaults — this is how the app survives schema changes across versions
  (new fields fall back to their default instead of `undefined`).
- **`src/state/viewModel.ts`** — the `buildViewModel()` mega-function. If you're adding a new UI
  element that needs data, it almost always goes here, not in the component.
- **`src/data/exercises.ts`** — `EXLIB`, the exercise library (module-level mutable object,
  matches the original prototype's design). Custom user-created exercises are persisted
  separately in `AppState.customExercises` and merged into `EXLIB` on load.
- **`src/data/wizard.ts`** — workout-split presets and the program-builder used by both the
  first-run onboarding screen and the "New Program" wizard in Settings.
- **`src/data/warmups.ts`** — small curated warm-up move library, matched to a day's target
  muscles via greedy set-cover in `logic.ts#warmupForDay`.
- **`src/icons/ExerciseIcon.tsx`** — hand-drawn SVG pictograms per exercise "pattern" (movement
  type, e.g. `bench_press`, `row`, `squat`). No external image assets — everything is inline SVG
  built from primitives, single accent color, duotone body-line strokes for visual weight.
- **`src/components/BodyDiagram.tsx`** — schematic anatomical body map (front/back), muscle
  regions built from rect/circle primitives, opacity = how much that muscle is worked.

### Session-scoped vs. permanent program edits

Mid-workout exercise changes (swap/add/remove) are staged in `state.workout.dayExercises` /
`exSets` and only written back to `state.program` if the user confirms "Update My Plan" on the
completion screen — see `completeWorkout()` and `pendingPlanUpdate` in `useApp.ts`.

## First-run / onboarding

`AppState.onboarded: boolean` gates everything. `App.tsx` renders `OnboardingScreen` exclusively
when `!state.onboarded` — no default program/history is seeded anymore (`createInitialState()`
returns an empty program). Completing onboarding calls `completeOnboarding()`, which reuses the
same wizard build logic as the regular "New Program" flow.

**Back-compat guard**: `loadInitial()` infers `onboarded: true` for any persisted state that has
a non-empty `dayOrder` but no `onboarded` flag (i.e., a session saved before this feature
existed) — otherwise returning users would get forced back through the wizard and lose their
program. Keep this in mind if `AppState` schema changes again around onboarding.

## Deployment

Static PWA on GitHub Pages, project site (not a custom domain), auto-deployed via
`.github/workflows/deploy.yml` on every push to `main`.

- `vite.config.ts`: `base: '/alpha-lifts/'` in production builds (must match the GitHub repo
  name — this repo is named `alpha-lifts`). Dev server stays at `/`.
- `vite-plugin-pwa` generates the manifest + service worker (`registerType: 'autoUpdate'`).
- Icons in `public/`: `icon-192.png`, `icon-512.png`, `icon-maskable-512.png`,
  `apple-touch-icon.png`, `favicon.svg` — all a flexed-arm-holding-a-dumbbell glyph, single
  accent orange (`#f0752f`) on a dark rounded-square background. Source SVG coordinates for this
  glyph aren't kept anywhere separately; if it needs to change, redraw directly in these files
  (see git history around the "Redesign app icon" commit for the hand-tuned circle/line
  coordinates if useful as a starting point).
- To verify a subpath deployment locally (since `vite preview` ignores `base` and always serves
  from `/`), copy `dist/` into a folder literally named `alpha-lifts` and serve its *parent* dir
  with any static file server, then hit `http://localhost:PORT/alpha-lifts/`.

**The user runs everything locally on Windows (PowerShell)** — Node.js and git were both
freshly installed mid-project via `winget`. Known friction points already resolved once, worth
remembering if setup issues resurface:
- PowerShell execution policy blocked `npm.ps1` initially → `Set-ExecutionPolicy -Scope
  CurrentUser -ExecutionPolicy RemoteSigned`, or use `npm.cmd` directly as a workaround.
- `git init` was accidentally run from `C:\Users\Ryan` instead of the project folder once,
  creating a stray `.git` scoped to the entire Windows user profile. Resolved by cloning the
  real GitHub repo fresh and copying files in via `robocopy ... /XD node_modules .git`. If git
  ever starts saying `warning: could not open directory 'AppData/'` or similar, that's the same
  mistake recurring — check `git status` isn't walking up into `C:\Users\Ryan`.
- Project folder now lives at `C:\Users\Ryan\OneDrive\Personal Projects\Alpha Lifts` (inside
  OneDrive — fine for git, but `node_modules` will get synced by OneDrive too unless excluded,
  which can slow down `npm install`/`npm run dev`/`npm run build`).

## Verification approach used throughout this project

No automated test suite. Every change has been manually verified end-to-end using headless
Playwright with real Chromium, launched directly (no local Playwright install — imported from
the global module path and pointed at the sandbox's pre-installed Chromium binary). Pattern:
write a throwaway script under `.verify/`, run it against `npm run dev`, screenshot + read the
result, delete the script afterward. `.verify/` is gitignored. If continuing work in a sandbox
without Playwright pre-installed this way, adapt accordingly.

## Feature history (condensed)

Built in phases: (1) core loop — program/day-view/workout/complete screens, localStorage
persistence; (2) exercises library + CRUD, progress analytics, program wizard/settings; (3)
wizard prefill options, ended-early volume credit, real body-diagram visual, timer-based
exercises (planks), expandable exercise pickers, chart axis labels, muscle drill-down, Rest
Pacing/Coach Voice/Warm-Up Style settings; (4) any-exercise compare-lifts picker with 3-max
limit, date-labeled rest chart, baseline exercise coverage fixes (no more 0%-trained muscles out
of the box), week-by-week review, richer anatomical body diagram, upgraded exercise pictograms,
plan renaming, mid-workout-edit plan-update confirmation prompt; (5) PWA + GitHub Pages
deployment; (6) first-run onboarding wizard (no seeded demo data), redesigned app icon, warm-up
section on Day View.

No open/pending feature work as of this handoff — the app is in a complete, deployed state.
Ask the user what's next.
