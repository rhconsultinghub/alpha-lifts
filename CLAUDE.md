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

No test suite exists — verification has been done manually via browser automation during
development (see "Verification approach" below), not via an automated CI test suite.

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
  type, e.g. `bench_press`, `row`, `squat`), used as the fallback for any exercise without a
  bundled photo (see below). Single accent color, duotone body-line strokes for visual weight.
- **`src/components/BodyDiagram.tsx`** — anatomical body map (front/back). Renders the real
  reference images (`public/body-front.png` / `body-back.png`, 482x973 / 470x966px, color-inverted
  light line art on near-black — see phase 11 for why) with **per-muscle CSS `mask-image` tint
  layers** whose alpha masks (`public/muscle-masks/{view}-{slug}.png`, 14 files, ~38KB total) are
  generated from the artwork's own pixels by `scripts/make-muscle-masks.mjs` (kept in the repo;
  run `npm install --no-save sharp` then `node scripts/make-muscle-masks.mjs` if the reference
  images ever change). Opacity per muscle = how much that muscle is worked (`fillForMuscle`). The
  generator thresholds the line art, connected-component labels the closed drawn compartments,
  auto-assigns each compartment to a muscle by majority overlap with the old hand-traced hint
  polygons (which live on in the script as assignment hints), and takes manual `seeds`/`patchLines`
  overrides for compartments the art doesn't close (see the script's config comments — e.g. the
  art has no closed skull-base line, no wrist lines, and the thigh runs open through the knee into
  the shin). Containment is exact by construction — a fill cannot cross a drawn line — which is
  what replaced the previous hand-traced SVG polygon overlay after six calibration passes
  (phases 9-32) never fully stopped the bleeding. Masks are emitted at native image dimensions so
  `mask-size: contain` + `mask-position: center` letterbox identically to the `<img>`'s
  `objectFit: contain` at any render size; a `CSS.supports` guard keeps unsupported browsers at
  no-highlight instead of painting an unmasked accent rectangle (masks are alpha-type — CSS
  `mask-mode` defaults to alpha for raster images, so they must be emitted as grey+alpha PNGs).
- **`src/data/exercisePhotos.ts`** + **`public/exercise-photos/*.jpg`** — real reference photos.
  `EXERCISE_PHOTO_IDS` is the allowlist of exercise ids that have a bundled photo — as of this
  writing that's all 151 exercises (137 from free-exercise-db, github.com/yuhonas/free-exercise-db,
  public domain/Unlicense; the remaining 14 from user-supplied photos, cropped from a labeled
  collage — see "Exercise library" below). Anything not in that set (i.e. any custom user-created
  exercise) has no photo and `ExercisePhoto.tsx` falls back to the `ExerciseIcon` pictogram.
  Photos are bundled (not hotlinked) so the PWA stays fully offline-capable —
  `vite.config.ts`'s Workbox `globPatterns` includes `jpg` for this reason; if a future asset type
  is added to `public/`, remember to extend that glob or it won't be precached for offline use.

### Exercise library

`EXLIB` in `src/data/exercises.ts` is two eras of data back to back: the original ~90
hand-curated exercises (bespoke cues, rest times, rep ranges, multi-equipment variants), followed
by a block of 67 exercises imported from `free-exercise-db`. All 151 exercises now have a photo.
The 67 imported ones got a photo as part of that import; of the original ~90, 70 were matched
afterward by name/muscle against the free-exercise-db catalog, and the remaining 14 (niche/coined
names free-exercise-db doesn't have — Pec Deck, Chest-Supported Row, Bulgarian Split Squat, Hip
Abduction Machine, Kelso Shrug, Pendlay Row, Seal Row, Meadows Row, Landmine Press, Cossack
Squat, Nordic Curl, Suitcase Carry, Copenhagen Plank, Larsen Press) got user-supplied photos
instead — 13 of those were cropped out of one labeled collage image (grid-calibrated crop
boundaries the same way the body-diagram overlay was calibrated: composite a coordinate grid over
the source with `sharp`, read it, crop each cell, then `trim()` each crop since the crop box
still includes a sliver of the text label above the photo that a plain background-color trim
won't remove on its own — the crop's *top* edge needs to start below the label text, trim only
cleans up the remaining uniform white margin after that). Neither the collage nor the standalone
Chest-Supported-Row source image is kept in the repo; if these ever need re-cropping, they'd need
to be re-supplied.

Both the import and the later name-matching pass were one-off curation, not a live sync — there's
no script left in the repo that re-runs either. If asked to pull in more exercises or photos from
that source later:
- Its muscle taxonomy differs from this app's 11-muscle `Muscle` type and needs mapping (e.g.
  `lats`/`middle back`/`lower back`/`traps` all collapse to `'Back'` here); its `equipment` field
  is one value per exercise rather than this app's multi-equipment-variant model, so equivalent
  entries (e.g. a barbell and dumbbell version of the same movement) need to be merged by hand or
  heuristic, not imported as separate exercises, or the library balloons with near-duplicates.
  It also has no rep range or rest-time data, since it's not built around a sets/reps/weight
  training model — those need reasonable heuristic defaults.
- Check exercise ids against the existing `EXLIB` keys before merging — `calf_raise` collided
  with an existing entry during the exercise-data import and had to be renamed to
  `calf_raise_machine`; it's not a naming convention, just how that particular collision was
  resolved.
- Name-matching by string similarity alone produces confidently-wrong matches at a meaningful
  rate (e.g. an early automated pass matched "Barbell Row" to "Sled Row" and "Zercher Squat" to
  plain "Barbell Squat" — same score tier as several correct matches, but visually/equipment-wise
  wrong). Spot-check matches against what the exercise actually is before trusting a score-based
  pick, especially for anything equipment-specific or a named variant of a more generic movement.
- Photos live at `exercises/{free-exercise-db id}/0.jpg` on that repo's `main` branch
  (`https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/...`); each new
  exercise matched from there should get a matching photo added to both `EXERCISE_PHOTO_IDS` and
  `public/exercise-photos/`.

### Exercise/warm-up "how to" content + video tutorials

Every exercise's `cue` field (in `EXLIB`) and every warm-up move's `howTo` field (in
`WARMUP_LIBRARY`, `src/data/warmups.ts`) is a real, multi-sentence instructional write-up, and
most also carry a `videoId` (YouTube video id, embedded via `src/components/VideoEmbed.tsx` using
the `youtube-nocookie.com` domain) — a real, individually-verified tutorial video, not a
placeholder or a search-results link. **Every single `videoId` in this codebase was obtained by
actually calling WebSearch per exercise/move (restricted to `youtube.com`) and extracting the id
from a real returned URL — never guessed or pattern-generated.** If more exercises are added
later and need videos, follow the same process; do not fabricate a plausible-looking video id, a
wrong/dead video is worse than no embed (see `VideoEmbed`'s empty-state handling — callers check
`videoId` truthiness before rendering it, so a missing id just omits the embed cleanly).

Warm-up moves have two separate text fields — don't conflate them: `cue` is the short dosage
shown inline in the Day View warm-up list (e.g. `"20 sec each direction"`), `howTo` is the longer
instructional text shown when a move is tapped for detail
(`DayViewScreen.tsx` warm-up row → `WarmupDetailModal.tsx`). Exercises only have `cue` (used as
the full "how to" write-up in `ExerciseDetailModal.tsx`/`LibraryExerciseDetailModal.tsx`) — there
was no separate dosage field to preserve there.

Sourcing ~151 exercises' + 15 warm-up moves' videos and write-ups in one pass was done via 9
parallel background research agents (one per ~19-exercise batch, one for all warm-ups), each
independently running one WebSearch call per item and writing its own `{id, videoId, howTo}[]`
JSON result file, which were then merged into `exercises.ts`/`warmups.ts` with a small Node script
matching on id. Worth reusing that batched-parallel-agent pattern again for any similarly-sized
"look up N real things and write content about them" task — doing it as 150 sequential tool calls
in the main conversation would be far slower.

### Session-scoped vs. permanent program edits

Mid-workout exercise changes (swap/add/remove) are staged in `state.workout.dayExercises` /
`exSets` and only written back to `state.program` if the user confirms "Update My Plan" on the
completion screen — see `completeWorkout()` and `pendingPlanUpdate` in `useApp.ts`.

Separately, the muscle drill-down modal (tap a muscle bar on the Program screen) has its own
lighter-weight "switch exercise" quick action (`MuscleSwapModal.tsx` / `MuscleSwapState` in
`types.ts`) that edits `state.program` directly and immediately — it's for permanent plan edits
from outside a workout session, not the mid-workout staging flow above. Its one wrinkle: the same
exercise id can appear on more than one program day (e.g. both Lower days in an Upper/Lower
split), so it lets the user pick which of those day(s) the replacement applies to rather than
assuming "all of them" or "just the one they clicked."

### Weekly completion tracking

`AppState.weekNumber` / `weekStartedAt` track the *active* week by actual completion, not
calendar time — `isWeekComplete()` in `logic.ts` checks whether every training day
(`kind !== 'rest'`) has been completed or skipped on or after `weekStartedAt`. `useApp.ts` checks
this after every `completeWorkout()` and `toggleSkipDay()`; once true, it bumps `weekNumber`,
resets `weekStartedAt` to now, and clears `skipped`/`lastCompletedAt` on every training day so the
Program screen shows a clean slate immediately, rather than waiting out the remaining calendar
days. `weekNumber`/`weekStartedAt` are per-program state (mirrored into `SavedProgram` alongside
`startedAt`) — carry them through anywhere a program is duplicated or switched, or the week
counter will silently reset.

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

**Live at `https://rhconsultinghub.github.io/alpha-lifts/`** — note the owner is
`rhconsultinghub`, not the user's personal handle. Anything that needs the deployed *origin*
(the Worker's `ALLOWED_ORIGINS`, for one) wants `https://rhconsultinghub.github.io` with no path.

**Two separate deploy targets — don't conflate them.** The *frontend* auto-deploys via Pages on
every push to `main` (no manual step). The *Worker* does NOT — it only updates when someone runs
`wrangler deploy` manually, and it must be run **from `L:\Personal Projects\Alpha Lifts\alpha-lifts\worker`**
(the only git-connected copy — see the Windows notes about the deleted stale Desktop copy). This bit
once for real: a `wrangler deploy` from the old Desktop copy shipped pre-accounts Worker code, so every
`/auth/*` route 404'd and signup failed with a generic error even though the frontend looked correct
and healthy. To diagnose "is the *deployed* Worker actually current?", hit it directly — e.g.
`GET https://alpha-lifts-coach.alpha-lifts.workers.dev/state` returns 401 on current code but 405 on the
old coach-only Worker; `POST /auth/signup` returns 201/400-validation on current code but `{"error":"No
messages"}` (the coach handler) on old code. The deployed Worker is
**`https://alpha-lifts-coach.alpha-lifts.workers.dev`** (worker name `alpha-lifts-coach`,
account subdomain `alpha-lifts`), which is what `VITE_COACH_API_URL` points to.

- `vite.config.ts`: `base: '/alpha-lifts/'` in production builds (must match the GitHub repo
  name — this repo is named `alpha-lifts`). Dev server stays at `/`.
- **`VITE_COACH_API_URL` must be a repository variable under the *Actions* scope** (Settings →
  Secrets and variables → **Actions** → Variables) for the AI coach to work in the deployed app.
  Vite inlines it at build time, so changing it requires a rebuild — an existing artifact will
  never pick it up. `deploy.yml` also accepts it as an Actions *secret*. It is not secret in any
  meaningful sense (it ends up in the JS bundle); the Worker's origin allowlist is the real
  control. Unset is supported and ships a "not configured" coach tab. See phase 33 for the
  scope trap that makes a wrong placement here almost invisible.
- `vite-plugin-pwa` generates the manifest + service worker (`registerType: 'autoUpdate'`, custom
  `src/sw.ts` via `injectManifest`). SW registration is **manual** (`injectRegister: false` +
  `registerSW()` in `main.tsx`), not the plugin's injected script — see phase 39 for why (the injected
  one never reloaded on update, so installed PWAs needed a reinstall to update).
- Icons in `public/`: `icon-192.png`, `icon-512.png`, `icon-maskable-512.png`,
  `apple-touch-icon.png`, `favicon.svg` — all a flexed-arm-holding-a-dumbbell glyph, single
  accent orange (`#f0752f`) on a dark rounded-square gradient background (`#241d15` → `#120f0a`).
  Current version was generated from a user-supplied reference PNG (flat black background, no
  transparency) by luminance-keying the background to transparent and compositing the resulting
  glyph onto that gradient at each icon's target size — not hand-drawn SVG coordinates this time.
  The generation script wasn't kept (it was a one-off Node + `sharp` script run outside the repo);
  if the icon needs to change again, either redraw by hand or rebuild a similar keying script from
  a new reference image. `favicon.svg` embeds a base64 PNG of the same glyph rather than being
  pure vector, for the same reason. The maskable icon keeps its content inside the centered 80%
  "safe zone" diameter per the W3C maskable-icon spec, since platforms crop it to their own shape.
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
- **Project folder is at `L:\Personal Projects\Alpha Lifts\alpha-lifts`** — this is the ONLY live,
  git-connected copy. Earlier handoffs had it under OneDrive, then the Desktop
  (`C:\Users\Ryan\Desktop\Personal Projects\...`); both of those are gone/stale. The Desktop copy in
  particular caused a real production incident: a `wrangler deploy` run from that stale Desktop copy
  shipped **old** Worker code (pre-accounts), so the live Worker 404'd every `/auth/*` route and
  account signup failed with a generic error while the (Pages-deployed) frontend looked fine — see
  the deployment section's Worker-deploy note. The Desktop copy was confirmed safe to delete
  (old commit, clean tree, nothing unpushed, its one backup byte-identical to `L:\…\Backups`) and
  removed. If the folder ever moves again, update this note, since tooling that hardcodes a path
  (e.g. a dev-server launcher config) will silently break otherwise.
- Windows paths with spaces (this one has several) can trip up tools that spawn child processes
  without proper quoting/escaping. A directory junction (`mklink /J` or PowerShell's
  `New-Item -ItemType Junction`) pointed at the real project folder works as a space-free
  stand-in when needed — just confirm the junction actually resolves (`Get-Item` through it)
  before relying on it, since a mis-quoted target silently creates a broken link rather than
  erroring.

## Verification approach used throughout this project

No automated test suite. Every change has been manually verified end-to-end via browser
automation against `npm run dev`. Two approaches have been used depending on what the sandbox
provides:
- Headless Playwright with real Chromium, launched directly (no local Playwright install —
  imported from the global module path and pointed at the sandbox's pre-installed Chromium
  binary).
- The harness's own browser-automation tools, when available, driving a real dev-server preview
  directly (navigate/click/read page text/read console/exec JS in-page) — no Playwright install
  needed at all in that case. Screenshot capture has been flaky in that tool in at least one
  session; when it hangs, `get_page_text`/`read_page`/in-page `javascript_exec` (e.g. reading
  `<img>` `naturalWidth`/`complete`, or serializing an SVG's live DOM markup and rasterizing it
  separately with `sharp` to actually look at it) covers the same ground without needing a working
  screenshot call.

For non-visual data/pipeline work (e.g. mapping an external dataset into this app's schema),
throwaway Node scripts under `.verify/` (gitignored) have also been used for scratch computation
— e.g. auditing every split/training-type combo's resulting volume % and estimated day time
across all wizard presets, or curating the free-exercise-db import — deleted once the resulting
change was integrated into the actual source files.

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
section on Day View; (7) recommended-plan set-count/rest-time rebalance so default programs land
near 100% of weekly muscle target instead of routinely overshooting it, and no default day is
estimated to run more than ~90 min; weekly-volume heatmap and consistency chart now reflect real
logged history instead of synthetic variance for users with no (or partial) history; week
rollover now triggers on actual completion of every training day rather than waiting out 7
calendar days; muscle drill-down quick "switch exercise" action (can target more than one day at
once); 67 more exercises + reference photos imported from free-exercise-db into the exercise
library; new app icon; body diagram redrawn with organic per-muscle shapes instead of plain
rects/circles; (8) immediate same-session follow-up on phase 7 — matched reference photos onto
the *original* ~90 hand-curated exercises too (137 of 151 now have a real photo, up from just the
67 imported ones), reworked the Consistency chart into a real Mon-Sun calendar heatmap with
weekday headers instead of an unlabeled rolling window that silently assumed a fixed weekday
training schedule (broken by the week-rollover-on-completion change in phase 7), and redrew the
body diagram again with every region's shape deliberately overlapping its neighbor so it reads as
one continuous figure instead of disconnected floating parts; (9) another same-session follow-up
— the body diagram now renders the actual reference image itself (cropped front/back PNGs) with a
calibrated shading overlay, instead of a hand-drawn approximation of it, since phase 8's
from-scratch redraw still wasn't judged a faithful use of the reference; matched a real,
individually-verified YouTube tutorial video to all ~151 exercises and all 15 warm-up moves
(`VideoEmbed.tsx`), sourced via 9 parallel background research agents; every exercise's "how to"
text and every warm-up move's new `howTo` field rewritten as a real multi-sentence write-up
instead of a one-line cue; warm-up moves are now tappable for a detail view
(`WarmupDetailModal.tsx`) with that write-up + video; (10) filled the last exercise-photo gap —
the 14 exercises with no free-exercise-db match got user-supplied photos (cropped from a labeled
collage), so all 151 exercises now have a real photo, none left on the icon fallback; (11) added
exercise search to the Exercises tab (`exerciseSearchQuery` in `AppState`) — a single text input
that matches against both exercise name and muscle name (case-insensitive substring), so e.g.
typing "row" finds every row variant and typing "chest" finds every chest exercise via muscle
match, satisfying "search by name or muscle" with one field rather than two separate controls;
added user-supplied photos for the last 14 gap exercises (13 cropped from one labeled collage,
1 standalone), so all 151 exercises now have a real bundled photo; re-calibrated the muscles-worked
diagram overlay a second time (shoulders/arms/rear-delts/traps/triceps were still bleeding past
their outlines after phase 9's first calibration pass) and inverted the reference images to light
line art on a dark background, replacing the white background card the user flagged as sticking
out against the rest of the UI (see `BodyDiagram.tsx` notes above); `estimateDayTime()` in
`logic.ts` now blends its static per-set formula (renamed `estimateDayTimeFormula()`) with the
user's own logged `state.history` for that exact day once samples exist, weighted toward the
logged average as more samples accumulate (full weight at 5 samples). A history entry only counts
as a sample if every exercise in it was actually logged (`badgeText === 'Logged'`, never
`'Skipped'`) and its exercise count matches the day's current plan — so a workout that ran short
purely because exercises were skipped mid-session can never drag the estimate down, while an
exercise genuinely removed from the day's plan changes the exercise count, drops all pre-removal
history out of the sample pool, and the estimate correctly shrinks via the formula recomputing
with one fewer exercise; (12) default-plan exercise variety — premade splits previously let the
same exercise land on more than one day in a week (e.g. a 6-day PPL split's two Push days used the
exact same five exercises, since `DAY_TYPE_EXERCISES[type]` in `wizard.ts` is a fixed list keyed
only by day type). `buildProgramFromPreset()` now runs `dedupeWeekExerciseIds()` across the whole
week before generating each day, substituting a same-muscle alternate from `POOL_BY_MUSCLE`
(every exercise id used anywhere in `DAY_TYPE_EXERCISES`, plus `EXTRA_POOL_MUSCLES` — a few
muscles like Core/Calves/Glutes only had one exercise in the base pool, not enough to de-duplicate
a muscle trained 3-4x in one week) whenever an id would otherwise repeat, so day themes and the
phase-7 set-count balancing are unaffected — only which specific exercise fills a slot changes.
Tracks used-this-day separately from used-across-week to avoid a subtle bug where fixing a
cross-day collision could introduce a new duplicate *within* the day being generated (a day type
can have two slots for the same muscle, e.g. "arms" has two Biceps exercises). Verified via a
scratch `.verify/` audit script (deleted after use, per the pattern below) across every
split-preset x training-type combination: only one unavoidable duplicate remains anywhere
(`face_pull` on the Full Body split, which trains Rear Delts 3x/week against a library that only
has two Rear-Delts-primary exercises total), and weekly volume %/day-time numbers are byte-for-byte
identical to before the change, confirming the fix only reshuffles which exercise fills a slot.

All items from that punch list are done as of this handoff. If new feedback comes in, add it here
the same way phases 7-12 were captured, and re-run a `.verify/`-style per-split/per-training-type
audit script (volume % + day time, see phase 7) after any change that touches exercise selection or
set counts, since those two interact and can regress each other silently.

(13) nine feature additions from a codebase-recommendations pass, all schema changes added as
optional/defaulted `AppState` fields so `loadInitial()`'s existing shallow-merge-over-defaults
pattern (see "Architecture" above) carried old sessions through with no explicit migration:
- **Backup export/import** (`src/data/backup.ts`) — full-state JSON download/upload, since
  everything still lives in one `localStorage` key with no server; import is staged
  (`pendingBackupImport`) behind a "this replaces everything" confirm, mirroring the app's existing
  confirm-before-destructive-action pattern (`confirmDeleteProgId` etc.).
- **Rest-timer sound/vibration** (`src/state/alerts.ts`) — `navigator.vibrate` + a WebAudio beep
  (no bundled audio asset), feature-detected and silently no-op where unsupported; toggleable in
  Settings under "Rest Alerts".
- **Estimated 1RM + PR detection** — `estimatedOneRepMax()`/`bestSetScore()` in `logic.ts` (Epley
  formula, reps-only score for time/bodyweight exercises). PR badges compute in `completeWorkout()`
  by comparing this session's best set against `exerciseHistory` *before* this session's entry is
  appended, and only fire when prior history exists (a first-ever log is a baseline, not a
  "record"). Progress tab's Exercise Progress and Compare Lifts charts share a `progressMetric`
  toggle (Weight / Est. 1RM).
- **RIR (reps-in-reserve) logging** — optional per-set field (`WorkoutSetRow.rir`), 0-4+ pill
  picker in `WorkoutScreen`. `recommendation()` in `logic.ts` gained one narrow rule: a hit-top set
  logged at RIR 0 (true failure) holds the weight next time instead of the usual +weight bump, on
  the theory that a set with zero reserve shouldn't get more load piled onto it even though the rep
  target was technically met.
- **Body-weight tracking** — `AppState.bodyWeightLog`, logged via a text-input-through-global-state
  field (`bodyWeightInput`) like every other input in this app, charted with the same
  points/`linePoints`/`deltaText` sparkline shape `exerciseProgressData()` already used (new
  `bodyWeightChartData()` in `logic.ts`).
- **Plate calculator** (`platesBreakdown()` in `logic.ts`) — standard 45 lb/20 kg bar, plate math
  done entirely in *display* units (a lb-tracked session uses lb plates on a 45 lb bar, a kg-tracked
  session uses kg plates on a 20 kg bar) rather than converting the internally-stored kg value,
  since that's how a bar is actually loaded at a gym. Shown inline in `WorkoutScreen` only for
  `equip.v === 'barbell'` — dumbbell/machine/cable don't plate-load the same way, and Smith machines
  vary too much in counterweight to guess reliably.
- **Deload suggestion** (`deloadSuggestion()` in `logic.ts`) — flags a lift as "plateaued" if its
  latest `bestSetScore` isn't meaningfully above the score from two sessions back, only considering
  **compound** lifts in the active program with 3+ logged sessions (isolation work is noisier).
  Suggests a deload once at least half of the considered compounds are plateaued. Dismissal
  (`deloadDismissedWeek`) is per-week, like other week-scoped state in this app, so it resurfaces
  next week if still true.
- **Supersets/circuits** — scoped deliberately to **adjacent pairs**
  (`ProgramExercise.supersetGroup`), not arbitrary N-exercise circuits, since `WorkoutState` assumes
  one active exercise at a time and a full circuit rework would be a much bigger change. Linked via
  a "🔗 Link Next" toggle in `DayBuilderScreen`. Mid-workout, `toggleSetDone()` in `useApp.ts` jumps
  straight to the linked partner with no rest when a set is marked done and the partner's
  matching-index set isn't done yet; only once both halves of a round are done does rest fire, using
  the longer of the two exercises' `restForExercise()` values (`restTotalFor()` helper). Every place
  an exercise can be removed or swapped (`removeExercise`, `removeWorkoutExercise`, both
  `swapConfirm` paths, `muscleSwapConfirm`) clears the remaining partner's `supersetGroup` so no
  group id ever dangles pointing at an exercise that's no longer there.
- **Reminder notifications** (`src/state/reminders.ts`) — explicitly best-effort and documented as
  such directly in the Settings UI copy: with no backend push service, a 60s `setInterval` in
  `useApp.ts` (reading latest state via a ref, not a closure, so the interval doesn't need
  recreating on every unrelated state change) can only fire a local `Notification` while the PWA is
  open in some form — it will not fire if the app has been fully closed all day, which is the
  honest ceiling on what's possible without a backend.

All nine were verified end-to-end via the harness's browser-automation tools against `npm run dev`
(a `.claude/launch.json` dev-server config was added for this, since none existed before) —
including the superset skip-rest/shared-rest behavior, PR badge + e1RM metric toggle producing
genuinely different numbers (not just a label swap), the plate breakdown appearing/disappearing
correctly by equipment and weight, backup export/import round-tripping a real state object, and the
deload banner both appearing (synthetic flat-history test data) and dismissing correctly. Zero
console or dev-server errors throughout.

(14) same-session follow-up round on user feedback about phase 13:
- **Superset linking generalized** — `toggleSuperset(dayKey, idxA, idxB)` in `useApp.ts` now takes
  two explicit indices instead of always assuming `idx+1`; the workout-flow partner lookup
  (`toggleSetDone`, `restTotalFor`) already matched by `supersetGroup` rather than position, so this
  needed no changes there. `DayBuilderScreen` now shows both "Link Previous" and "Link Next" pills
  per row (previously next-only), and re-linking either side of an existing pair breaks the old pair
  first so an exercise is never in two groups at once.
- **Rest alerts while backgrounded** — `WorkoutState.restEndAt` (absolute epoch-ms) replaced tick-
  by-tick countdown decrementing, so a throttled/delayed interval (backgrounded tab) still resolves
  the correct remaining time whenever it next runs, and a `visibilitychange` listener resyncs
  immediately on refocus. Added a third "Notify" toggle (`restAlertNotify`) using the `Notification`
  API, since it's the one channel of the three that can actually reach the user while the app is
  backgrounded — vibrate is spec-restricted to visible documents and WebAudio self-suspends in
  background tabs, both disclosed directly in the Settings copy rather than silently not working.
  None of the three can survive the OS fully suspending a minimized PWA, same ceiling as the
  reminders feature.
- **Search in Replace Exercise** — `SwapState`/`MuscleSwapState` gained a `query` field; both
  `SwapModal` and `MuscleSwapModal` got a text input that filters by exercise name or muscle
  (matching the same substring pattern the Exercises tab search already used) within the existing
  variant/same-muscle/other-muscle groupings, auto-expanding "other muscle groups" while a query is
  active and showing a "no exercises match" state when nothing does.
- **Cross-day last-time/recommendation** — `recommendation()` and the per-set "Last time" display
  previously read `ex.last`/`ex.lastSets`, which are per-program-day-slot fields — an exercise that
  appears on two different days (e.g. Face Pull on both a Push and Pull day) tracked two independent
  copies, so doing it on one day didn't update what the *other* day showed as "last time." Both now
  prefer `state.exerciseHistory[exId]`'s most recent entry (already accumulated across every day the
  exercise appears on) via a new `effectiveLast()` helper in `logic.ts`, falling back to the slot's
  own `ex.last` only when no cross-day history exists yet. Verified with a synthetic two-day program
  sharing one exercise: the day with the older/lower slot value correctly showed the other day's more
  recent, heavier session as its target and "Last time" text.

(15) same-session micro follow-up: PR detection (`completeWorkout()` in `useApp.ts`, phase 13) only
fired when prior history existed for that exercise, deliberately, on the reasoning that a first-ever
log is a baseline rather than a "record." User feedback disagreed — a first log has nothing to beat,
so it counts as a PR by default now (`prior.length === 0` short-circuits `isPR` to `true`, skipping
the score comparison entirely). Verified live: an exercise with zero prior `exerciseHistory` now
shows the 🏆 badge and "1 new record" banner on its first-ever logged session.

The "back volume" muscle-attribution concern from that same round was confirmed by the user to be
`deadlift`'s `SECONDARY` tag (`['Hamstrings', 'Glutes']`) — real biomechanics, not a data bug. No
code change needed; left as-is.

(16) body-diagram recalibration, third pass. The first two passes (see "Architecture" above) were
done by reading a coordinate grid composited over the image by eye — this pass instead installed
`sharp` locally (`npm install --no-save sharp`, not committed to `package.json`) and rendered the
*actual* `BACK_REGIONS`/`FRONT_REGIONS` path data directly onto the real `body-back.png` at full
1:1 resolution with a pixel grid overlay, viewed via the `Read` tool — a strictly more precise
technique than eyeballing a grid, since it renders the exact production coordinates rather than an
approximation, and confirmed a real, specific bug: the back view's `Triceps` region (an arm ellipse)
and `Back` "lat wing" region overlapped substantially — `Triceps` was centered too far medial
(`cx=115, rx=38`, right edge at x=153) while `Back`'s lat shape's own left edge reached to x=88-105,
so the two shapes' fills fought over the same ~60px-wide strip of the actual back/armpit area
instead of sitting side by side the way the real lat and triceps muscles do. Front view
(`Chest`/`Biceps`, the analogous pair) was checked the same way and found *not* to have this
problem — confirms it was a specific back-view regression, not a systemic issue. Fixed by narrowing
and outward-shifting `Triceps` (`cx 115→98, rx 38→32, ry 62→55`) and pulling the `Back` lat shape's
medial edge in (`105,412`/`88,388`/`93,330`/`98,270` → `135,405`/`125,385`/`128,330`/`130,275`, and
mirror on the right side), re-rendered and re-verified containment before touching the source file.
Verified the fix landed live via HMR by reading the rendered `<path d>` attributes back out of the
DOM, not just re-running the build. If this needs another pass later, reuse this
render-the-real-coordinates-onto-the-real-image approach (a throwaway script, run from the project
root so `sharp` resolves, output viewed with `Read` — not composited externally) rather than
eyeballing a grid; it's what actually found the bug this time after two prior passes missed it.

(17) same-session fourth calibration pass, prompted by the user sending a cleanly labeled reference
anatomy chart (front+back, color-coded by muscle group with a legend) and asking to use it for
"refining the shading for muscle targeting." That reference is a *different* image from the app's
own `body-front.png`/`body-back.png` (different pose, proportions, art style) so its coordinates
aren't directly transferable — it was used qualitatively (which muscle groups border which,
roughly how far the lat/tricep/bicep boundaries extend) while the actual pixel measurements still
came from the app's real images via the same sharp-render-and-read approach as phase 16. Re-auditing
phase 16's already-fixed `Triceps` region against a fresh, more precise pixel measurement (extracted
a tight crop of just the arm with a fine grid) found it was *still* off — centered too far medial
(`cx=98`) and too narrow (`rx=32`), missing roughly the outer half of the real triceps muscle
(measured outer edge at x≈15, inner edge at x≈115 at y=300, vs. the shape's actual x=66-130).
Corrected `Triceps` to `cx=65, rx=48` (and vertically as part of the same edit). Applied the same
outward-widening correction to the front view's `Biceps` region (`cx=108,rx=33` → `cx=97,rx=50`),
which hadn't been audited in phase 16 (only `Chest`/`Biceps` had been spot-checked, not measured) —
checking it this time surfaced the same "too narrow" pattern, just not the severe torso-overlap
`Triceps` had.

Caught and fixed a real mistake mid-pass: this file's SVG arc region format is
`M{cx},{topY} A{rx},{ry} 0 1 1 {cx},{bottomY} A{rx},{ry} 0 1 1 {cx},{topY}` — the two y-values in
the path are the ellipse's **top and bottom edges**, not center+radius. A first attempt at both the
`Triceps` and `Biceps` fixes used the intended *center* y-value in the top-edge slot, which silently
shifted both regions ~80px too low (extending into the forearm/wrist) — caught by re-rendering and
comparing against the wrist band position in the real image before it shipped, not after. Worth
remembering if editing these paths again: the two y-coordinates in each `A...A...` pair are edges,
always sanity-check top/bottom against landmarks after any edit to these regions, not just cx/rx.

This session hit a transient infrastructure outage (the safety-classifier backing `Write`/`Edit`/
`Bash` was unavailable for several minutes, unrelated to anything in this repo) mid-fix — mentioned
here only in case a half-applied intermediate coordinate is ever found in git history; the final
committed state is the corrected, re-verified one described above.

(18) another feedback round, five items:
- **Exercise reordering** — `moveExercise(dayKey, idx, direction)` in `useApp.ts` for permanent
  reordering from `DayBuilderScreen` (↑/↓ pills per row, swaps two array entries; doesn't touch
  `supersetGroup` since links are matched by group id, not position — see phase 12's
  "linked elsewhere" fallback for what a reordered-apart pair looks like in the builder).
  `moveWorkoutExercise(direction)` is the mid-workout equivalent, operating on
  `workout.exIndex`/`dayExercises` and — like the existing add/remove/swap actions — counts toward
  `changesMade`, so reordering during an active session now correctly triggers the "update your
  plan?" prompt at completion via the same `pendingPlanUpdate` mechanism (its copy was updated to
  say "reordered" alongside "added, removed, swapped").
- **Muscle diagram: real muscle contours, not circles.** The only regions that were still literal
  circles/ellipses — `Shoulders`/`Rear Delts` (deltoid) and `Biceps`/`Triceps` (upper arm) — were
  replaced with hand-traced multi-point bezier shapes, the same style already used for
  `Chest`/`Back`/`Glutes`/etc. Traced by zooming into the real `body-front.png`/`body-back.png`
  with a fine pixel grid (same sharp-based throwaway-script technique as phases 16-17), reading
  off boundary points along the actual visible muscle-separation lines in the reference art, then
  rendering the candidate path back onto the real image to check containment before committing —
  one iteration got very close on the first attempt for all four shapes. User supplied a separate,
  cleanly-labeled anatomy chart (front+back, color-coded, with a legend) partway through this
  project as a *conceptual* reference for which muscle borders which — useful for knowing e.g.
  where the trapezius/rhomboid/lat boundary roughly falls, but not a coordinate source itself,
  since it's a different image (different pose/proportions/art style) than the app's own reference
  photos; the actual pixel measurements always came from the app's real images, never the chart.
- **Exercise search bypasses the day-theme filter.** `SwapModal`/`MuscleSwapModal`'s search (added
  in phase 14) was ANDing the query match with the day's theme restriction, so searching "squat" or
  "leg extension" on a Chest day always returned zero results — the whole point of a search box is
  to reach exercises the theme-scoped default browse view deliberately hides. Fixed in
  `viewModel.ts`: an active query now bypasses the theme filter entirely; browsing with no query
  keeps the original theme-scoped behavior.
- **Fresh-install test data** — investigated and confirmed clean: `defaultProgram()`/
  `dumbbellProgram()` in `src/data/program.ts` are dead code, not imported anywhere in the live
  app; `createInitialState()` genuinely returns an empty program and `onboarded: false`.
  (⚠️ Only those two functions are dead — the FILE is load-bearing: `mkEx`/`slugify`/`clamp`/
  `roundTo` are imported by useApp/coach/onboarding/logic, and `seededFrac` was revived by
  phase 45's session-seeded factoids. Do not delete program.ts wholesale.)
  A truly fresh `localStorage` always lands on the onboarding wizard. The most likely explanation
  for the user seeing old data after a "fresh install" is that reinstalling a PWA's home-screen icon
  on Android does *not* clear the underlying browser origin's `localStorage` — only explicitly
  clearing site data does. Added a "Reset App" option to Settings (confirm-gated, same pattern as
  backup import) specifically so this can be tested going forward without digging through browser
  settings: `resetApp()` in `useApp.ts` clears `localStorage` and only the *custom* exercises this
  session merged into the `EXLIB` singleton (not the ~151 built-in ones, which live in
  `exercises.ts` and aren't stored in `localStorage` at all), then resets to `createInitialState()`.
- **Hardware/gesture back button navigates in-app instead of exiting.** Installed PWAs have no
  browser chrome, so an SPA that never touches `history` has nothing for the back gesture to
  consume — it falls straight through to the OS, minimizing the app. Fixed with a deliberately
  *binary* one-entry history model in `useApp.ts` (not one push per modal/screen level): whenever
  the user is away from "resting" (program screen, no modal open) and no entry is currently
  pushed, push exactly one (`history.pushState`); a `popstate` listener closes whatever's topmost
  (checked in a fixed priority order covering every modal, then screen-level parents) and clears
  the pushed-flag, and the state-watching effect re-arms (pushes again) if the result still isn't
  at rest — so multi-level back-out (e.g. Day Builder → Day View → Program) correctly takes one
  press per level despite the simpler one-entry-at-a-time bookkeeping. Deliberately not tracking
  exact push-per-modal depth: it's simpler and far more resistant to desync than the alternative,
  at the cost of occasionally consuming one "do-nothing" back-press if a modal was already closed
  via its own ✕ button (a stale pushed entry with nothing left to close) — judged a fine trade,
  since the failure mode is "press back once more than expected," never "back exits the app early."
  Verified by simulating the gesture with `window.history.back()` against a live dev server: single
  modal open→closed correctly, and Day View→Day Builder→(back)→Day View→(back)→Program correctly,
  zero console errors either way.

(19) gamification: achievements + points, requested with "ask questions if needed." Scoping
questions (via `AskUserQuestion`) settled: a new dedicated "Achievements" tab (not a section
bolted onto Progress or a modal), all four category types (consistency/streaks, personal records,
volume/totals, variety/exploration), retroactive unlocking (badges you'd already qualify for
unlock immediately, not just going forward), and a simple running point total + badges with no
level/rank system layered on top.

Core design decision: `src/data/achievements.ts` defines 22 `Achievement` objects (id, name,
category, icon, points, description, a `metric(state) => number` function, and a `target`) but
**stores no unlocked/earned state anywhere** — `unlocked` is computed fresh every render as
`metric(state) >= target`. This is what makes "retroactive" free: an achievement someone already
qualifies for shows unlocked the first time this code runs against their existing history, no
migration or backfill pass needed. The only new persisted field is `seenAchievementIds: string[]`
(`types.ts`/`initialState.ts`), which exists purely to drive the "NEW" badge/tab-dot UI — it's a
*seen* list, never an *unlocked* list, so it can never desync into hiding an actually-earned badge.

Because nothing is stored as "earned," every metric function backing an achievement has to be
**monotonic** — only able to increase (or, for streaks, track the best-ever value rather than the
current one) — otherwise a badge could be earned and then silently un-earned on a later render,
which would be a confusing regression for a permanent-achievement system. This constraint drove
one specific implementation choice: PR-counting achievements (`pr-1`/`pr-10`/`pr-25`/`pr-50`) read
`state.history[].exercises[].isPR` (the uncapped, append-only session archive) rather than
re-deriving PR count by walking `state.exerciseHistory[exId]`, which is capped to the last 8
entries per exercise and would let old PRs silently age out of the count, making it *decrease*
over time. Streaks similarly use a new `bestEverStreak()` helper (`state/logic.ts`) — longest
run of consecutive completed sessions ever, not the current run — so a broken streak doesn't
retract an already-shown badge. New derived-stat helpers added to `state/logic.ts`:
`completedWorkoutCount`, `lifetimeVolumeKg`, `bestEverStreak`, `cleanWeekCount`, `totalPRCount`,
`distinctExercisesLoggedCount`, `distinctMusclesTrainedCount`, `hasLoggedTimeExercise`,
`customExerciseCount` — all pure functions of existing state, nothing new to track.

The 22 achievements total 2025 possible points across the four categories (consistency: first
workout, 3/7/14-session best-ever streaks, 1/4 fully-clean weeks; records: 1/10/25/50 total PRs;
volume: 10/25/50/100 completed sessions, 1000/10000/50000 kg lifetime volume with unit-aware
progress labels via the existing `fmtWeight()`; variety: 5/15 distinct exercises logged, all
muscle groups trained at least once, one custom exercise created, one time-tracked exercise
logged). `viewModel.ts` computes an `achievementsVM` (per-item unlocked/progress-%/progress-label/
isNew, grouped by category, plus running totals) and exposes `vm.achievements`/
`vm.hasNewAchievements`; `AchievementsScreen.tsx` renders it (locked items grayscale + progress
bar, unlocked items full-color + accent border) and calls `markAchievementsSeen` in a
mount-only `useEffect` — deliberately *not* bundled into the tab-nav action itself, since doing it
there would clear the NEW state in the same render pass the user was meant to see it in.
`TabBar.tsx` gets a 4th tab (🏅) with a small dot indicator when `hasNewAchievements` is true.

Verified live with seeded synthetic `localStorage` history (12-then-14 completed sessions across
4 clean weeks, 3 PRs via `isPR` flags, ~7320kg lifetime volume, 5 exercises across 5 muscles, 1
custom exercise, 1 time-tracked log): point total and unlocked count matched hand-calculated
values exactly at both session counts (370/2025 → 520/2025 after crossing the 14-streak
threshold), every individual achievement's unlocked state/progress number matched, the NEW dot
appeared for a freshly-unlocked badge and correctly cleared after visiting the tab without
resetting previously-seen ids, and unit-aware volume progress labels displayed correctly in both
kg and lb. Zero console/build errors throughout; `npx tsc -b` and `npm run build` both clean.

(20) fourth feedback round, four items — the muscle diagram, achievement units, Day View
reordering/quick-edit, and rest-alert reliability:

- **Muscle diagram rebuilt as a self-authored SVG figure, replacing the PNG-overlay approach
  entirely.** Four prior calibration passes (phases 14, 16, 17, 18) all tried to hand-trace SVG
  shading regions to sit exactly inside `body-front.png`/`body-back.png`'s muscle outlines, and
  even the most careful pixel-measured attempts kept coming back slightly off. Per the user's own
  suggestion ("generate a similar model to make this easier for yourself"), `BodyDiagram.tsx` no
  longer references any photo at all — it's now a flat humanoid figure built entirely from SVG
  `<rect>`/`<ellipse>` primitives (head, neck, shoulders, chest, core, arms in two segments, hips,
  thighs, knee connectors, calves, feet, hands), symmetric left/right halves generated by mirroring
  x-coordinates around the centerline (`mirror()` helper) rather than hand-duplicating numbers.
  This sidesteps the containment problem structurally rather than through more careful
  measurement: a muscle region's shape *is* the body art now, so there's nothing external to
  mis-align against — a rect at `x=58,y=70,w=38,h=46` for the Chest simply *is* the chest, by
  construction. Untracked connective parts (head/neck/forearms/hands/knees/feet) render in a
  neutral "skin" tone so the figure always reads as one coherent body; every tracked region also
  gets a faint permanent base fill/stroke (visible even at 0% worked) with the existing
  intensity-by-opacity accent highlight (`fillForMuscle()`, unchanged) layered on top — otherwise
  an untrained muscle would render as a literal hole in the figure. Verified by rasterizing the
  live SVG to a canvas and reading the PNG back (no `sharp`/file-system needed this time, since
  there's no external reference image to composite against — just `new XMLSerializer()` +
  `Image()` + `canvas.drawImage()` run directly in the browser pane via `javascript_exec`), which
  caught two real gaps before they shipped: the feet ellipses sat entirely below the SVG's own
  `viewBox` (clipped/invisible — fixed by growing `VB_H` from 460 to 488) and a 14px visible seam
  between the thigh and calf boxes at the knee (fixed by adding small knee-connector ellipses,
  matching the same skin-tone bridging already used at the wrists). Both front and back views
  confirmed clean after the fix — no overlap, no gaps, muscle highlighting fully contained within
  its own region by definition.
- **Achievement volume thresholds now respect the user's unit setting.** The three "lift a
  cumulative X" achievements used fixed kg thresholds (1,000/10,000/50,000 kg) with description
  text hardcoded to say "kg" even for lb users, and converting those kg thresholds to lb produced
  ugly non-round numbers (1,000 kg → "2,205 lb"). `Achievement.target`/`description` can now be
  functions of `AppState` (resolved once per render in `viewModel.ts`'s `achievementsVM`), and the
  three volume achievements use `volumeMilestone()`/`volumeLabel()` helpers that pick a *separately
  round* number per unit system (1,000/10,000/50,000 kg for kg users, 2,000/20,000/100,000 lb for
  lb users) rather than converting one into the other — matches how a lifter actually thinks about
  round milestones in their own unit, the same reasoning already used for the plate-calculator's
  per-unit plate sets. Verified live: switching to lb showed "Lift a cumulative 2,000 lb" (not a
  converted-and-rounded "2,205 lb"), progress labels and unlock thresholds updated correctly.
- **Day View: press-and-hold drag reordering, plus tap-to-edit weight/sets/equip.** Previously the
  only way to reorder or adjust an exercise's working weight was through the Day Builder (up/down
  pills, no weight field at all). `DayViewScreen.tsx` now attaches a long-press (450ms) + drag
  gesture to a dedicated ⠿ handle on each row — deliberately *not* the whole row, so it can't race
  the row's own tap targets (name → quick-edit, photo → info, Swap button). While dragging, the
  visual order lives entirely in local component state (`drag.order`, a permutation array computed
  fresh each move from a frozen `baseOrder` + total pointer delta ÷ measured row height — not
  incremental deltas, which would drift) and only commits to the real program via a single new
  `reorderExercise(dayKey, fromIdx, toIdx)` action on release; dispatching mid-gesture would race
  the async re-render against a flurry of pointermove events and reorder against stale indices.
  Tapping an exercise's name now opens a new `ExerciseQuickEditModal` (weight/reps/sets/equip)
  instead of the old read-only info screen — that info screen (`ExerciseDetailModal`, photo/how-
  to/video) is still reachable via the photo tap or an "ℹ️ Info" link inside the new modal, so
  nothing was lost, just re-routed to the more commonly-wanted action. Editing weight/reps writes a
  new `ProgramExercise.manualTarget` override rather than touching `ex.last` directly — necessary
  because `effectiveLast()` (phase 15) already prefers cross-day `exerciseHistory` over a day
  slot's own `last` the moment an exercise has been logged anywhere before, which is the
  overwhelmingly common case; a manualTarget now outranks *both*. It's a one-time correction, not a
  permanent pin: `completeWorkout()` clears it (`manualTarget: null`) the moment the exercise is
  actually logged again, on *every* day slot sharing that exercise id, not just the one played,
  since a fresh real log is fresher than a manual guess set on some other day's copy of the same
  exercise. Verified live: dragging Bench Press two rows down persisted correctly in
  `localStorage`, a short tap on the handle (under the long-press threshold) correctly did nothing,
  editing weight in the quick-edit modal updated the Day View's target text immediately, and the
  plate breakdown recalculated live off the edited weight.
- **Rest-end vibration/toast fixed for a minimized app; added a live countdown toast.** The user
  could hear the completion alert while the app was backgrounded but got no visible toast and no
  vibration. Root cause: `navigator.vibrate()` is spec-restricted to visible documents (silently
  no-ops when hidden) and the old code used the page-context `new Notification()` constructor,
  which is unreliable once a Service Worker is controlling the page (this project's PWA plugin
  always registers one). Fixed in `alerts.ts` by routing the completion alert through
  `ServiceWorkerRegistration.showNotification()` with the vibrate pattern passed *as part of the
  notification options* rather than a separate `navigator.vibrate()` call — a vibrate pattern
  attached to an OS-level notification isn't subject to the same page-visibility restriction.
  `restTick` (`useApp.ts`) now fires this whenever `restAlertVibrate` OR `restAlertNotify` is on
  (previously gated on `restAlertNotify` alone, which defaults *off* while `restAlertVibrate`
  defaults *on* — meaning the default settings combination could never have vibrated in the
  background even before this fix). Notification permission is now requested contextually the
  first time a rest period actually starts with either flag on, rather than never automatically
  (previously only `setRestAlertNotify` requested it). Also added a best-effort live countdown:
  `updateRestProgressNotification()` updates the same tray notification (silently, `silent: true`,
  same tag so it doesn't stack) whenever a tick actually runs while `document.hidden` — "real time"
  here means "as fresh as the last tick the browser let run," the same honest best-effort ceiling
  already documented for `reminders.ts`, not a guaranteed 1Hz clock. For the foreground case, which
  *can* be truly real-time, added `RestToast.tsx`: a slim pill fixed above everything (including
  modals, `z-index: 30`) showing the live countdown + Skip button, so it stays visible even if the
  user is browsing exercise history mid-rest, not just when WorkoutScreen's own (larger, but
  modal-obscured) rest card happens to be on top.

(21) user rejected phase 20's self-drawn SVG figure ("looks terrible") and asked to return to the
photo-overlay approach with a careful trace of each muscle. Restored the phase-18 overlay version
of `BodyDiagram.tsx` from git (`git show cb30d52:...`) as the starting point, then did a fifth —
and finally successful — full calibration pass of every region on both views. What made this one
land where four prior passes didn't:

- **Read the coordinates off the image before drawing anything.** Rendered both reference images
  with a fine 20px grid (100px-major, labeled), then zoomed crops (2-3x, nearest-neighbor) of each
  body area, and explicitly wrote down the drawn muscle outlines' boundary coordinates from the
  crops *first* — only then authored candidate paths. The single biggest prior miss found this
  way: the front `Quads` region had always started at x≈172 when the thigh's outer contour is at
  x≈135-144, i.e. every previous version silently excluded the entire outer half of the thigh
  (vastus lateralis), which is a big part of why the shading never looked right.
- **Mirror, don't hand-duplicate.** Only left-side paths are stored; `mirrorPath()` in
  `BodyDiagram.tsx` generates the right side by flipping x around each image's centerline (front
  482px wide → center 241, back 470 → 235), so the two sides can never drift apart and every
  fix applies to both automatically.
- **One `<path>` element per muscle, subpaths concatenated.** The Back group is three
  intentionally-overlapping regions (traps diamond, two lat wings raised medially to also cover
  the rhomboid/teres scapular area, erector column) — as separate semi-transparent `<path>`s the
  overlaps double-darken into visible bands, but as subpaths of a single path they fill uniformly.
  `buildMusclePaths()` groups all of a muscle's defs (plus mirrors) into one element.
- **Iterate on the composite, not in the head.** Three render-inspect-adjust iterations via a
  throwaway `.verify/` dir (`regions.cjs` + `render.cjs` — note `.cjs`, the package is
  `"type": "module"` so `.js` scripts can't `require()`), each region drawn in a distinct debug
  color at 0.35 opacity over the real PNG, checked full-figure and in zoomed crops. Iteration
  fixes: shoulder caps and biceps/triceps trimmed a few px where they spilled past the arm
  contour, core bottom V raised out of the groin, lat bottom tips lifted off the glute tops,
  ham/glute boundary separated at the gluteal fold, rear delts shifted up-medial onto the drawn
  deltoid.
- **Verified the real thing, not just the debug render**: seeded a mixed day (bench/OHP/row/
  squat/RDL/pushdown), opened the Muscles Worked modal, and rasterized the live `img`+`svg`
  composite out of the browser (XMLSerializer → canvas → PNG, read back with the Read tool) for
  both views — chest/shoulders/quads (front) and back-group/triceps/hamstrings (back) all sat
  cleanly inside their drawn outlines at the app's real accent shading, zero console errors.

`public/body-front.png`/`body-back.png` are load-bearing again (phase 20 had orphaned them; they
were never deleted).

(22) exercise-photo standardization. The exercise photos had accreted from three stylistically
inconsistent sources (see the old header comment in `exercisePhotos.ts`): free-exercise-db stock
shots (landscape, varied models/gyms/lighting), name-matched ones from that same catalog, and a
handful of earlier one-off user crops. The user supplied 10 new labeled collage images (saved in
the project *root* `Alpha Lifts/` folder, one collage per muscle group — Biceps/Back/Calves/Chest/
Core/Glutes/Hamstrings/Quads/Rear Delts/Shoulders — every cell a near-square full-body shot of one
consistent model in one dark studio, with the exercise name printed on a white label band above
each photo) and asked to crop each cell and match it to its exercise. 132 of the 151 library
exercises are covered by these collages; all 132 photos were replaced (`public/exercise-photos/
{id}.jpg`, same filenames, so no code/allowlist change — `EXERCISE_PHOTO_IDS` and the Workbox jpg
glob were already correct). The other 19 keep their older photos because no collage covered them:
every Triceps exercise plus a set of niche/coined lifts — full list in the `exercisePhotos.ts`
header comment. The collage labels are verbatim the library's own `name` fields (the collages were
generated *from* this library), so matching was an exact normalized-name lookup (lowercase, strip
apostrophes/punctuation, collapse spaces), not fuzzy — zero unmatched, no score-based guessing of
the kind phase-11's notes warn about.

Cropping technique (a throwaway `.verify/` Node + `sharp` pipeline, same disposable-scratch pattern
as phases 12/16/21, deleted after integrating): the collages are irregular grids (different column
counts per row: 6/5/5, 7/7/7/2, 4/3 offset, etc., and partial/empty trailing cells), so a fixed
grid won't do. Detection is two-stage and keys off the white label bands, not the photos: (1) rows
— split into photo bands vs. label/separator bands by per-row white-pixel fraction (pixels ≥205),
threshold 0.10; a row-*mean*-brightness threshold was tried first but a partial bottom row's mostly-
empty label band (e.g. hamstrings' lone Stiff-legged Deadlift, back's 2-cell row 4) is too dark to
clear a mean cut and merges upward, whereas the white-*fraction* cut cleanly catches even a sparse
label. (2) columns — within each band, cells are the runs of columns whose *label region directly
above* is mostly white (fraction >0.3); this both finds the per-photo x-splits (the thin ~180-grey
vertical gridlines between photos read as gaps because they're below the 205 white cut) *and* drops
empty/offset cells for free (an empty cell has a dark, unlabeled region above it), which a photo-
region split can't do and which also sidesteps false splits from bright vertical elements inside a
photo (racks, barbells). Crops are inset 3px to shed the residual grey border lines, written as
q90 JPEG. Verified before overwriting anything: every crop was tiled into per-collage contact sheets
annotated with the assigned `{id}` + label and read back by eye (all 132 correct, order preserved,
no label-text bleed), and the app's actual render was simulated (180×180 `fit:cover`, matching
`ExercisePhoto.tsx`'s fixed-square `objectFit:'cover'` container) to confirm the near-square crops
square cleanly without lopping off the exercise action. If more collages are supplied later (e.g. a
Triceps one to close the last 19), reuse this exact detector — the label-band keying is what makes
it robust to the irregular layouts. The source collages, like every prior user-supplied source
image in this project, are not kept in the repo; they'd need re-supplying to re-crop.

Post-swap review + fixes: a full-resolution review of the 132 (all barbell compounds + all coined/
obscure lifts, cross-checked against real reference images) found four worth fixing — two obvious
generation errors and two soft mismatches: `clean_and_press` showed two barbells at once (front-
racked *and* pressed overhead — an impossible AI merge of the two phases); `bent_press` showed a
two-arm lying barbell bench press instead of the one-arm overhead strongman bent press (the AI
didn't know the coined movement); `extended_range_one_arm_floor_press` held a dumbbell in each hand
for a "one-arm" move; and `bench_press_with_neutral_grip` used a straight bar (a true neutral grip
needs a specialty bar). The user then supplied four corrected replacement images — this time one
standalone labeled image per exercise (not a collage), same white label band on top — which were
cropped by the same label-band technique reduced to the single-image case (find the top white band's
lower edge via row white-fraction, crop below it, trim any fully-white frame) and written over those
four ids. All four verified correct at full res + square-render before overwriting.

Scan of the remaining 19 (the ids with no muscle-collage — every Triceps exercise plus the coined
lifts; see `exercisePhotos.ts` header): these were NOT assumed fine just because they predate the
collage swap. Two findings: (a) 5 were bright free-exercise-db real photos (`triceps_pushdown`,
`overhead_triceps_ext`, `skull_crusher`, `close_grip_bench`, `jm_press`) — movement-accurate but the
only stylistically-inconsistent images left in the whole library; and (b) **`kelso_shrug` was wrong**
— it showed a man standing upright holding dumbbells (a standing shrug/hold), not the bent-over,
scapular-retraction Kelso shrug. The user then supplied six individual dark-studio replacement images
covering exactly those six ids, all verified movement-correct and installed — so the library is now
fully one consistent dark style with zero bright stock photos remaining, and `kelso_shrug` now
correctly shows the chest-supported bent-over movement. Three of the six (`skull_crusher`, `jm_press`,
`close_grip_bench`) arrived as very wide ~2.8:1 banners with no label band; a centered square crop
(the app renders every photo as a fixed `objectFit:'cover'` square) would have cut off the bar/head
and shown only torso+knees, so those three were pre-cropped to a square centered at ~0.58 of the
width (the bench-press subject lies with head+bar in the right third) — candidate square crops at
several x-centers were rendered and eyeballed to pick the framing that keeps bar+arms+head+chest in
frame. The other 13 un-replaced ids (`pec_deck`, `chest_supported_row`, `bulgarian_split_squat`,
`hip_abduction`, `pendlay_row`, `seal_row`, `meadows_row`, `landmine_press`, `cossack_squat`,
`nordic_curl`, `suitcase_carry`, `copenhagen_plank`, `larsen_press`) are the on-style phase-10/11
dark crops, verified movement-correct and left as-is. One soft note kept for the record: `seal_row`
reads correctly (prone chest-supported row) but has a stray unrelated barbell in the foreground.

(23) five-item feature round:
- **Exercise thumbnails not painting on the Exercises tab** (`reverse_curl` and others blank until
  tapped in). Not a load failure — all 151 `<img>` render eagerly with no `loading`/`decoding` hints,
  and 10 of the photos were stored at up to ~1400px (each ~5–6 MB *decoded*), so the simultaneous
  decode of 151 images starved the renderer on-device and left some thumbnails unpainted (clicking in
  decodes that one on demand, hence it "loads"). Fix: `loading="lazy" decoding="async"` on the
  `ExercisePhoto` img, plus a one-off downsize of every photo whose max dimension exceeded 640px down
  to ≤640 (they're shown at ≤180px) — total asset weight 3.6→2.5 MB, precache 4675→3614 KiB, decoded
  memory ~3× lower. Not reproducible on desktop; the fix targets the decode-storm root cause directly.
- **Research-backed rest timers** (`restForExercise` in `logic.ts`). Previously `restBase[ex] ×
  pacingMult` only — ignored training type and RIR. Now `restBase × REST_TRAINING_FACTOR[type] ×
  rirRestFactor(rir) × pacingMult`, clamped 30–300s. `restBase` still encodes compound-vs-isolation;
  the training factor (strength 1.4 / hit 1.3 / progressive_overload 1 / general .85 / endurance .6)
  and RIR factor (0→1.25 … 2→1 … 4+→.8; undefined→1 neutral) layer on top (Schoenfeld 2016 / NSCA:
  longer rest on heavy multi-joint / near-failure work). The in-workout rest is recomputed against the
  *just-completed set's* logged RIR — `startRest(restSecOverride?)` takes an override that
  `toggleSetDone` supplies from `restTotalFor(..., completedRir)`; the stored `workout.restTotal` is
  still the neutral value used for the pre-set display and the static day-time estimate (which now
  also passes `trainingType`, so estimates shift a little — intended). Verified live: Strength + bench
  (restBase 120) + RIR 0 → 3:30 (120×1.4×1.25), i.e. both factors applied.
- **Achievements are now tiered families** (`ACHIEVEMENT_FAMILIES` replaces the flat `ACHIEVEMENTS`).
  Each badge is one `AchievementFamily` with an ascending `tiers[]` (threshold/points/name); the VM
  derives the highest reached tier, next tier, points-so-far, and a progress bar that spans the
  *current* tier floor → next threshold (so it refills each tier rather than creeping toward one far
  goal). Same store-nothing/retroactive design as before (unlocked state recomputed from history);
  `seenAchievementIds` now holds `familyId:tierIndex` so a freshly-cleared tier re-lights "NEW" even
  though earlier tiers were seen (the action merges, so old flat ids harmlessly persist — old users
  get one burst of NEW on the current tier of each family, which is correct). 9 families / 37 tiers /
  8310 possible points. Nouns singularize at a target of 1 ("1 PR", not "1 PRs").
- **Day View reorder reworked** (`DayViewScreen`). Was a 450ms hold that snapped the row between
  slots. Now 280ms hold → the row "pops out" (scale 1.03, lift shadow, accent outline, `navigator.
  vibrate(15)` haptic) and follows the finger, while the other rows slide by one row-height to open
  the gap it'll drop into — a clear live drop indicator. The exercises array is never permuted
  mid-drag (dragged row keeps its index and renders translated; others render shifted); only release
  commits via the existing `reorderExercise`. Verified live with a synthetic pointer drag: row 0
  dragged down 2 slots committed to the correct order.
- **30-min idle-workout prompt.** A ref tracks last pointer/key activity; the existing 60s interval
  flags `idleWorkoutPrompt` when a workout is open and idle ≥ `IDLE_WORKOUT_MS` (30 min).
  `IdleWorkoutToast` is a blocking centered dialog (deliberately not a dismissible toast — it's a
  decision) with Continue (→ back to the current exercise, resets the clock) and End Workout (→ normal
  `completeWorkout`). Activity tracking is ref-only (no re-render per tap) and the dialog resolves
  only via its buttons, avoiding a pointerdown-unmounts-before-click race. Verified live at a
  shrunken threshold: prompt fired with the correct elapsed/exercise text, Continue returned to the
  workout. (`AppState.idleWorkoutPrompt` added, defaulted in `initialState`, carried by the
  shallow-merge like every other optional field.)

(24) rest-notification + first-time-exercise round:
- **Tapping the "Rest complete" notification now reopens the app on the right exercise.** This is why
  the PWA moved from `generateSW` to **`injectManifest`** (`vite.config.ts` + new `src/sw.ts`, with
  `workbox-precaching`/`workbox-core` promoted from transitive to explicit devDeps): `notificationclick`
  can only be handled inside the service worker and generateSW offers no hook for custom listeners.
  The worker deliberately does no routing logic of its own — only the page knows the live workout
  state — so it focuses an existing client and `postMessage`s `{type:'open-rest-exercise'}`, or, when
  no client exists (app fully closed), hands the intent over as a `#rest-exercise` URL hash for the
  app to consume on boot. `useApp`'s `openRestCompleteExercise` then lands on the active program day's
  workout screen showing the exercise still owed work: the one just rested inside, or — if that rest
  followed the exercise's *final* set — the next incomplete exercise via `nextIncompleteIndex`. The
  hash is stripped with `replaceState` immediately so a later reload can't re-trigger the jump, and a
  `hashchange` listener backs up the mount-time check. Verified both branches live: parked on the
  Program screen with exercise 3 fully logged, loading with the hash advanced to "Exercise 4 of 5";
  repeating it with exercise 4 only partly logged correctly stayed on exercise 4.
- **Rest notifications weren't vibrating.** Two real causes fixed. (a) The countdown ticker and the
  completion alert shared one notification `tag`, so the completion was delivered as an *in-place
  update* of an already-`silent: true` notification — Android generally won't re-alert (no sound, no
  vibration) for a replacement, and `renotify` is honoured inconsistently. They now use separate tags
  (`TAG_PROGRESS`/`TAG_DONE`) and the ticker is explicitly closed before the completion is posted, so
  the OS sees a genuinely new notification and applies normal alert behaviour. (b) The vibrate/sound/
  notify calls were being made *inside* a `setState` updater, which must be pure — React (StrictMode
  especially) can invoke it more than once per commit, so alerts could double-fire or, on a bailed-out
  update, not fire at all. `restTick` now reads `stateRef`, runs the alerts outside the updater, and
  guards completion with `restDoneForRef` (keyed on that period's `restEndAt`) so the 1s interval and
  the visibilitychange resync can both call it without ever alerting twice. Worth knowing for future
  expectations: the Notification `vibrate` option is effectively dead on modern Chrome (kept only for
  browsers that still honour it), `navigator.vibrate()` is spec-restricted to *visible* documents so
  it only covers the foreground case, and iOS exposes no Vibration API at all — backgrounded vibration
  therefore rides entirely on the OS alerting on a new notification.
- **No progressive-overload prompt for an exercise that's never been logged.** `ex.last` is
  placeholder data on a fresh program slot (weight 0), so `recommendation()` was rendering advice
  built on nothing — "Last time: 0 lb × 6 reps, all sets hit target. Try 5 lb." — which reads as if
  the user had done the lift before. `recommendation()` now short-circuits when there's no
  `exerciseHistory` for the id and no `manualTarget` (a manual target is a deliberate starting point,
  so it's left alone), and new `similarExerciseReference()` finds the closest already-logged stand-in
  to show instead: ranked same movement `pattern` first (a true variant), then same primary `muscle`,
  breaking ties on how much history exists. It deliberately does **not** sort by date —
  `ExerciseHistoryEntry.date` is a display-formatted locale string with no year, so it isn't
  comparable across exercises; the entry shown is still that exercise's own latest log. The per-set
  "Last time" line in `viewModel` was suppressed under the same never-logged condition, since it fell
  back to the same placeholder. Verified live: a fresh Incline DB Press showed "Closest thing you've
  logged is Bench Press at 175 lb × 8 reps (same muscle group)" with no fake last-time line, while
  Bench Press itself (with history) still showed the normal "+5 lb" overload prompt.

(25) three-item polish round:
- **Mid-workout "✕ Remove" is now confirm-gated.** It sat directly beside the set-logging controls
  and removed instantly, discarding any sets already logged against that exercise with no undo. New
  `AppState.confirmRemoveExIndex` stages the request and `ConfirmRemoveExerciseModal` commits it,
  naming the exercise and calling out how many logged sets would be lost. Registered in
  `isAnyModalOpen`/`closeTopmost` (checked first, since it sits above every other surface) so the
  hardware back gesture dismisses it like any other modal. Verified live: "Keep it" left 5 exercises
  intact, "Remove exercise" took it to 4.
- **Warm-up sets now ramp to the working weight**, answering "how are warmups calculated?": they're
  percentages of a top weight — Standard 40%/65% for two sets, Cautious 30%/50%/70% for three — gated
  to compound, non-bodyweight lifts above a 40kg (25kg on Cautious) threshold, with the whole thing
  skipped on Warm-Up Style "Minimal". The bug was *which* weight: it keyed off `ex.last.weight`, this
  program slot's stored last-session weight, so the ramp lagged a session behind every weight
  increase, ignored a quick-edit `manualTarget` entirely, and — since `ex.last` is placeholder 0 on a
  fresh slot — suppressed warm-ups completely for a first-time exercise no matter how heavy the
  working sets. `warmupInfo()` takes an explicit `workingWeight` now and `viewModel` passes the
  heaviest of the *current* working sets (falling back to today's recommendation before any set
  exists). Verified live: at an 82.5kg working weight the ramp read 70lb/115lb, and raising set 1 to
  ~110kg moved it to 100lb/160lb in real time — previously it wouldn't have moved at all.
- **Dropped the "new achievement" dot from the Achievements tab.** Achievements are a reward to
  stumble on, not an inbox to clear, and a persistent badge on the nav reads as a chore. The per-badge
  NEW chip *inside* the screen stays (it only appears once you're already looking). `hasNew`/
  `hasNewAchievements` were removed from the VM along with it rather than left as dead fields.

(26) rest-alert vibration, diagnosed properly. User report: the rest alert "makes an auditory chime
despite my phone being on vibrate," while the notification itself (and its click-through, phase 24)
works fine. That combination is the whole diagnosis — **a chime that plays while the ringer is set to
vibrate cannot be coming from the OS notification**, because the OS would have buzzed it instead. It's
`playRestEndSound()`, the app's own WebAudio beep: WebAudio output goes to the **media** stream, which
on both iOS and Android deliberately ignores the ringer/silent/vibrate switch (that's why a video
still plays with the phone on silent). `restAlertSound` defaults to `true`, so it's on unless turned
off. Meanwhile nothing vibrated because `navigator.vibrate()` — the only real vibration path a web app
has — **does not exist on iOS at all**, in any browser, including an installed PWA; the Notification
`vibrate` option is also long dead on Chrome. So on iOS the Vibrate toggle was a switch wired to
nothing, sitting next to a Sound toggle that overrides the user's ringer setting.

**The chime half of that diagnosis is confirmed and holds. The platform half was wrong** — worth
recording as a caution. From "chimes despite vibrate mode + no buzz" the platform was inferred to be
iOS and the first fix was built around that; the user then corrected it: **they're on Android**, where
`navigator.vibrate()` *does* exist. Lesson: those symptoms are equally consistent with an Android
device whose vibration is being refused or suppressed, so confirm the platform before building on an
inference. The `vibrationSupported` capability check that came out of it is still correct and worth
keeping (it's generic, and genuinely covers iOS), but it renders as normal on Android and so does
nothing for the reported problem — its copy was de-iOS-ified accordingly.

The real Android question is *why* an accepted `navigator.vibrate()` call doesn't buzz, and that
splits into two failure modes needing completely different fixes, indistinguishable from the app's
side and not reproducible off-device:
  - the browser **refuses** the call (`navigator.vibrate()` returns `false` — typically vibration
    disabled for the site/browser, or no user activation on the frame), versus
  - the call **succeeds** (returns `true`, request handed to the OS) and **Android suppresses it** —
    Do Not Disturb, Settings → Sound & vibration → Vibration & haptics turned down/off, a per-app or
    per-site block, or an OEM battery-saver profile. Nothing a web page can override.
So rather than guess, Settings grew a **"Test buzz"** control that calls `testVibration()` straight
from the tap (guaranteeing user activation) and reports which of the two happened. `vibrateRestEnd()`
also returns the boolean now, and the pattern was lengthened from `[200,100,200]` to
`[400,150,400,150,600]` — the old one was easy to miss through a pocket or against a rack, which is
its own possible explanation for "no buzz". The Rest Alerts help text states outright that Sound plays
through media volume and therefore ignores the silent/vibrate switch, which is the actual cause of the
reported chime (turning Sound off silences it). Deliberately left alone: the
`restAlertVibrate || restAlertNotify` gate on `notifyRestEnd()`, since with vibrate defaulting on that
gate is what makes the notification fire at all. Verified both readouts by stubbing `navigator.vibrate`
to return true and then false at runtime. **Outcome: the user confirmed vibration works after this.**
(The "Test buzz" control was removed in phase 43 once it had served that diagnostic purpose —
`vibrationSupported`, the lengthened pattern, and the help copy all stayed.)

(27) achievement cadence — "make it very easy to hit some sort of achievement every workout".
Phase 22's tiering fixed "nothing left to chase" but not *frequency*: the ladders jumped 10 → 25 → 50,
so an established lifter could go 10+ sessions with nothing. Two changes:
- **Denser ladders + two new families.** 37 tiers → **123**, 8,310 → **31,527** points. Rungs are now
  tight low down (Workouts 1/2/3/5/8/10/15/20/25/30…, PRs 1/3/5/10/15/20/30…) and only stretch once
  the numbers are genuinely impressive. Two new families are deliberately driven by metrics that move
  on *every* completed session regardless of how it went — **Time Under the Bar** (`totalTrainingMinutes`,
  a sum of `durationMin`) and **Biggest Session** (`bestSessionVolumeKg`, a max of per-session
  `volumeKg`, so it's a beat-your-best-day target rather than a lifetime total). Both are retroactive
  and monotonic like everything else here. Note what was rejected and why: a lifetime *sets/reps logged*
  counter would have been the obvious high-frequency metric, but `HistoryEntry.exercises` is display
  rows with no set counts and `exerciseHistory` is capped to 8 sessions per exercise — any count off it
  would *decrease* as old sessions age out and un-earn badges. Volume and training time fill that role
  safely. There's a comment in `logic.ts` recording this so it isn't "fixed" later.
- **Newly-cleared badges now surface on the workout Complete screen** (`achievementsVM.newlyUnlocked`,
  plus a per-item `tierPoints` — the family total `earnedPoints` was the wrong number for a "+X" on a
  single fresh badge). Deliberately *not* marked seen there, so the Achievements tab still flags
  anything skimmed past; the heading says "since you last checked" rather than "this session", which is
  what the `isNew`/`seenAchievementIds` model can honestly claim.

Cadence was tuned empirically rather than by eye, with a throwaway `.verify/` script simulating a
typical lifter (~3,000kg and 55min per session, PRs tapering off) against the real thresholds: the
first pass came out at 67% of sessions unlocking something with 3-session dry spells, so the ladders
were tightened in the mid-band and re-measured at **80% of sessions, 12/12 across the first twelve, and
a worst case of 2 consecutive sessions with nothing**. Chasing 100% was rejected on purpose — it would
need rungs so close together they'd stop meaning anything. Verified live at 6 seeded sessions: 25/123
tiers, and a completed workout surfaced Week Warrior / Two in a Row / Breaking Through / Heavy Hitter
with correct per-tier points.

(28) **scheduled deload weeks** (`src/state/deload.ts`), opt-in via Settings. Note this is the
*second* deload feature — phase 13 added `deloadSuggestion()` in `logic.ts`, a reactive, dismissible
"your compounds look flat, consider a deload" banner. That one only ever fires after progress has
already stalled and can't do anything about it; this one pencils a lighter week in ahead of time.
They share the plateau signal rather than duplicating it (`fatigueRead()` calls `deloadSuggestion()`),
and the old banner is **suppressed entirely while `deloadEnabled`** — otherwise two banners say the
same thing and only one is actionable. Scoping questions (via `AskUserQuestion`) settled: cut weight
(not sets), hybrid cadence+early trigger (not purely fixed or purely adaptive), and full user control
(defer / skip / start-now, nothing silently applied).

- **Trigger is hybrid.** *(Superseded by phase 30 — the cadence is now a backstop, not a schedule,
  and the weights/thresholds below have all changed. Kept for the reasoning, not the numbers.)*
  Baseline cadence by training type (`DELOAD_CADENCE`: strength/hit 4,
  progressive_overload 5, general/endurance 6), pulled earlier when `fatigueRead()` scores ≥0.6 from
  three independent signals — plateaued compounds (0.4), recent sets averaging RIR ≤1 i.e. training
  to failure (0.35), and mean session volume down >8% over the last three sessions vs. the three
  before (0.25). So an early pull always needs at least two signals agreeing; no single one can do it
  alone. Early pulls are also gated behind `MIN_WEEKS_BEFORE_EARLY` (3) so one bad session in week 1
  of a cycle reads as noise, not fatigue.
- **Weeks are `weekNumber`, not calendar weeks** — which already advances on actual completion of
  every training day (phase 7), so "every 4 weeks" means four weeks of training actually done, not
  four weeks elapsed while the app sat unopened. That's the right unit for a fatigue cycle.
- **The plan is derived, not stored** — same approach as `data/achievements.ts`. `deloadPlan(state)`
  recomputes from week number/training type/history every render. The only persisted fields are the
  user's own choices (`deloadEnabled`/`deloadIntensityPct`/`deloadCadenceWeeks`) plus the bookkeeping
  that genuinely can't be recomputed: `deloadActiveWeek` (which week is designated), `deloadAnchorWeek`
  (where the current cycle is measured from), `deloadDeferUntilWeek`, and `deloadHistory`.
- **Skip vs. push back are deliberately different.** "Push back a week" sets `deloadDeferUntilWeek`
  and re-proposes next week; "Skip this one" moves the *anchor* to now, so the next deload is a full
  cadence away rather than being re-asked at the very next rollover.
- **Evaluated at the week boundary, not continuously.** `advanceDeloadForWeek()` is called from both
  `useApp.ts` rollover sites (`completeWorkout` and `toggleSkipDay`) with the week being rolled into,
  and handles both halves — closing out a finished deload (anchor moves, active clears) and opening
  one if the new week is due. A deload has to apply to a whole week, so mid-week designation would cut
  the weights out from under a week already in progress. The explicit "Start a deload week now"
  action is the one exception, since it's a deliberate request.

**The subtle part, and the thing most likely to be broken by a careless later change:** a deload
session is light *by design*, so it must not feed anything that reads "how strong are you / are you
progressing." `ExerciseHistoryEntry` gained a `deload?: boolean` flag, set in `completeWorkout()`, and
four separate reads now exclude flagged entries:
  - `effectiveLast()` prefers the most recent *non*-deload entry (falling back to a deload one only if
    the exercise has literally never been logged outside one) — without this, the week after a deload
    would progress up from 60% of the real working weight.
  - `deloadSuggestion()` filters them before reading its trend, or a finished deload would
    immediately register as a plateau and recommend another deload.
  - `completeWorkout()` skips the PR comparison entirely (`isPR = false`) and leaves the program
    slot's `ex.last`/`lastSets`/`sets`/`manualTarget` **untouched**, so normal training resumes from
    the real target rather than the deloaded one.
  - `fatigueRead()`'s RIR sampling ignores them.
Note `logic.ts` checks `e.deload !== true` inline rather than importing `isDeloadEntry()` from
`deload.ts` — `deload.ts` imports `deloadSuggestion()` from `logic.ts`, so importing back would be
circular. Same reason the deloaded-weight rounding lives in `recommendation()` rather than in
`deload.ts`: it needs `incrementForEquip()` to land on something actually loadable (60% of 102.5kg is
61.5kg, which no barbell can make).

The weight cut itself is a branch in `recommendation()` placed *after* the never-logged short-circuit
(a lift with no history has no working weight to take a percentage of, so it still gets first-time
baseline advice) but *before* every progression rule (none of them should run during a deload — the
whole point is to not add). Bodyweight/assisted lifts have no external load to strip, so they cut
reps/time instead. Warm-up ramps follow automatically, since `viewModel` already passes the current
working weight into `warmupInfo()` (phase 25).

Verified live end-to-end against `npm run dev` with seeded history: Push Day targets 100/60/175/80/30
lb dropped to 60/35/105/45/15 lb (all ≈60%, rounded to loadable increments, sets/reps unchanged),
the workout screen explained itself ("Deload week: 60% of your usual 100 lb"), a logged deload session
was written with `deload: true` and fired **no** PR, and — the key check — ending the deload returned
every target to *exactly* the pre-deload baseline rather than progressing from 60%. Also verified: the
early trigger firing at 3-of-4 weeks with named reasons, "push back" deferring one week and correctly
re-proposing after it, "skip" moving the anchor a full cadence out, auto-designation on week rollover
(`reason: 'scheduled'`), the closing half of that rollover, and the legacy banner still appearing —
alone — with the feature off. Zero console errors; `npx tsc -b` and `npm run build` both clean.

(29) **AI coach chat** (`src/components/CoachScreen.tsx`, `src/state/coach.ts`, `worker/`) — a 5th tab
that answers questions about the app, the user's own program/history, and general fitness, declining
everything else. This is the first feature in the project that is **not** fully client-side, and that
is forced, not a preference: the app is a static PWA on GitHub Pages, so an API key in the bundle
would be world-readable. A Cloudflare Worker (`worker/`, deployed separately from Pages) holds the
key and is the only thing that talks to the Anthropic API.

Three things live server-side deliberately, and moving any of them to the client would defeat the
feature: the API key; the system prompt + topic restriction (`worker/src/prompt.ts` — if the client
sent the system prompt, a user could edit the request in devtools and use the key as a general
purpose Claude, so the Worker ignores any `system` field a client sends and always builds its own);
and usage metering (`worker/src/usage.ts` — token counts come from the API response and are converted
to dollars server-side, since a client-reported number is trivially spoofable).

Metering is **stubbed but shaped for real use**: `checkBudget()` always allows and `recordSpend()` is
a no-op, but cost is really computed per request. Two decisions worth keeping if this is finished:
meter in **dollars, not tokens** (input/output are priced differently per model, so a token count is
not a budget), and prefer **D1 over KV** for the counter — KV is eventually consistent, so concurrent
requests can both read a stale balance. The `userId` the client sends is a device UUID
(`state/coach.ts`) and is explicitly **not** a security boundary: anyone can clear it for a fresh
budget. It is a placeholder for a real subscription-backed identity. The app store subscription wall
itself is not built and needs two things that don't exist yet — a native wrapper (Capacitor) since a
PWA isn't in any store and has no IAP to gate behind, and real accounts, since everything is
currently anonymous `localStorage`. See `worker/README.md`.

Cost control is a design constraint here, not an afterthought, because the whole point is a fixed
monthly budget. The dominant term is **history re-sending**: the full conversation is re-sent and
re-billed on every message, so an uncapped chat costs quadratically more as it goes. Hence
`MAX_HISTORY_MESSAGES = 20` in the Worker and `COACH_HISTORY_CAP = 40` client-side, plus
`MAX_TOKENS = 1024`, `effort: 'low'`, and a hand-built context projection (`buildCoachContext()`)
rather than sending `AppState` wholesale. At Opus 4.8 pricing a $5/month budget is roughly 150-400
messages; `MODEL` is a one-line swap to Sonnet/Haiku (both already priced in `usage.ts`) if that's
too few.

Three real bugs were caught during verification, all by driving the live UI rather than by reading:
- **Double-send double-spend.** The in-flight guard originally read `stateRef.current.coachPending`,
  but `stateRef` is refreshed in a `useEffect` — i.e. after commit — so two sends dispatched in the
  same tick both read the stale `false` and **both fired a request**. Confirmed against a mock
  backend: two clicks, two requests, one user message. Fixed with a synchronous `useRef` latch set
  before the first `await`, cleared in a `finally` (without the `finally`, a throw wedges the latch
  shut and the chat is dead until reload). Worth remembering generally: `stateRef` in this file is
  safe for reading state inside async work, but **not** as a same-tick re-entrancy guard.
- **Duplicate React keys.** Message ids were `c${Date.now()}` + a role suffix, which collide when two
  messages land in the same millisecond (a fast-failing request produces the user turn and the error
  bubble together). Now a `Date.now()` + monotonic counter.
- **"How's my Push Day day looking?"** — the suggested-prompt template appended " day" to a label
  that already ends in "Day".

Also: day labels repeat within a week (a PPL split has two different "Push Day"s), so the context
prefixes each with its weekday or the model cannot tell them apart. The 5-tab bar needed the font
dropped to 10px and horizontal padding to 8px to fit — measured, not guessed: "Achievements" is 69px
of label in a 71px tab, so it fits with nothing to spare; any longer label needs shortening.

Verified live at 375x812 against `npm run dev` with a mock backend standing in for the Worker
(scratch script, deleted): real program context serialized correctly, `hasSystem: false` on the wire
confirming the client never sends a system prompt, multi-turn history accumulating 1 -> 3 messages,
the conversation surviving a reload, the offline error bubble rendering distinctly from advice, and
three rapid clicks producing exactly one request. `npx tsc -b` clean for the app and
`tsc --noEmit` clean for the Worker against the real SDK. **Not verified: a real Anthropic API call** —
there was no API key available in this session, so the Worker's request/response path and the topic
restriction itself have never been exercised against the live API. That is the first thing to test.
Note `@anthropic-ai/sdk` had to be `^0.112.3` — 0.70 predates adaptive thinking and `output_config`
and fails to compile.

(30) **deloads are now trigger-based, not time-based** — a direct inversion of phase 28's hybrid.
Previously the cadence clock proposed deloads and the fatigue signals could only pull one *earlier*;
now the signals are the ordinary path and the week count survives only as a far-out backstop.
Scoping questions (via `AskUserQuestion`) settled: keep a backstop rather than removing the week
count entirely, keep evaluating at the week boundary rather than going session-scoped, and loosen
the thresholds (since with no schedule doing the work, the old two-signals-must-agree bar would
leave a genuinely stalled lifter waiting on the backstop).

- **Scoring is now tiered rather than "any two of three."** A plateau across the compounds (0.6) or
  recent sets averaging RIR ≤1 (0.6) each clear the 0.6 threshold *alone* — either is on its own the
  thing a deload exists to fix. Volume down >8% (0.35) and a new softer RIR band (avg 1–1.5, 0.35)
  are corroborators: too innocent to fire by themselves, but two of them together clear the bar.
- **`DELOAD_CADENCE` → `DELOAD_BACKSTOP_WEEKS`** (strength/hit 8, progressive_overload 9,
  general/endurance 12) and `cadenceFor()` → `backstopFor()`. Roughly double the old cadence values,
  deliberately: a schedule that fires routinely wants 4–6 weeks, a ceiling that should almost never
  be the reason you deload wants to sit well past where a real signal would have fired. Checked
  *after* the trigger path, so when both would fire the banner names the training reason, not a
  counter. `MIN_WEEKS_BEFORE_EARLY` (3) → `MIN_WEEKS_BEFORE_TRIGGER` (2), which doubles as the
  refractory period after a deload runs — the plateau read excludes deload entries, so a lift that
  was flat going in is still flat coming out, and without a floor the app proposes a second deload
  the week after the first.
- **"Skip this one" needed a real fix, not a rename.** It used to just move the anchor, which was
  sufficient when a cadence clock was what proposed deloads. A trigger doesn't reset — the flat
  lifts are still flat next week — so skip now also sets `deloadDeferUntilWeek` to
  `weekNumber + SKIP_SUPPRESS_WEEKS` (3). Without this, "skip" would have meant "ask me again at the
  next rollover." This is the one behavioural bug the inversion would have introduced silently.
- **Two migration details, since `AppState` fields are persisted and shallow-merged.** The field is
  still named `deloadCadenceWeeks` — renaming it would silently reset every existing user's choice —
  and `backstopFor()` clamps a pinned value up to `MIN_BACKSTOP_WEEKS` (6), because someone who
  pinned 3 under the old picker would otherwise keep a 3-week ceiling, i.e. the schedule this change
  removes. The Settings picker highlights against the *effective* backstop for the same reason, or
  those users see a picker with nothing selected. `deloadHistory.reason` gained `'fatigue'`/
  `'backstop'` and keeps legacy `'scheduled'`/`'early'` in the union so old persisted history
  typechecks.
- **Copy follows the mechanic.** Settings no longer counts down to a date that doesn't exist —
  `statusText` now reports what the app is actually seeing ("Watching — session volume is trending
  down, not enough on its own to call a deload yet" / "Nothing flagging right now. Safety net at
  week 9"), and the Program banner leads with the evidence ("Your training says deload — Bench
  Press, Overhead Press have gone flat") rather than a week count. `DeloadPlan` exposes the fatigue
  read even when it hasn't tripped, specifically so a quiet week has something honest to say.

Verified live against `npm run dev` with seeded history, checking each path in turn: the plateau
signal alone firing at week 4 (the old rules needed two signals and would have waited for the week-5
cadence), skip holding through weeks 5 and 6 and correctly resuming at week 7, a quiet week showing
no banner and the "nothing flagging / safety net at week 9" status, and the backstop firing at week
9 with "Nothing's flagged, but you've trained 9 weeks straight." Zero console errors; `npx tsc -b`
clean. Test state was cleared from `localStorage` afterward.

(31) **rest notifications: barbell badge, workout context, tap-to-return, motivational close-out.**
User report was that the phone toast "is a bell" and says nothing useful. Four parts:

- **The bell was the `badge`, not the `icon`.** These notifications already passed `icon-192.png`
  (the app icon), but that only renders once the shade is pulled down — the small monochrome glyph
  in the status bar is `badge`, and with none supplied Android substitutes a generic bell, which is
  therefore the *only* thing visible most of the time. Added `public/badge-96.png`, a solid-white
  barbell on transparency. Android uses the alpha channel only and tints the result, so it has no
  interior shading — anything shaded flattens into a blob at ~24dp. Generated by
  **`scripts/make-badge.mjs`**, which is deliberately *kept in the repo* (unlike the app-icon
  generator — see Deployment above, where losing it is recorded as a mistake); `sharp` stays a
  `--no-save` install since it runs approximately never. `reminders.ts` got the same badge, and its
  `icon` was fixed to be `BASE_URL`-relative — the bare `'icon-192.png'` resolved against the page
  URL, which is wrong under the `/alpha-lifts/` production base.
- **Both notifications now carry the live session.** New `RestContext` in `alerts.ts`
  (exercise name / "Set 2 of 3" / "135 lb × 8" / day label), assembled by `restContext()` in
  `useApp.ts` — the module holds no state and does no lookups, the same division that keeps the
  service worker out of the "which exercise?" question. The set named is the one being rested
  *into* (first not-yet-ticked), falling back to the last set when the exercise is finished.
  Countdown title leads with the clock (`"1:59 rest · Bench Press"`) since that's what's being
  glanced at, and its body omits the exercise name the title already carries; the completion body
  keeps it, because its title is the motivational line instead.
- **Tapping the countdown did nothing before.** `sw.ts`'s `notificationclick` bails on any
  notification without a recognised `data.type`, and the countdown carried no `data` at all — so
  only the *completion* alert was tappable. Both types are handled now.
- **The completion line is motivational and voice-aware**, reusing the existing Coach Voice setting
  (Direct / Encouraging / Hype) rather than inventing a fourth tone, picked at random from four
  lines per voice. It's the notification **title**, not the body: on a locked phone the title is
  frequently all that renders, so the one thing this alert exists to say has to be there. Lines are
  written short deliberately — Android truncates titles around 40 characters.

**Verifying this needs a production build, not the dev server.** There's no service worker under
`npm run dev`, so `navigator.serviceWorker.ready` never resolves and every tray call silently hangs
— the first attempt at verification looked like a code bug and wasn't. Use the documented subpath
technique (build, copy `dist/` into a folder named `alpha-lifts`, serve its *parent*). Two traps
found doing it: re-copying `dist/` into an existing staging folder leaves **stale hashed assets**
alongside the new ones (wipe the folder first, or you'll verify against old code — this produced a
genuinely confusing "the fix didn't apply" result), and the SW serves the previous precache until
unregistered and reloaded twice.

Verified that way with `ServiceWorkerRegistration.prototype.showNotification` patched to record
every call: countdown posted `"1:59 rest · Bench Press"` / `"Set 2 of 3 · 135 lb × 8 · Push Day"`
with `badge: /alpha-lifts/badge-96.png` and `data.type: 'rest-progress'`; completion posted
`"Time to move some weight! ⚡"` / `"Bench Press · Set 2 of 3 · 135 lb × 8 · Push Day"` under the
separate done tag. Badge asset served 200 as `image/png`, built `sw.js` contains both types, and
the tap path was exercised by dispatching the worker's `open-rest-exercise` message at the page
from the Program screen — it landed back in the workout on Bench Press. `npx tsc -b` and
`npm run build` both clean.

(32) **sixth muscle-diagram calibration pass (arms + legs, per user feedback), and Forearms became
the 12th muscle.** User: the map was "still slightly off," primarily arms and legs; scoping
questions settled that everything about the arms bothered them (spill past the elbow, coverage,
position, *and* missing forearms), plus "quads aren't going up high enough — you should carefully
trace the muscle that is drawn in," blocky glutes, and front calves sitting on the shin. Asked how
forearms should light up, the user chose a real 12th muscle over a visual-only hack.

Diagram (same sharp-crop-grid → author → composite → iterate technique as phase 21, coordinates
read off zoomed grid crops before drawing anything, two candidate iterations):
- **Quads now rise to y≈412** — the drawn rectus-femoris/TFL notch at the hip, upper-inner edge
  following the sartorius diagonal. The old top at y≈490 left the entire upper quarter of the
  drawn quad unshaded, which was the user's headline complaint.
- **Biceps/Triceps end at the elbow crease** (drawn as a diagonal, so the bottom edges are too)
  instead of spilling ~25px into the forearm; both retraced along with the delts/rear-delts.
- **New Forearms regions on both views**, elbow to wrist band, seamed against the arm regions.
- **Glutes are the drawn tilted egg** (rounded dome top under the lat tips, medial edge leaving
  the sacrum gap) instead of a squared-top box; **hamstring bellies stop at y≈676** where the art
  splits into the knee tendons (the old tip poked to 696, shading the back of the knee); **front
  calves sit on the drawn lower-leg muscle mass** ending above the ankle tendons (the old blob ran
  down the shin toward the ankle); back calves' bottom follows the two gastroc lobes.
- Rule now explicit in the component comment: adjacent muscles are separate semi-transparent
  paths, so any overlap renders as a visibly darker band — every seam (delt/biceps,
  triceps/forearm, lat/glute) was trimmed to abut, not cross. The lat-wing bottom tips were
  lifted to y≈394-410 as part of this.

Forearms as a muscle — the four free-exercise-db forearm exercises
(`palms_down_wrist_curl_over_a_bench`, `palms_up_wrist_curl_over_a_bench`, `reverse_curl`,
`seated_palms_down_wrist_curl`) already existed tagged 'Biceps' (the import had nowhere else to
put them, see the import notes above) and were **re-tagged rather than authoring new entries** —
they keep their real photos, cues, and videos. Grip-heavy pulls (deadlift variants, rows, chins,
shrugs, carries, hammer/zottman curls) got 'Forearms' secondary so they light the diagram;
secondaries earn no volume-bar credit (muscleVolumes() is primary-only), which is why the wizard
also programs direct work — Forearms joined the pull/upper/arms/full_body themes and lists, with
the other two wrist curls as dedupe-pool alternates. Three interacting numbers were tuned by a
before/after audit (via `git stash` for the baseline), not by feel:
- **MUSCLE_TARGETS.Forearms = 7, not 6 or 8**: 6×0.4 (the HIT multiplier) = 2.4 target sets has
  no integer inside the balancer's 85-115% band, so every HIT program under- or overshot;
  7×0.4 = 2.8 rounds cleanly to 3.
- **MAX_DAY_TIME_SEC 65→75 min** (wizard.ts): the forearm slot's initial sets consumed enough day
  time that Back's balancer top-up on Upper/Lower × Progressive Overload was gated out entirely
  (Back stuck at 75%). Audited at 65/75/85: 75 lands strictly better than pre-change (6
  out-of-band combos vs 10, all six inherited day-time-capped cases like bro-split × endurance);
  85 fixes one more combo but inflates several default days to ~86-87 minutes.
- **Full Body achievement thresholds pinned at 6/11** instead of derived from the muscle count:
  unlock state recomputes every render, so deriving would have raised the top tier to 12 and
  silently re-locked the badge for anyone who'd earned it at 11 — the monotonicity rule's one
  forbidden outcome. "Full Body" is thus earnable without direct forearm work, deliberately; if a
  13th muscle is ever added, leave these pinned for the same reason.

Two traps hit and worth remembering:
- **PowerShell `(Get-Content -Raw) -replace ... | Set-Content` corrupts UTF-8** (em-dashes became
  mojibake, including user-facing split descriptions in wizard.ts) — Windows PowerShell 5.1 reads
  as ANSI without an explicit `-Encoding`. Repaired via the Edit tool; make source edits with the
  Edit tool, not shell round-trips.
- The dev-server console showed **"change in the order of Hooks" errors that were stale HMR
  artifacts**, not bugs: the browser tool's console buffer is append-only per tab (it survives
  reload and even `console.clear()`), and the recorded diffs matched the session's earlier
  useApp.ts HMR patches exactly, with nothing new appended across fresh-reload navigations.
  Diagnose by comparing error counts across reads before chasing a phantom conditional hook.

Verified live against `npm run dev`: fresh onboard (PPL6 × PO) shows a Forearms bar at 114%, pull
days at 7 exercises ~50 min, the Forearms drill modal lists wrist curl + reverse curl (deduped
across the two pull days) with Biceps as linked secondary; the day-view body diagram was
rasterized out of the live DOM for both views (the screenshot tool hung again — the
XMLSerializer+canvas fallback documented in phase 20 worked, with the base64 pulled out in
~140KB chunks and reassembled via PowerShell) confirming Pull Day lights back/rear-delts/forearms
and Leg Day lights quads-to-the-hip/calves/core, all inside the drawn contours. The audit script
was a throwaway `.verify/audit.ts` run with `npm install --no-save tsx` (deleted after, per
convention — rebuild from the description above if needed). `npx tsc -b` and `npm run build`
clean.

(33) **the AI coach actually shipped** — phase 29 built it but nothing had ever run: no Anthropic
call had been made and the Worker had never been deployed. It is now live end to end. Three
things were broken between the committed code and a working deployment, and only the last was a
user action:

- **`ALLOWED_ORIGINS` named the wrong site.** It read `https://ryanhouse19.github.io` — a guess
  the worker README had flagged as such — but the remote is `rhconsultinghub/alpha-lifts`, so
  Pages serves from `https://rhconsultinghub.github.io`. The Worker 403s an unlisted origin
  *before* calling the API, so every message would have failed while costing nothing, presenting
  as a broken deploy rather than a one-line typo.
- **`deploy.yml` never passed `VITE_COACH_API_URL`**, so the production build inlined an empty
  string and shipped the "not configured" tab regardless of what was deployed.
- **The repository variable was set under the *Agents* scope, not *Actions*.** This is the one
  worth remembering: GitHub's Settings → Secrets and variables has separate scopes, and variables
  under Agents (for the Copilot coding agent) are invisible to workflow runs. `vars.X` silently
  resolves to an empty string, the build succeeds, and the app ships behaving exactly as though
  the coach was never configured. Nothing errors anywhere.

**The diagnostic that cracked it:** the built asset filename never changed
(`index-05CodC0H.js` across every poll). Since the intervening commits only touched
`wrangler.toml`, the README and `deploy.yml` — none of which are bundled — an unchanged content
hash proved the *bundle input* was unchanged, i.e. the variable was still arriving empty, rather
than the workflow merely not having run. Polling `https://rhconsultinghub.github.io/alpha-lifts/`
for the asset hash and grepping the JS for `workers.dev` is a cheap, reliable way to answer "did
my build-time env var actually land?" without any GitHub API access. It flipped to
`index-DkTkMCFE.js` with the URL inlined the moment the variable moved to the Actions scope.

`deploy.yml` now accepts the value from `vars` **or** `secrets` (`vars.X || secrets.X`), since
storing it as a secret is the natural instinct and produces the same silent empty-string failure.

**Verified against the real API for the first time.** Direct POSTs at the deployed Worker: a
disallowed origin got 403 with no API spend; an in-scope question returned a coherent answer that
used the program context; an off-topic request ("write me a Python script") was declined in the
coach's own voice. Then the definitive test — the same thing from the *deployed app in a real
browser*, which is not the same test: a script can forge an `Origin` header, but only a browser
enforces the response's `Access-Control-Allow-Origin`. It answered "How's my Push Day looking?"
by naming the five real exercises off `localStorage` and correctly declining to characterise
progress it had no logged data for. Zero console errors.

**First real cost data: ~$0.005–0.007 per exchange** (6,685 and 5,030 microUSD; ~700 input
tokens, 60–120 output), *below* the worker README's $0.01–0.03 estimate — but that is the floor,
measured on single messages. Input is re-sent and re-billed every turn, so cost concentrates in
long conversations at the 20-message cap with a full program context. Measure a real
back-and-forth before pricing anything publicly; `MODEL` is `claude-opus-4-8` and switching to
`claude-sonnet-5` is one line, already priced in `usage.ts`.

**Still open, and the gate on any public release:** the coach is unmetered. `checkBudget()`
always allows and `recordSpend()` is a no-op (deliberate stubs, see phase 29). The origin
allowlist stops another *website*, but not a script posting a forged `Origin` — and the Worker
URL is public in the bundle by design. Fine for single-user testing; closing it is the same work
as the subscription phase. An Anthropic console monthly spend limit is the interim backstop.

(34) **the coach can now act on the app, not just talk** — tool use, wired as **propose-and-confirm**.
Scoping questions (via `AskUserQuestion`) settled: changes are *proposed* (a confirm card in chat,
nothing mutates until the user taps Apply), and all four capability groups ship at once — stats/read,
edit-a-day (add/swap/remove/set-params), build-a-plan, and log/navigate.

The load-bearing design decision is that **the coach's tools are all `propose_*` and the Worker
treats a tool call as *terminal* — it never sends a `tool_result` back for another round trip**
(`worker/src/tools.ts`, `worker/src/index.ts`). A tool call *is* the answer: the Worker forwards the
tool name + input to the client as a proposal, and the real mutation only runs locally when the user
confirms. Consequences that make this the right shape here:
- **The Worker stays stateless and app-agnostic** — it never needs EXLIB or AppState, only relays
  intent. It also never mutates anything, so the security surface is unchanged from the read-only coach.
- **Cost stays close to the read-only coach** because there's no second billed API call to resolve a
  `tool_result`. Reads are handled the *same* cheap way — not as tools, but by an **expanded context
  block** (`buildCoachContext` in `state/coach.ts` now ships aggregate stats: `muscleBarsList` %s,
  top lifts by est. 1RM, PR count, best-ever streak, lifetime & best-session volume) plus a compact
  **exercise catalog** (id-less, name-only, grouped by muscle). So "what's my bench 1RM / is my back
  volume ok" needs no tool at all. The catalog + stats add ~700–1500 input tokens/message (re-sent and
  re-billed every turn like all context), pushing a typical exchange from ~$0.005–0.007 toward
  ~$0.012–0.02 — still inside the worker README's original estimate. If that's too much later, the
  catalog is the thing to trim first.

**Name resolution is client-side and deliberately forgiving.** The model references exercises and days
by their *human names* (exactly as they appear in the context it was given), never machine ids —
`parseProposals()` in `state/coach.ts` resolves those back to ids/day-keys with the same normalized-name
match the rest of the app uses (phase 22), plus substring and a ≥0.6 token-overlap fallback so a
paraphrase like "Romanian Deadlift" still lands on `rdl`. An unresolvable name (unknown exercise, wrong
day) becomes a **dismissable error card with no Apply button**, never a wrong mutation. Resolution runs
against `stateRef.current` at parse time (post-await), not the pre-request snapshot, so a proposal
resolves against the program as it actually is now if the user edited it mid-request.

**Applying** is done by new *direct* program actions in `useApp.ts` (`applyProposalToState` +
`applyCoachProposal`/`dismissCoachProposal`), not by driving the swap/add **modal** state machines — the
coach isn't in a modal flow. Each mutation mirrors an existing, already-verified action almost
line-for-line (e.g. swap mirrors `swapConfirm`'s non-session replace path, including clearing a dangling
`supersetGroup` on the touched exercise's former partner). `set_params`' rep change writes a
`manualTarget` override (cleared on next log), same reasoning as the Day-View quick-edit — `ex.last`
alone is silently outranked by cross-day `exerciseHistory` in `effectiveLast()`. `build_program`
replaces the active program via `buildProgramFromPreset` and stashes the outgoing one into
`savedPrograms` (like `createProgramFromWizard`) but deliberately **stays on the coach screen** — the
confirmation card is the feedback; yanking the user to the Program tab mid-conversation isn't. Only a
`propose_navigate` proposal changes the screen. Proposals live on the assistant `CoachChatMessage`
(`proposals?: CoachProposal[]`, each with a resolved `payload` or an `error`, and a `pending →
applied|dismissed` status that's terminal); the card UI is `ProposalCard` in `CoachScreen.tsx`.

The Worker's system prompt gained a `TOOL_RULES` block (`worker/src/prompt.ts`) telling the model to
call a `propose_*` tool rather than describe manual steps, reference exercises/days by their exact
catalogued names, include one line of text alongside a tool call, ask (don't guess) when a request is
ambiguous, and *not* use a tool for pure questions.

Small robustness change worth noting: `COACH_API_URL` now reads `import.meta.env?.VITE_COACH_API_URL`
(optional chain) so `state/coach.ts` can be imported in a bare Node/tsx context for `.verify` scripts;
harmless under Vite.

Verified two ways. (1) A throwaway `.verify/` tsx script (deleted after, per convention) drove
`buildCoachContext` + `parseProposals` against a real `buildProgramFromPreset` program: exact names,
the "Close Grip Bench Press" and fuzzy "Romanian Deadlift" cases, and all three failure cases (unknown
day, unknown exercise, exercise-not-on-that-day) resolved correctly, and stats/catalog/day-name format
came out right. (2) **Live end-to-end against `npm run dev` with a mock Worker** (a scratch node server
that reads the real `context` the client sends and returns proposals referencing the user's actual first
training day — since there was no API key in this session, exactly as phase 29 did): sending a message
rendered the three proposal cards (add / log-bodyweight / an intentionally-unresolvable one showing
Dismiss-only); tapping Apply on the add card **actually appended `face_pull` to the Push day** in
`localStorage` and flipped only that card to "✓ Applied" (the others stayed pending); the bodyweight
Apply logged 180 lb → 81.65 kg dated today; the error card dismissed; and a "build me a strength plan"
message's `build_program` card, on Apply, **replaced the program with an Upper/Lower Strength split,
stashed the old "Test PPL" into saved programs, and stayed on the coach screen**. Zero console errors;
`npx tsc -b` (app) and `tsc --noEmit` (worker) both clean, `npm run build` clean.

**Not verified: a real Anthropic API call.** No API key was available this session, so the actual
tool-emitting behaviour of the deployed model — whether it reliably calls `propose_*` vs. describing
steps, and picks correct catalogued names — has never been exercised against the live API, only against
the mock. That's the first thing to test, and it needs the Worker **redeployed** (the `worker/` changes
— tools, prompt, terminal-tool response shape — are not live until `wrangler deploy`); the Pages build
picks up the client changes automatically on push. Same live-vs-mock caveat as phase 29/33.

(35) **per-device monthly spend cap turned on** — closing part of phase 33's "the coach is unmetered"
open item. `checkBudget()`/`recordSpend()` in `worker/src/usage.ts` are no longer stubs: they read/write
a KV namespace (binding `USAGE`, added to `wrangler.toml` + `Env`) keyed `spend:<userId>:<YYYY-MM>` (UTC
month, ~40-day TTL so a new month self-resets with no cron), and block with the existing 402
`budget_exhausted` (already mapped client-side to "You've used up this month's coach messages") once a
device passes `MONTHLY_LIMIT_MICRO_USD = 1_500_000` ($1.50). Requested scope (via `AskUserQuestion`):
**per-device**, not a global worker-wide cap — matches the existing `checkBudget(userId)` shape and the
"don't waste your own budget" framing. The caveat is recorded in-code and in the README: `userId` is a
bypassable device UUID, so this limits an ordinary user on their own device but is **not** a defence
against a forged-Origin script — an Anthropic Console monthly spend limit remains the real global
backstop, and is the recommended companion. KV (not D1) chosen deliberately: eventually consistent, so a
race can under-count by a message or two, which is fine slop on a $1.50 personal cap and needs zero
schema/setup beyond `wrangler kv namespace create`. **Fails open** when the binding is absent
(`limit: 0`), so a build without the namespace behaves like the old stub rather than locking the coach
out. Verified the logic against a fake KV (throwaway, deleted): fresh device allowed, blocks at exactly
$1.50 after ~100 × $0.015 exchanges, a second device independent, and no-binding → allowed. `tsc
--noEmit` clean. **Not verified against real KV/live API** (no key/deploy this session) — same gate as
phase 34: needs `wrangler kv namespace create USAGE`, the id pasted into `wrangler.toml`, then
`wrangler deploy`. To change the cap later, edit `MONTHLY_LIMIT_MICRO_USD` and redeploy.

(36) **coach access allowlist** — an opt-in invite gate for the "private now, paid later" plan the
user described (private for now; eventual Google Play / App Store paid release). The key design idea,
which is what makes it not-throwaway: access is **one swappable function** `isEntitled(env, userId)`
in `worker/src/access.ts`, sitting right before `checkBudget` in the request path
(`isEntitled → checkBudget → API`). Today it checks an allowlist; the public-web phase replaces the
*body* of that one function with a Stripe-subscription lookup, and the app-store phase with an
Apple/Google IAP-receipt lookup — nothing else in the Worker changes. Scoping (via `AskUserQuestion`
across three turns): monetization is wanted *eventually* and via the app stores (which means IAP, not
Stripe, for the store builds — and a native wrapper, a separate future project — since Apple/Google
require their own billing for in-app digital subscriptions and reject thin webview wrappers); for
*now* the user chose a **lightweight allowlist** over a shared code or leaving it open.

- Gate is controlled by `REQUIRE_ALLOWLIST` (`wrangler.toml` var, default `"false"` = off/allow-all).
  When `"true"`, an id must have an `allow:<id>` key in the **same `USAGE` KV namespace** as the spend
  counters (approve/revoke with `wrangler kv key put/delete --binding=USAGE "allow:<id>" "1"`).
- **Fails closed** when required-but-KV-missing (opposite of `checkBudget`, which fails open) — an
  access gate that can't read its list must deny, or "require allowlist" would silently mean "allow
  everyone" on a misconfig. Documented inline in `access.ts`.
- Identity is still the client's device UUID (`userId`), explicitly not a security boundary — an
  invite list you hand-approve, not abuse-proof (someone can mint a fresh id; you'd approve each). It
  becomes a verified account id in the paid phases. This is *why* the eventual real gate is a paywall,
  not this list.
- Client: new `not_entitled` 403 → error bubble "This device isn't approved… share your Coach ID";
  the id itself is now surfaced at the bottom of the Coach tab (`coachVM.deviceId` → `CoachIdFooter`
  in `CoachScreen.tsx`, with a copy button) so a user can send it to be approved. `deviceId()` is the
  same value already sent as `userId`, so nothing new is minted.

Verified: `isEntitled` against a fake KV (gate off → allow; on+no-KV → deny; on+not-listed → deny;
on+listed → allow; other device → deny) and **live against `npm run dev` + a mock returning 403
`not_entitled`** — the Coach ID footer rendered with its Copy button, and a send produced the correct
"not approved / share your Coach ID" error bubble directly above the id. (Browser-tool button clicks
didn't register in this run — a coordinate/focus quirk, not a bug; a programmatic `.click()` fired
`sendCoachMessage` correctly, confirmed via the resulting user+error messages in `localStorage`.) Zero
console errors; `npx tsc -b` (app), `tsc --noEmit` (worker), and `npm run build` all clean.

**A note on the paid roadmap for whoever picks this up** (captured so the plan isn't re-derived): the
worker README's old "you need a native app + IAP" framing conflated *identity* with *the store*. For a
**web** release, Stripe (or a merchant-of-record like Paddle/Lemon Squeezy, which also handles global
sales tax) subscribes users directly with no app-store cut — the lighter path. App-store builds are a
genuinely separate, heavier phase (native wrapper: TWA for Play is easy, Apple needs Capacitor + real
native feel; plus StoreKit/Play Billing IAP + server-side receipt verification writing the same
entitlement record). All three monetization methods are just different *writers* to the entitlement
`isEntitled` reads. A per-user budget stays relevant even behind a paywall — there it's unit-economics
(cap a subscriber's token cost below their price), not abuse defence.

(37) **premium-locked screen for the coach** — the free/premium split made visible. Confirmed model:
the whole tracker (programs, workouts, history, progress, achievements, body diagram — all offline,
client-side) stays **free**; only the coach and any future AI feature sit behind the gate, because the
coach is the only thing that talks to the Worker. This phase adds the proactive upsell screen a
non-entitled user sees *instead of* the chat, rather than only discovering the block on first send.

The problem it solves: entitlement was only known server-side at send time, so a locked user saw a
normal chat and hit the wall on send. To show a locked screen *upfront*, the client has to know
entitlement before interaction — so the Worker gained a **status probe**: a POST with `{ op: 'status' }`
that runs `isEntitled` (+ `checkBudget`) and returns `{ entitled, budgetOk, spent, limit }` with **no
Anthropic call and no cost**. `index.ts` now evaluates `isEntitled` once up top and reuses it for both
the probe and the real send. The probe's `entitled` is **advisory UI state only** — the real block is
still the server-side gate on the actual send, so a spoofed `entitled: true` buys nothing (the send
still 403s).

Client wiring:
- `fetchCoachStatus()` in `state/coach.ts` → 'entitled' | 'locked' | 'unknown'. **'unknown' on any
  network/parse failure** (offline, Worker down) and renders as the chat, never the lock — we don't
  strand someone behind a paywall because a probe failed; the send is gated regardless.
- `AppState.coachEntitlement` (default 'unknown', in `types.ts`/`initialState.ts`; the type lives in
  `types.ts` to avoid a coach.ts↔types circular import). `refreshCoachEntitlement()` action probes and
  stores it, called from a mount-only `useEffect` in `CoachScreen` (same pattern as
  `markAchievementsSeen`) so it re-checks each time the tab opens.
- `viewModel` exposes `coach.locked` (= entitlement === 'locked') + `coach.refreshEntitlement`.
  `CoachScreen` renders `<CoachLockedScreen>` when `configured && locked`, else the chat.
- `CoachLockedScreen` is the premium pitch: 🔒, "The AI Coach is a Premium feature", a "everything else
  stays free" line, a four-item feature list (ask about lifts/form, stats explained, add/swap by asking,
  build a plan from chat), and a "Getting access" block reusing `CoachIdFooter` (the Coach ID + Copy).
  **In this private phase the CTA is the Coach ID** (share it to be allowlisted) since there's no
  checkout yet — when payments ship, that block becomes a real Subscribe button and nothing else about
  the screen changes. It's the reusable template for gating any future AI feature.

Verified live against `npm run dev` + a mock returning `entitled: false` on the status probe: opening
the Coach tab fired the probe on mount and rendered the locked/upsell screen (full feature list + access
copy + Coach ID/Copy) with no send, while the Program tab (a free feature) still loaded normally —
confirming only the coach is gated. Zero console errors; `npx tsc -b` (app), `tsc --noEmit` (worker),
`npm run build` all clean. Not exercised against real KV/live API (no key/deploy this session), same as
phases 34–36; the status route ships with the next `wrangler deploy`.

Follow-up: intended price set to **$5/month** (`PREMIUM_PRICE`/`PREMIUM_PERIOD` constants in
`CoachScreen.tsx`, single source of truth). The locked screen now shows "$5 / month" + a **disabled
Subscribe button labelled "Coming soon"** above the invite block — the offer is visible, but the button
is inert until checkout exists (wire its `onClick` to Stripe/IAP in the payments phase, then drop the
"Get access now" Coach-ID block). Verified live: the price, button, and invite path all render.
Unit-economics sanity check for later: at $5/month against the current $1.50/device token budget
(phase 35), margin is ~$3.50 before Stripe/app-store fees, and a subscriber can send ~75–150 messages
before the cap — raise `MONTHLY_LIMIT_MICRO_USD` if that headroom is too tight for a paid tier, keeping
it under $5.

(38) **user accounts + full cloud sync** — the "Phase 2 / Real user identity" the worker README had
long described as the missing piece. Everything is now tied to a signed-in account: the whole AppState
blob syncs to the server and follows the user across devices, and the coach's entitlement/budget key on
the **account** instead of the throwaway device UUID. Chosen stack: **Cloudflare-native** (reuse the
existing coach Worker + KV, add **D1** + a Worker-signed session), so there's still one deploy story and
no new vendor. Email + password auth; sign-up is **open** (flip to invite-only by rejecting unknown
emails in `handleSignup` — one line). Built and verified end-to-end in one session across six phases;
all live-tested against a local `wrangler dev` + `npm run dev` with browser automation.

Backend (`worker/`):
- `schema.sql` — D1 tables `users` (id, email, password_hash, created_at, + subscription fields
  `plan`/`sub_status`/`current_period_end`) and `user_state` (user_id, `state_json`, `version`,
  `updated_at`). Re-runnable (`IF NOT EXISTS`). New bindings in `wrangler.toml`: `[[d1_databases]]`
  `DB` + a `SESSION_SECRET` secret. Both optional — the account routes 503 `accounts_not_configured`
  when absent, so the coach still runs on a build that hasn't set up D1 yet.
- `src/auth.ts` — all WebCrypto, no deps: PBKDF2-SHA256 password hashing (self-describing
  `pbkdf2$iter$salt$hash` string so params travel with the hash) + HS256 JWT sessions (30-day, signed
  with `SESSION_SECRET`; rotating the secret is the break-glass revoke). `authenticate(request)` pulls
  the bearer token and verifies it — **identity is always derived from the signed token, never trusted
  from the body.**
- `src/db.ts` — all D1 queries. `src/handlers.ts` — `/auth/signup`, `/auth/login`, `/auth/me`,
  `GET/PUT /state`. `src/http.ts` — shared CORS (now allows `Authorization`) + `json()`, factored out
  of `index.ts`. `index.ts` gained a small path router in `fetch` and the coach became `handleCoach()`;
  its identity line now prefers `session.sub` over `body.userId`. Login verifies against a dummy hash on
  the user-not-found path so timing doesn't leak which emails are registered.
- `src/access.ts` `isEntitled` extended: an **active subscription** on the account (`sub_status ==
  'active'` in D1) grants coach access outright, else it falls back to the existing KV invite allowlist.
  A device UUID never matches a `users` row, so this quietly no-ops for anonymous callers. When billing
  lands, writing `sub_status='active'` is all it takes to entitle a user. (`REQUIRE_ALLOWLIST` is still
  `"true"`, so a brand-new free account correctly sees the locked coach until subscribed/allowlisted —
  that's the intended paid-product behaviour, and the allowlist keys on **account id** now, not device.)

Client (`src/`):
- `state/auth.ts` — token/account persistence (own localStorage keys, **not** in the synced blob, same
  reasoning as `deviceId`), `signup`/`login`/`fetchMe`, friendly error mapping. `AUTH_CONFIGURED ===
  COACH_CONFIGURED` (same Worker URL, `VITE_COACH_API_URL`) — **no new env var.** When unconfigured the
  whole account layer is inert and the app runs anonymous/local-only exactly as before, which is what
  keeps a no-backend build (and the current deployment pre-URL) working as a plain PWA.
- `state/AuthContext.ts` + `components/AuthGate.tsx` (wraps `<App>` in `main.tsx`) + `components/
  LoginScreen.tsx`. Gate logic: not configured → app directly; stored token → show app on cached account
  immediately and revalidate via `/auth/me` in the background (only a definitive `unauthorized` signs
  out; a network failure keeps the user in — offline PWA); no token → login screen. **The `/auth/me`
  revalidate deliberately has NO cancel-on-cleanup flag** — with the `validated` ref already deduping the
  fetch, a cancel flag would let StrictMode's post-first-invoke cleanup discard the only fetch's result
  and drop the account refresh (this was a real bug caught in verification: Settings showed "Free plan"
  for a pro account until the flag was removed).
- Sync (`state/sync.ts` + `components/SyncBoundary.tsx` + `state/useCloudSync.ts`): the whole app is one
  localStorage blob, so sync mirrors that blob. `<SyncBoundary>` runs `reconcileOnSignIn` (pull + decide)
  **before** `<App>` mounts, so `useApp`'s `loadInitial` reads an already-reconciled blob — no flash of
  stale data. `useCloudSync(state)` (called in `App.tsx`) debounced-pushes (1.5s) on change and retries a
  pending push on the `online` event. Model is **last-write-wins, single-user-across-devices** (the
  actual use case) via a `alpha-lifts-sync-meta` record tagging the local blob with its `accountId` +
  `dirtyAt`. That account tag is what makes cross-account privacy work: a second account signing in on the
  same device can't see the first's data — reconcile sees the tag mismatch and adopts the new account's
  (empty) server state instead. First sign-in with real anonymous local data carries it up as the
  account's starting state (the migration path).
- `components/modals/SettingsModal.tsx` — an ACCOUNT section (email, subscription status via
  `subscriptionLabel()`, Sign out) at the top, consuming `useAuth()` directly. Sign out clears the
  session (returns to login) but **not** the local blob — reconcile handles identity, and keeping it lets
  the same user log back in offline.

Verified live end-to-end (browser automation against local `wrangler dev` + `npm run dev`, per this
project's usual approach): Worker routes exercised directly first (signup/login/me, state pull/push with
version bump, plus every reject path — 409 dup, 400 short password, 401 unauthorized/bad creds, 403 bad
origin, and case-insensitive email). Then in-browser: signup → onboarding (fresh account) → complete
onboarding → **push** confirmed on the server (version 1, 7 days); wipe local + reload → **pull** restored
the program (no onboarding); logout → login on a wiped device → pulled the program; account entitlement
flips `entitled:false`→`true` when the account's `sub_status` is set to `active` (device-id path stays
false); Settings shows the account + subscage; sign out returns to login; and a second account on the same
device gets a clean onboarding with **zero leak** of the first account's program. `npx tsc -b`, worker
`tsc --noEmit`, and `npm run build` all clean.

**Still not built (deliberately deferred, same as the coach's payment phases):** self-service password
reset (needs an email provider — Resend/Postmark; signup/login/sync all work without it) and actual
billing (Stripe on web / StoreKit 2 / Play Billing) that would *write* `sub_status`. The subscription
column + entitlement seam are in place; a billing phase only needs to flip the flag. **Deploy setup the
owner must run once** (needs their Cloudflare account — Claude can't): `wrangler d1 create alpha-lifts-db`
→ paste the id into `wrangler.toml` → `wrangler d1 execute alpha-lifts-db --remote --file=schema.sql` →
`wrangler secret put SESSION_SECRET` → `wrangler deploy`. Local dev mirrors this with `--local` + a
`SESSION_SECRET` line in `worker/.dev.vars`.

**Deploy setup was completed** the same session (D1 `alpha-lifts-db` created — id
`6ad3186c-a28a-4385-98f3-4a2853aef3ac` committed in `wrangler.toml`, remote schema applied, and the
owner set `SESSION_SECRET` + ran `wrangler deploy`). To grant a specific account coach access,
recognize them by email and flip the flag directly (no id needed from the app):
`wrangler d1 execute alpha-lifts-db --remote --command "UPDATE users SET sub_status='active', plan='pro'
WHERE email='...';"` — or add `allow:<account-id>` to the `USAGE` KV namespace (get the id via a
`SELECT id, email FROM users`). `REQUIRE_ALLOWLIST` is left `"true"`, so a new free account correctly
sees the locked coach until subscribed/allowlisted.

(39) two same-session follow-ups to phase 38:

- **Removed the in-app Coach/account id display.** The Coach tab and the locked screen used to show a
  "Coach ID: …" with a Copy button (for sharing to be allowlisted). After phase 5 that footer was showing
  the wrong id anyway — the *device* UUID, while the gate now checks the *account* id from the login
  token — and the owner grants access by email on the backend, so surfacing any id in the app is
  pointless. Dropped `CoachIdFooter` and the "share your Coach ID" copy from both places, removed the
  now-unused `coach.deviceId` viewModel field (`deviceId()` the function stays — it's still the
  anonymous-fallback `userId` sent in coach requests). The locked screen now just says access is enabled
  per account. If access-granting ever needs to be self-serve again, surface `auth.account.id` (the real
  gated id), not `deviceId()`.

- **Fixed PWA auto-update so a new deploy no longer needs an uninstall/reinstall.** Root cause: with
  `strategies: 'injectManifest'` the plugin's auto-injected `registerSW.js` was the bare
  `navigator.serviceWorker.register(...)` — it registered the worker but had **no reload-on-new-SW**
  handler, so even though `sw.ts` calls `self.skipWaiting()`/`clientsClaim()`, the already-open page kept
  running the *old* precached bundle; combined with Android not re-checking for a new SW on
  background-resume, only a reinstall reliably updated. Fix: `injectRegister: false` in `vite.config.ts`
  and register manually in `main.tsx` via `registerSW()` from `virtual:pwa-register` (types added in
  `src/vite-env.d.ts` — `vite/client` + `vite-plugin-pwa/client`). With `registerType: 'autoUpdate'`,
  `registerSW()` reloads the page as soon as a new SW takes control (workbox-window's
  `updatefound`/`controllerchange` lifecycle, now bundled), and `onRegisteredSW` calls
  `registration.update()` on every `visibilitychange`→visible so a resumed PWA re-checks the moment it's
  foregrounded — an unobtrusive point to reload (the user is arriving, not mid-set), and app state
  survives a reload anyway (persisted + synced). **Bootstrap caveat:** the device still running the old
  bare registration needs this version installed once (a final reinstall); every update after that applies
  automatically. Verified `injectRegister: false` dropped `dist/registerSW.js`, the manifest link is
  still present (installability intact), and the workbox-window update/reload logic is now in the app
  bundle. `npx tsc -b` + `npm run build` clean. Not device-tested (that's the owner's phone), but the
  mechanism is the standard vite-plugin-pwa autoUpdate path.

(40) **AI-personalized onboarding.** Replaced the single dense first-run config form with a guided,
one-question-at-a-time flow that ends in an AI-built plan + a personal welcome, so a new user feels the
app was made for them. Chosen (via AskUserQuestion) over cheaper options: a real one-time coach call
builds the plan; the questions asked are experience, primary goal, days/week, equipment/location, and a
light "how are you eating" (nutrition is welcome-only guidance, NOT a tracking feature — the user was
explicit it's not a nutrition app "yet").

Backend — `worker/src/onboard.ts`, routed as `POST /onboard`:
- Its OWN endpoint, not the coach route, because it must run **free and before the paywall** (a
  brand-new account has no subscription). Abuse-bounded by requiring a valid session (a real signed-up
  account — identity from the token, never the body) AND a one-per-account KV flag `onboarded:<userId>`
  set only after a valid plan (so a failed attempt doesn't burn the one shot). The client also skips the
  route entirely once the account's synced state says onboarded, so it's hit only for genuinely new
  accounts.
- One Anthropic call, output **forced through a single tool** (`create_onboarding_plan`, `tool_choice`
  pinned to it) whose fields are enum-constrained to the same `SPLIT_IDS`/`TRAINING_TYPES` the coach's
  `propose_build_program` uses — so the AI only *chooses* a split + style (never invents exercises) and
  the welcome rides in the tool input (a forced tool call suppresses free text). Dedicated onboarding
  system prompt with the same nutrition guardrails as `prompt.ts` (everyday guidance yes; no
  very-low-calorie / ED-adjacent / supplement-dose advice). Malformed output → 502 so the client falls
  back rather than shipping junk.

Client:
- `state/onboarding.ts` — `generateOnboardingPlan(answers)` POSTs to `/onboard` with the bearer token
  and, on ANY failure (not configured, offline, 5xx, already-onboarded), returns a **deterministic
  fallback**: maps answers → split/style locally (mirroring the AI's instructions — beginners stay on
  recoverable full-body/upper-lower even if they picked lots of days) plus a warm templated welcome with
  a goal-appropriate nutrition tip. So onboarding ALWAYS completes and always ends personal, even with no
  backend. Result carries `source: 'ai' | 'fallback'`.
- `components/OnboardingScreen.tsx` — fully rewritten as a step machine (intro → basics(name+units) →
  experience → goal → days → equipment → diet → generating → reveal) with a progress bar, back button,
  emoji option cards that auto-advance on tap, an animated "building your plan" step, and a reveal with a
  plan-summary chip row + the welcome message. No longer touches `newProgramWizard`; it manages its own
  answers and calls `vm.onboarding.finish(choice)`.
- `finishOnboarding(choice)` in `useApp.ts` (exposed via `vm.onboarding.finish`) — builds the program
  from the chosen split via the SAME `buildProgramFromPreset` the wizard uses, sets `onboarded: true`, and
  persists two new optional `AppState` fields: `onboardingWelcome` (string) and `onboardingProfile`
  (the answers), so the app remembers who the plan was built for (and a future coach context can use them).
  Both optional → `loadInitial`'s shallow-merge carries old accounts through with no migration.

Verified live (local `wrangler dev` + `npm run dev`): `/onboard` returns 401 without a token and a clean
502 with one (local `.dev.vars` has a placeholder Anthropic key, so the real call fails and the client
falls back — exercising the fallback path exactly). Full in-browser flow as a fresh signup: every step
advanced, the reveal showed the correct fallback plan for the answers (4 days + intermediate → Upper/Lower;
goal muscle → Progressive Overload; lb units; "eating to build" nutrition tip; "Ryan's Program"), and
Enter built a real 7-slot program with `onboarded: true` and the welcome + profile persisted, landing on
the program screen. `npx tsc -b`, worker `tsc --noEmit`, `npm run build` all clean. The actual AI
generation wasn't exercised locally (no real key in dev) — it mirrors the proven coach call structure and
runs in production where `ANTHROPIC_API_KEY` is set; there it produces the tailored plan + AI-written
welcome, with the deterministic fallback as the safety net.

(41) three onboarding/account additions in one round: gym-tailored exercises, an opt-out path with a
first-run app tour, and email verification.

- **Gym franchise → full exercise tailoring.** Onboarding gained an optional "Where do you train?" step.
  When a gym is named, the client sends the exercise catalog (`buildCatalog()`, now exported from
  `coach.ts`) to `/onboard`, and the AI tool `create_onboarding_plan` gained an optional
  `exercise_swaps: [{from,to}]` output; the prompt tells it to adapt the default plan to that
  franchise's typical equipment (e.g. Planet Fitness → route around barbells to machines/dumbbells).
  Client applies swaps via `applyExerciseSwaps()` (`onboarding.ts`): resolves both names to library ids
  (`resolveExerciseId`, also newly exported from `coach.ts`), and rebuilds matched entries with `mkEx`
  (equipIdx reset to 0 — a stale equipIdx would be invalid for the new exercise). Anything that doesn't
  resolve or isn't in the built plan is a no-op, so a bad/hallucinated swap can't corrupt the program.
  The deterministic fallback ships no swaps. **AI swap generation is prod-only** (needs the real key);
  the apply logic is typechecked + wired and was exercised structurally.

- **Opt-out + app tutorial.** The intro now offers "Build my plan for me" vs "I'll set it up myself".
  Opt-out (`finishManual` → `finishOnboarding` with `prefill: 'scratch'`, `startTutorial: true`) builds
  an empty starter program, marks onboarded, drops the user on the home screen, and launches
  `AppTutorial` — a brief, skippable 6-card tour (Program/creating-plans, Progress, Exercises,
  Achievements, Coach) rendered in `App.tsx`, re-openable from a "Replay app tutorial" button in
  Settings. New `AppState` fields `showTutorial`/`tutorialSeen` (both optional/back-compat). Deliberately
  a card tour, not DOM-anchored coach-marks — robust to layout changes. Verified live end-to-end
  (fallback path): gym step captures input and reaches the reveal; opt-out lands on an empty home with
  the tour; tour next/back/skip + Settings replay all work.

- **Email verification via Resend** (`worker/src/email.ts`). GATED on the `RESEND_API_KEY` secret: absent
  = the whole flow is inert and signup verifies instantly (exactly the old behaviour), so a deploy
  without Resend still works. When present: signup creates the account UNVERIFIED, fires the email via
  `ctx.waitUntil` (fire-and-forget so the response never waits on the send; the send itself has an 8s
  AbortController timeout), and returns `{ verification_required: true }` with NO session. Login on an
  unverified account returns 403 `email_not_verified`. `GET /auth/verify?token=…` is a browser
  navigation from the email link — it **bypasses the CORS-origin gate** in `index.ts` (no Origin header)
  and returns a small HTML success/failure page linking back to `APP_URL`. `POST /auth/resend-verification`
  re-sends (always 200, never leaks whether an email exists). Client (`auth.ts`) signup/login now return
  an `AuthOutcome` discriminated union (`session` | `verify` | `unverified` | `error`); `LoginScreen`
  shows a "Check your email" panel with a resend button for the verify/unverified cases. New `users`
  columns `email_verified`/`verify_token`/`verify_expires` — in `schema.sql`'s CREATE for fresh DBs, and
  a one-time `migrate-add-email-verify.sql` (ALTERs + grandfather existing rows to verified) for an
  existing DB. **The remote migration was already applied** (existing account grandfathered), so the DB
  is ready; the columns are harmless to the currently-deployed old Worker (it ignores them).
  **Owner setup to actually turn verification on:** create a Resend account, verify a sending domain (or
  use `onboarding@resend.dev` to your own address for testing), `npx wrangler secret put RESEND_API_KEY`,
  set `RESEND_FROM` in wrangler.toml to a verified sender, then deploy. Full flow verified live with a
  local key: signup→verification_required (fast), login blocked (403), verify link flips the DB + shows
  the success page, login then succeeds; the "Check your email" UI renders with resend.

  Local-dev gotcha found this round: `wrangler dev` (v4) drops `.dev.vars` secrets on its startup
  hot-reload, so a `.dev.vars`-only `RESEND_API_KEY` intermittently reads empty and verification silently
  stays off. To test verification locally, either restart clean and test immediately, or (what worked)
  put the key in `wrangler.toml [vars]` temporarily — plain vars survive reloads — and REMOVE it before
  committing. Also: miniflare can't abort a fetch stuck on unreachable DNS, so before the `ctx.waitUntil`
  refactor a dummy Resend key made signup hang; fire-and-forget fixed that and is the right prod design
  regardless.

  **Deploy order matters:** the remote `migrate-add-email-verify.sql` must be applied BEFORE deploying a
  Worker whose code reads the new columns (already done this round). Run migrations from
  `L:\…\alpha-lifts\worker`.

(42) **muscle diagram made pixel-exact — seventh and final containment fix, structural this time.**
User: the diagram "still colors outside the lines"; they offered a self-designed muscle model as a
fallback but explicitly not "a human resembling object made of squares and circles" (phase 20's
rejected approach). Root cause called correctly this round: six hand-recalibration passes (phases
9-32) all failed the same way because nothing *clips* an overlay polygon to the artwork — a
hand-traced bezier can only approximate a hand-drawn anti-aliased contour. Fix: derive the shading
masks **from the artwork's own pixels** so containment is exact by construction (see the
`BodyDiagram.tsx` architecture bullet above for the mechanism). `BodyDiagram.tsx` dropped from 113
to ~60 lines, the region-path data moved into `scripts/make-muscle-masks.mjs` as assignment hints,
and the component now renders per-muscle CSS-masked tint divs instead of an SVG.

Things learned doing it, for whoever touches the generator next:
- **The art's compartments are not all closed.** Real gaps found and sealed with `patchLines`: no
  skull-base line at all on the back view (head+ears+neck+traps are ONE compartment — and diagonal
  cuts through the skull interior don't work, the sides flow around them; only a full-width
  horizontal cut at y=148 seals it), no wrist lines (forearms run into the hands on both views),
  front thigh runs open through the knee into the shin, front biceps leaks down the
  brachioradialis strip past the elbow crease, and the back-right glute-edge band is fused to the
  hamstring under the gluteal fold (the left side happens to be drawn closed — asymmetries like
  this are real, don't assume mirror symmetry when diagnosing).
- **Debug by rendering the component map, not by staring at the art.** A colorized
  connected-component crop (each compartment a distinct color) shows *exactly* which regions
  merged and where the corridor is; grid crops of the raw art were repeatedly misread. The
  bbox/row-extent trace of a single component (min/max x per row) is what finally located the
  skull-base flow-around.
- **Patch-line seams inside one muscle self-heal**: the emitted masks dilate 1px clipped to
  (own region ∪ line pixels), and a patch line is 2px thick, so a cut between two same-muscle
  components disappears in the final mask. Full-width cuts are therefore safe.
- The report's area-ratio flags (`assigned vs hint`) can false-positive when the *hint* was
  under-traced — front Biceps sits at x1.39 because the drawn biceps+brachialis compartment is
  genuinely bigger than the phase-32 trace; confirmed contained via the component bbox before
  accepting it.
- **Synergist mapping (third pass, user-requested):** compartments with no muscle group of their
  own are mapped to their closest trained group rather than left dark — inner-thigh adductors →
  Quads, glute medius / lateral hip bands → Glutes, the adductor-magnus wedge below the glute
  fold → Hamstrings, serratus/outer-pec slivers → Chest, inguinal/hip-flexor pockets → Core.
  Deliberately still dark: neck, hands, knees/elbows, achilles, and the **soleus region below the
  back gastrocs** — the art draws almost no muscle there (just achilles lines + silhouette), so
  tinting it recreates the "blob down the achilles" that phase 32 removed. Also: two seed-point
  traps found this round — a crescent-shaped compartment's *centroid falls outside it* (the glute
  bands' centroids sit inside the glute domes), and the art is not mirror-symmetric (the right
  medial-elbow sliver opens into the biceps compartment, so a mirrored seed there would steal the
  entire right biceps for Forearms — that nearly shipped, caught by the per-muscle area totals).
- Verified: offline debug + production-tint composites at full res and 34×63 (the containment
  gate), then live DOM against `npm run dev` — mask layer count/URLs/opacities per view correct on
  the Day View thumbnail and both modal views, all 14 masks 200, zero console errors. Seeded a
  temporary mixed day for that (backed up + restored the dev `localStorage` blob; note a seeded
  `ProgramExercise` needs `baseline` AND `last` or the app crashes on render). Workbox precache
  picked the masks up via the existing `png` glob (184 entries, +14). A root-level
  `.claude/launch.json` was added because the browser tool resolves it from the workspace root
  (`L:\Personal Projects\Alpha Lifts`), not the app subfolder — it runs
  `npm run dev --prefix alpha-lifts`.

(43) four-item feedback round: a coach error, a discoverability miss, a diagnostic removal, and
personalization.

- **The coach's `"" isn't in the exercise library.` card — a truncation bug, not a naming bug.**
  Reported while asking the coach to update several exercises at once, and the plural is the clue:
  `MAX_TOKENS` was 1024 in `worker/src/index.ts` while the request also runs `thinking: adaptive`,
  so thinking tokens, the prose reply, **and every `propose_*` tool call's input JSON** shared one
  budget. Running out mid-serialization yields a `tool_use` block with fields missing, which
  `index.ts` forwarded verbatim; client-side `parseProposals` then did `str(input.exercise) ?? ''`
  and interpolated the blank straight into `` `"${exName_}" isn't in the exercise library.` ``. No
  wrong mutation was ever possible (`resolveExerciseId('')` returns null) — the card was just
  meaningless. Fixed on both sides: `MAX_TOKENS` → 2048 for headroom, plus `isCompleteToolInput()`
  in `worker/src/tools.ts` which checks a call against its **own schema's `required` array** (blank
  and whitespace strings count as missing) and drops incomplete calls rather than forwarding them,
  reporting the count as `droppedProposals` so `askCoach` can append "N changes I described didn't
  come through in full" instead of silently showing fewer cards than the prose promised. Client
  side, a `reqStr()` helper (undefined for anything `normalizeName()` collapses to `''`) guards
  every `propose_*` case, and a missing name now yields "That suggestion came through incomplete —
  ask me to try it again." Genuine failures keep their specific messages ("Zorbulon Thrusters isn't
  in the exercise library", "isn't on Upper Day"). **Also fixed in the same pass**, since it's the
  same blank-name defect class: `nameToIdMap()` now skips entries whose normalized name is empty. A
  custom exercise named `"..."` or `"🔥"` is legal (`saveExerciseForm` only requires a non-empty
  *trimmed* name) and normalizes to `''`; with `''` in the map, the substring fallback's
  `q.includes(name)` is unconditionally true, so **any** unresolvable name would have resolved to
  that junk exercise — a confidently-wrong applicable proposal instead of an error card. Verified
  live by importing the real `coach.ts` off the dev server and running crafted raw proposals
  through `parseProposals` (missing / whitespace / punctuation-only / null names across all six
  tools — no `""` anywhere, the valid one still resolved), and the Worker guard via a scratch
  script that transpiles `tools.ts`/`prompt.ts` with the worker's own `typescript` (11/11 cases).
  **Still open** (deliberately out of scope): `exactNameToId` is memoized once per session and
  never invalidated, so a custom exercise created *after* the first resolve is advertised to the
  model by `buildCatalog()` (which reads `EXLIB` live) yet can't be resolved back.

- **"Add an exercise on the workout page" already worked — nobody could find the button.**
  `swapConfirm`'s in-session `isAdd` branch, `changesMade`, and the completion screen's "Update My
  Plan / Just This Once" card were all built and correct; the only entry point was the last pill in
  the *horizontally-scrolling* exercise nav strip. Measured on a 375px viewport with 7 exercises it
  sat at `left: 1136px` — 761px off-screen, which is why the only add path the user knew was the
  Day Builder (permanent, no confirmation). Fixed as pure discoverability: `+ Add Exercise` added
  to the always-visible action pill row under the exercise name, plus a full-width
  `+ Add Exercise to This Workout` under `+ Add Set` with a one-line note that it's today-only and
  will be offered for the plan at the end. Both reuse `w.openAddExercise` verbatim — no new state,
  no new action. Verified end-to-end live: added Chest Press mid-session → `changesMade 1`,
  `dayExercises` 8, `program` still 7; ended the workout → the prompt appeared → "Update My Plan"
  wrote `chest_press` into `program` and cleared `pendingPlanUpdate`. Note `viewModel.ts`'s swap
  `inSession` has an extra `&& !s.swap.isAdd` that `swapConfirm`'s doesn't — checked and harmless
  (in add mode `exercisesArr` only feeds `currentEx`, which is null), left alone.

- **"Test buzz" removed** (see phase 26 for why it existed). Five deletions: the SettingsModal JSX
  block + its `vibeTest` state, the `testVibration` VM field + its now-sole-purpose import, and
  `testVibration()` in `alerts.ts`. `vibrationSupported`, `vibrateRestEnd()` and `REST_END_PATTERN`
  all stay — the first still gates both the unsupported-browser notice and the Vibrate toggle's
  disabled state.

- **The user's name is now stored and used.** Onboarding has always asked "WHAT SHOULD WE CALL
  YOU?" and then thrown the answer away: it only ever became the *program* name
  (`defaultProgramName` → "Ryan's Program") and a frozen welcome string, and
  `OnboardingScreen` passed `plan.name` (the program name) to `ob.finish`, so `finishOnboarding`
  never saw the person's name at all. New optional `AppState.userName` (back-compat via
  `loadInitial`'s existing shallow-merge, no migration), threaded through both onboarding paths,
  and editable in a new Settings "YOUR NAME" field — deliberately outside the ACCOUNT block, since
  it's local state, not an account field, and a signed-out user should still be able to set it.
  **Existing accounts recover their name for free**: `loadInitial()` derives it once from a
  `/^(.+?)['’]s\s+Program$/i` match on `programName` (a one-time derivation, not an ongoing link —
  renaming the program later doesn't rename the user). Consumed by: a day-rotating home greeting
  (`vm.homeGreeting`, four variants, seeded on the calendar day so it doesn't churn every repaint),
  Day View's `Ready when you are, Ryan.` above Start Workout, `completeSubtitle`, the rest-complete
  notification **body** (never the title — Android truncates titles ~40 chars, and the motivational
  line is the one thing that must survive), `fireReminder`, and a new `user` block in the coach
  context carrying the name plus `onboardingProfile` — which had been persisted since AI onboarding
  shipped with **zero read sites anywhere**, so this is its first consumer. The profile's raw
  option ids are humanized client-side via `PROFILE_LABELS` (`full_gym` → "a full gym") so the
  prompt reads as prose, keeping the Worker app-agnostic; `STYLE_RULES` gained one line about using
  the name the way a training partner would rather than as a greeting on every message. Every
  greeting is written to read correctly with **no** name — verified by clearing the Settings field
  ("Good evening. Time to put the work in.", no dangling comma) and by stripping `userName` from a
  persisted blob to confirm the derivation kicks in on reload.

  Local-verification note: the app is behind `AuthGate` whenever `VITE_COACH_API_URL` is set, and
  there's no real API key in dev. Seeding `alpha-lifts-auth-token` + `alpha-lifts-auth-account` in
  `localStorage` gets past it — the background `/auth/me` revalidation fails as a *network* error
  from localhost (the Worker's origin allowlist), not a 401, so `AuthGate` keeps the cached account
  rather than signing out. Also worth knowing: the browser tool's `computer` click was unreliable
  against this app's buttons in this session, while in-page `element.click()` via `javascript_exec`
  drove the whole onboarding → workout → completion flow fine.

  `npx tsc -b`, `npm run build` (184 precache entries) and the worker's `tsc --noEmit` all clean;
  zero console and zero dev-server errors throughout. **The Worker changes (MAX_TOKENS, the
  required-field guard, the `user` context block, STYLE_RULES) are not live until `wrangler deploy`
  is run from `L:\Personal Projects\Alpha Lifts\alpha-lifts\worker`** — the Pages frontend
  auto-deploys on push, the Worker never does.

(44) five-item feedback round: training-style tuning, the bottom bar, two coach-UX gaps, and
weekly day-structure editing.

- **"High Intensity" was literal Mentzer doctrine and is now "Low Volume / High Effort."** User:
  "the standard lifter will not be able to fatigue the muscle nearly enough to warrant true mentzer
  frequency." Correct, and the numbers were stark — `TRAINING_MULT.hit` was **0.4**, which on PPL6
  produced **50 total weekly sets against Progressive Overload's 134**, with four of five exercises
  on a Push Day cut to a *single* set (the balancer's 1-set floor dominated so completely that every
  split converged on ~50 sets regardless of structure — a "Push Day" was 6 sets in 19 minutes, and
  bro-split Arm Day was 7 sets in 16). Retuned to **0.65** and `REST_TRAINING_FACTOR.hit` 1.3 → 1.15
  (at 1.3 the `rirRestFactor` 1.25-at-failure stack put bench press at ~3.5 min between sets).
  **The `'hit'` id is deliberately unchanged** — it's the persisted `TrainingType` in every saved
  program, the sync blob, and three Worker enum lists; only display strings and the three AI-facing
  tool descriptions were rebranded.

  Two bugs found while mapping the style, both of which fire *only* for someone who actually trains
  to failure and logs RIR — i.e. exactly the person who picked it, and a real part of why it felt
  wrong:
  - `recommendation()` (`logic.ts`) held the weight whenever a hit-top set was logged at RIR 0.
    Under a to-failure style that's every session, so **the load could never go up**. `recommendation()`
    now takes the training type (7th optional arg, so no call site was forced to change) and skips
    that rule for `'hit'`, where RIR 0 is the prescription rather than a warning sign.
  - `fatigueRead()` (`deload.ts`) scored +0.6 for "recent sets averaging RIR ≤ 1", which alone clears
    `TRIGGER_THRESHOLD` — so a deload was proposed **every eligible week** and the other two signals
    never got a say. Downgraded to 0.25 (a corroborator) for `'hit'` only.

  Also fixed in the same pass because it's the same measurement: `estimateDaySetTimeSec()`
  (`wizard.ts`), the ceiling the balancer enforces, summed **raw `restBase`** — i.e. it assumed
  `REST_TRAINING_FACTOR` was 1.0 for every style, despite a comment claiming it mirrored
  `estimateDayTime()`. It now calls `restForExercise()` (wizard.ts → state/logic.ts introduces no
  cycle; logic imports nothing from wizard).

  **Audited before/after across all 30 split × training-type combos** by importing the real builder
  off the dev server, with the pre-change behaviour reproduced from a throwaway `git show HEAD:` copy
  of `wizard.ts` pinned to the old multipliers (deleted after). Results: Progressive Overload and
  General are **byte-identical**; Strength loses exactly 1 set on the two splits where the day-time
  cap had been under-applied (bro-split Leg Day 88 → 85 min); **Endurance improves substantially**
  (Full Body 127 → 153 sets, and its four out-of-band muscles — Back 48%, Quads 49%, Chest 64%,
  Calves 77% — all come into band) because the corrected estimate stopped believing its short-rest
  days were long. The retuned style lands at **78-81 sets on every split** (Strength 75-79, PO
  102-134), longest day 81 min against the 90-min hard cap, and its only out-of-band muscle is Calves
  at 77-83% on two splits — milder than Strength's own 83% on the same splits, and above the 70%
  cutoff that would show the user an "under" warning. Progression and deload fixes verified directly:
  an RIR-0 hit-top set now returns "+2.5 kg" on this style while PO and Strength still hold the
  weight, and `fatigueRead` scores 0.25 vs PO's 0.6 on identical RIR-0 history.

  **Note for whoever reads this next:** an existing program already on this style sees its muscle
  bars drop from ~100% to ~62% overnight, since targets recompute live. That's the honest signal
  (the plan is under-volumed for the new target), not a bug.

- **The bottom tab bar's scroll glitch was structural.** `TabBar` is `position: absolute` but was
  rendered *inside* `.scr`, the `overflow-y: auto` scroller — and because `.scr` is
  `position: static`, its containing block resolved to `.app-shell`, an ancestor **outside** the
  scroller. So the browser had to hold it still against a moving contents layer every frame, and its
  `backdrop-filter: blur(10px)` had to re-rasterize a moving backdrop each time. Fixed by moving
  `<TabBar>` and `<ResumePill>` out of `.scr` to be siblings inside `.app-shell` (no coordinates
  change — their containing block was already `.app-shell`) and dropping the blur for a 97%-opaque
  background. The z-index ladder survives untouched because `.scr` creates no stacking context, so
  modals at z 20-60 still paint above; verified with `elementFromPoint` over the bar with Settings
  open.

  Three separate causes for "inconsistent", all fixed: `height: 100vh` (on Android Chrome that's the
  *large* viewport, so with the URL bar showing the shell's bottom edge sat ~50-60px below the fold
  and slid about as the bar auto-hid) → `100dvh` with the `vh` line kept before it as fallback;
  no `overscroll-behavior` anywhere, so the inner scroller chained into the document and translated
  the whole shell → `none` on `html, body`, `contain` on `.scr`; and `viewport-fit=cover` in
  `index.html` with **zero** `env(safe-area-inset-*)` use in the entire repo, so the bar's hardcoded
  16px bottom pad sat under the Android gesture pill.

  The three uncoordinated magic numbers for one measurement (bar is ~67px; seven screens reserved
  100px; `ResumePill` assumed 86px) are now `--tabbar-h` + `--safe-b` CSS vars in `index.css`, used
  by every tabbed screen's bottom padding and by the pill — which also now only reserves tab-bar room
  on screens that *have* a tab bar (it appears over Day View and Day Builder, which don't).
  Bottom sheets and the three WorkoutScreen bottom bars got `+ var(--safe-b)` too. Verified live:
  bar parent is `app-shell`, `backdropFilter: none`, bar top identical at scrollTop 0/400/end, 29px
  content clearance at full scroll, shell height == viewport height.

  Deliberately **not** done: lifting WorkoutScreen's three bottom bars out of the scroller (they're
  opaque, no backdrop-filter, so they don't carry the expensive part, and it would mean routing their
  state through the view model), and `interactive-widget=resizes-content` (would fix the Coach input
  hiding behind the keyboard, but it's a separate behaviour change).

- **Coach "Apply all"** — `applyAllCoachProposals(messageId)` folds every pending applicable proposal
  through the existing pure `applyProposalToState` reducer inside **one** `setState`, so a later
  change sees the earlier one instead of racing the re-render. Per-proposal `next !== s` identity
  check means a no-op proposal isn't falsely marked applied. Posts **one** combined ack listing each
  change (not just a count — the ack is re-sent to the model as history next turn). The button shows
  on a turn with ≥2 still-actionable cards and counts down as cards are resolved individually.

- **Applying a proposal no longer yanks the chat to the bottom.** The auto-scroll effect keys off
  `messages.length`, and every Apply appends an ack — so tapping a card above the fold scrolled away
  from the card being read. Now it only follows when the user was already near the bottom, sampled
  from a `scroll` listener rather than measured inside the effect (by the time the effect runs the
  new message is in the DOM and distance-to-bottom always reads "miles away"). A user send or a
  pending reply still forces the scroll. Verified: scrolled up, Apply left `scrollTop` at 835/835
  with max 1794; at the bottom the newest ack stays on screen.

- **Weekly day structure is now editable** (`EditWeekModal`, reached from "✎ Edit week" on the
  Program screen): flip any day training↔rest, rename, reorder, add and remove days. Deliberately the
  same controls as the New Program wizard's custom-split editor, since that flow can only build a
  *new* program (it mints a new id and resets the week counter) — this is the in-place equivalent.
  **Turning a day to rest keeps its exercises** (verified byte-identical on flip-back); they stop
  counting toward weekly volume because `muscleVolumes()` skips rest days, so the only thing that
  discards anything is deleting a day, which is confirm-gated.

  Every action routes through one `structuralEdit()` helper that rewrites `dow = WEEKDAYS[i % 7]`
  across `dayOrder` and re-checks `isWeekComplete` for rollover. That weekday resync is load-bearing:
  `shouldFireReminder()` finds today's session with `find(d => d.dow === todayName)`, so a duplicated
  or missing weekday silently breaks reminders. **Which is why the week is now hard-capped at 7 days**
  — caught during verification when an 8th day was handed a second "Monday". (The wizard's
  `addWizardCustomDay` has always had the same unguarded `i % 7`; it's just much easier to hit here.)
  Other guards: the last remaining day can't be deleted, nor can one with a live workout on it;
  `activeDayKey` is nulled if its day disappears; `skipped`/`lastCompletedAt`/`exercisesDoneMask` are
  cleared on conversion to rest, since the rollover resets skip rest days and would leave them stale.

  Coach side: `propose_set_day_kind` and `propose_rename_day`, following the established four-layer
  pattern (schema `required` → `CoachProposalKind`/`Payload` → `parseProposals` case with
  `reqStr()` + `resolveDayKey()` → an `applyProposalToState` branch reusing `structuralEdit`, so the
  invariant lives in one place rather than per entry point). `TOOL_RULES` gained a line telling the
  model **not** to use the kind flip to mean "skip today" — that's the Skip button, and converting
  the day would change every future week. Add/remove/reorder are deliberately UI-only: every tool
  schema is re-billed as input tokens on every message, and `propose_build_program` already covers
  wholesale restructuring. All six parse cases verified (valid flip, valid rename, already-that-kind,
  bad enum, unknown day, missing name).

  Verification note: the harness's console buffer **persists across navigations and even a dev-server
  restart**, so stale HMR errors (editing `useApp.ts` while the app is live changes hook order and
  logs a Rules-of-Hooks error) look like live failures. Opening a fresh tab is what distinguishes
  them — a clean tab showed zero errors.

  `npx tsc -b`, `npm run build` and the worker's `tsc --noEmit` all clean. **`propose_set_day_kind`,
  `propose_rename_day`, the TOOL_RULES line and the reworded training-style descriptions need a
  `wrangler deploy`** from `L:\…\alpha-lifts\worker`; the frontend auto-deploys on push.

(45) **fun "factoid" comparison blurbs** — reframing cumulative stats as something tangible
("you've lifted the equivalent of 5 elephants", "that's the Harry Potter films ×3 in the gym"),
requested with those exact examples. Frontend-only.

- **`src/data/factoids.ts`** (new, pure) — two ascending reference tables (weight in kg: house cat →
  grand piano → car → elephant → double-decker bus → blue whale → Space Shuttle; time in min: pop
  song → feature film → the Harry Potter films → the HP audiobooks) and `weightFactoid(kg, seed)` /
  `timeFactoid(min, seed)`. Each filters to references whose count lands in a *relatable* band
  (`[1.1, 250]`) so it never prints "0.2 cars" or "13,000 cats", picks among the survivors by the
  caller's seed, and returns `null` below the smallest object so callers fall back or hide.
  Deliberately unit-agnostic ("10 cars" reads the same in kg or lb), the opposite of the achievement
  volume tiers which *are* unit-specific — verified across magnitudes: 3 kg → null, 40,000 kg rotates
  believably (elephants/pianos/cars by seed), 2,000,000 kg → "250 T-rexes" not "millions of cats",
  500,000,000 kg still caps sensibly at Space Shuttles.

- **Reps/sets counters.** The user asked whether a per-session counter bloats storage / why not a
  running total. Answer, and the design: it *is* effectively a running total, stored the way the app
  already stores `volumeKg`/`durationMin` — per-session on each `HistoryEntry`
  (`setCount`/`repCount`, optional/back-compat), summed by new `lifetimeSets`/`lifetimeReps` helpers
  in `logic.ts` exactly like `lifetimeVolumeKg`. Two integers per workout, and the sum is the same
  cheap reduce already run for volume; a per-session number can always be re-derived and never
  drifts, which is why the app never kept a running scalar for volume either. Written in
  `completeWorkout()` from `doneSets` (already in hand): **`repCount` excludes time-tracked exercises**
  (a plank stores seconds in the rep slot, so it's a set with no reps), `setCount` counts every
  completed set. `loadInitial()` backfills pre-counter sessions **once** by parsing each row's
  `resultText` (`"80 kg × 8/8/6"` → 3 sets, 22 reps), written back into `state.history` so the parse
  is paid on load not per render; historical plank seconds count as reps in the backfill only, a
  documented invisible-scale approximation (verified: h1 with a `45s × 60/60` plank backfilled to
  162 reps, while a *live* logged plank correctly contributed 0 reps / 1 set — going-forward path is
  precise).

- **Placement** (per the user's pick — not Achievements/home): a `BY THE NUMBERS` card at the top of
  the Progress tab (`funStats` in the VM — a weight line, a time line, and a plain
  `N workouts · N reps · N sets` total, each object **day-seeded** via the same
  `Math.floor(Date.now()/86400000)` idiom as `homeGreeting` so it rotates daily without churning),
  and a one-line factoid on the Complete screen between the PR banner and the achievements block
  (`sessionFactoid`, seeded by the session `id` through the previously-dead `seededFrac` so it's
  fixed for that session, not re-rolled per render). Both degrade cleanly: the Progress card shows a
  "log a few workouts" starter when both factoids are `null`, each line hides independently when its
  own total is too small (verified — a sub-minute test session showed the weight line but not the
  time line), and the Complete line is omitted entirely on a bodyweight day too light for any object.
  Weight-total subtitles get thousands separators (`fmtWeight` doesn't group), so "88,185 lb" not
  "88185 lb".

  Verified live end-to-end: factoid math across magnitudes + seed rotation, backfill onto a
  pre-counter blob, a real logged workout writing precise counts and rendering "🛞 This session moved
  the equivalent of 96 car tyres", the Progress card, and the empty-history starter. `npx tsc -b` and
  `npm run build` clean, zero console errors on a fresh tab. **No `worker/` changes — pure frontend,
  auto-deploys on push, no `wrangler deploy` needed.**

(46) **security & data-integrity hardening round** — a full three-track audit (Worker, frontend
state/sync, build/PWA) followed by fixes for every critical/high finding. The remaining
medium/low findings are documented in the audit plan (`~/.claude/plans/perform-a-full-audit-*.md`)
for later rounds. What changed, by layer:

- **Worker security** (`worker/src/`, new `guard.ts`): the coach route now REQUIRES a session
  when `SESSION_SECRET` is set — the old `body.userId` fallback let an unauthenticated caller
  name any pro account's UUID (returned by `/auth/me`, so not secret) and inherit its
  entitlement, or mint fresh ids to reset the KV spend counter; `isEntitled()` also only
  consults the D1 subscription branch for session-verified ids (`viaSession`). `/onboard` and
  `/parse-plan` now enforce `checkBudget()` (parse-plan could bill ~$0.20/call unmetered), and
  all AI routes use reserve-then-settle spend accounting (pre-charge an estimate, settle to real
  cost / refund on failure) so parallel bursts can't race past the cap on stale KV reads.
  `/onboard`'s one-per-account flag is claimed BEFORE the API call and rolled back on failure
  (was read-top/write-bottom — N parallel requests all passed). Every route reads its body via
  `readJsonCapped` (8 KB auth / 64 KB AI / 4 MB state); the LLM context is sanitized field-by-
  field with hard caps (`sanitizeContext` in prompt.ts, `sanitizeAnswers` in onboard.ts) so a
  forged request can't stuff unbounded billed text into the system prompt. Top-level try/catch
  in `fetch` returns JSON 500 WITH CORS headers (uncaught D1 errors used to surface as opaque
  CORS failures); signup handles the UNIQUE race and, with verification on, returns the same
  201 for an existing email (no enumeration oracle); resend-verification reuses a still-valid
  token (rotation-spam protection) and both email sends sit behind a 60s per-address KV
  cooldown. Per-IP rate limiting via `[[ratelimits]]` bindings (AUTH_LIMITER 10/min,
  AI_LIMITER 30/min — verified enforcing locally under `wrangler dev`). Production
  `ALLOWED_ORIGINS` no longer includes localhost (dev gets it via `.dev.vars`).
- **Cloud sync** (`sync.ts`/`useCloudSync.ts`/`handlers.ts`/`db.ts`, new `syncMeta.ts`):
  `PUT /state` now supports optimistic concurrency — the client sends `baseVersion` (from
  sync-meta) and the Worker 409s with its current copy if the row moved; on conflict the client
  applies the same LWW rule as sign-in reconcile (local newer → re-push on top; server newer →
  adopt + reload). Omitting baseVersion keeps the old unconditional write, so pre-update clients
  still work. The dirty flag is only cleared when the pushed state object is still current
  (identity check — an edit landing mid-flight used to be marked clean and could be lost);
  pending pushes flush on pagehide/hidden via keepalive fetch, and `logout()` awaits a bounded
  `flushBeforeLogout` so signing out can't drop an unsynced change. An account-switch that would
  discard another account's dirty blob now stashes it under `alpha-lifts-orphan-<accountId>`.
- **Frontend data integrity**: backup import is validated (`validateBackup` in backup.ts) before
  staging, and every merge into the EXLIB singleton goes through `safeCustomEntries` (drops
  `__proto__`/`constructor`/`prototype` keys — `EXLIB["__proto__"] = x` rewires the prototype
  chain — malformed defs, and built-in-id collisions). A corrupt persisted blob is stashed to
  `alpha-lifts-corrupt-<ts>` instead of being silently overwritten by defaults, and quota
  failures set a visible banner (both surfaced via `storageNotice` from useApp, rendered in
  App.tsx). `resetApp` runs its side effects outside the setState updater, clears sync-meta, and
  its confirm copy says the cloud copy is erased too. The rest timer resumes after a reload
  mid-rest (mount effect restarts the interval off the absolute `restEndAt`; an already-elapsed
  rest completes silently). A meta CSP was added to `index.html` (GitHub Pages can't set
  headers) — script/connect/frame/img/font sources pinned; title fixed ("Forge" → "Alpha
  Lifts"). lb display: `incrementForEquip` now takes units (5 lb for everything in lb mode —
  the old 1 kg small-equipment increment rendered as "Push for +0 lb today" under fmtWeight's
  5-lb rounding), and bodyweight uses new 0.1-precision `fmtBodyWeight` (a 2 lb change used to
  show "+0 lb").
- **Performance** (`useClock.ts` new): `buildViewModel` is memoized on `[state]` in App.tsx
  (safe because every action callback's identity only changes when state does); the Progress
  tab's analytics, the exercise-library groups, and the week-review list are computed only when
  their screen/modal is active (typed empty stubs otherwise — see `progressStubs()`); and the
  two 1-second clocks moved out of global state entirely: the app-wide `forceTick` interval is
  gone and `restTick` no longer writes `restRemaining` per second — elapsed/rest displays
  derive locally in RestToast/WorkoutScreen/ResumePill/IdleWorkoutToast via
  `useElapsedText`/`useRestClock` off `startedAt`/`restEndAt`. Net effect: no state writes, no
  VM rebuilds, no localStorage serialization, and no sync dirtying on a per-second cadence
  (verified: zero PUT /state during a live rest countdown). `restAdjust` derives from
  `restEndAt` since `restRemaining` is no longer live.

Verified: worker `tsc --noEmit` + a 23-case scripted suite against local `wrangler dev`
(spoofed-identity 401s, entitlement 403s, 413 body caps, 409 version conflicts + legacy
no-baseVersion path, onboard claim rollback, 429 rate limiting); frontend `npx tsc -b` +
`npm run build` clean and a full live browser pass against the local Worker (signup → onboarding
→ versioned sync push; forced 409 → observed LWW retry sequence `[base 2 → 409, base 8 → 200]`;
corrupt-blob stash + banner + clean boot; reload mid-rest → countdown resumes and ticks; hostile
backup customs filtered with prototype unpolluted; "+5 lb" dumbbell recommendation in lb; all
five tabs render with the gated VM; YouTube embed loads under the CSP; zero console errors and
zero CSP violations). **Worker changes require `wrangler deploy` from
`L:\Personal Projects\Alpha Lifts\alpha-lifts\worker`** — the client is backward-compatible with
the old Worker (baseVersion is additive), but the deployed Worker won't enforce any of the new
protections until deployed.

(47) **second hardening round — the deferred medium/low findings**, requested immediately after
phase 46 shipped. Five tracks:

- **Password security & account recovery** (`worker/src/auth.ts`/`db.ts`/`handlers.ts`/`email.ts`,
  `schema.sql` + `migrate-add-password-security.sql`): PBKDF2 raised 100k → **600k** iterations
  (OWASP current), with **transparent rehash on login** (`hashIterations()` detects a
  below-current row; `rehashPassword` upgrades it WITHOUT bumping token_version — verified the
  old 100k row flipped to `pbkdf2$600000$` on next login, other sessions untouched); stored
  iteration counts clamped to [50k, 2M] so a DB-write compromise can't plant 1 or 10^9; the
  login dummy-hash is derived from the current constant so its timing tracks the real path. New
  **`users.token_version`** column rides in every JWT (`tv` claim) and is checked by
  `authedUser()` on every authenticated route (incl. coach/onboard/parse-plan when DB is bound):
  bumping it revokes that user's outstanding sessions — per-user revocation without a session
  table, at the cost of one indexed D1 read per request. **POST /auth/change-password**
  (verify old → 600k hash → bump tv → return fresh token; client `changePassword()` +
  `refreshSession` on AuthContext swap the React tree onto the new token, since the old one dies
  server-side) with a collapsible form in Settings' ACCOUNT card. **Forgot-password flow**:
  POST /auth/request-reset (uniform 200, no account oracle; 1h single-use 256-bit token; only
  sends when RESEND_API_KEY is set; per-address cooldown) → emailed link to GET /auth/reset
  (worker-served HTML form, bypasses the CORS-origin gate like /auth/verify, tokens
  charset-validated before HTML embedding) → POST /auth/reset (form-encoded, also gate-bypassed
  — the single-use token IS the auth; applies hash + clears token + bumps tv + marks email
  verified). "Forgot password?" link on the login screen. Verified end-to-end against local
  wrangler dev + D1 (20/20 checks: rehash, revocation on /auth/me AND /state, wrong-old-password
  401, uniform request-reset, form page, single-use, expiry, tv/verified/cleared row state) —
  including the live app getting signed out on reload because its token had been revoked by the
  password change, which is the feature working. The **auth rate limiter tripped the first test
  run** (>10 auth POSTs in 60s → 429) — expected behaviour, split the suite around the window.
- **PWA install weight**: exercise photos are no longer precached — `jpg` dropped from
  `globPatterns` (precache went **184 entries/3.8 MB → 33 entries/1.1 MB**, and one failed photo
  can no longer fail the whole atomic SW install); `sw.ts` gained a CacheFirst runtime route for
  `/exercise-photos/` (ExpirationPlugin, 200 entries/1y, purgeOnQuotaError) so a photo viewed
  once stays available offline. workbox-routing/strategies/expiration added as real
  dependencies; workbox-core/precaching moved out of devDependencies.
- **No more force-reload mid-workout**: `registerType` 'autoUpdate' → **'prompt'**; `sw.ts` no
  longer calls skipWaiting unconditionally (listens for a SKIP_WAITING message instead), and
  main.tsx applies a downloaded update immediately when idle but **defers while
  `state.workout != null`** (30s poll until the session ends). Update discovery is unchanged
  (visibilitychange → registration.update()). Bootstrap caveat: devices on the old autoUpdate
  registration behave the old way for exactly one more update cycle.
- **Correctness papercuts**: deleting a library exercise mid-workout now remaps `exSets` to the
  surviving indices (logged sets no longer shift onto the wrong exercise); editing an exercise's
  equip list clamps out-of-range `equipIdx` across program/savedPrograms/workout (render crash);
  un-skipping a day retracts the 'skipped' history entry it wrote (bestEverStreak/cleanWeekCount
  monotonicity + no duplicate stacking); `addWizardCustomDay` enforces the same 7-day cap as
  Edit Week (two-Mondays reminder bug); `avgRestSec` passes trainingType (was ~40% low for
  Strength); loadInitial clears a restored `resting:true` with no `restEndAt` (pre-restEndAt
  blob = permanently stuck rest); bodyweight log keys on LOCAL date (west-of-UTC evening logs
  wrote tomorrow); history ids get a collision counter; token reads deduped into
  `state/tokenStore.ts` (was hardcoded in 3 modules); `invalidateExerciseNameCache()` on custom
  exercise save/delete (coach could advertise but never resolve a post-memo custom);
  `defaultProgram`/`dumbbellProgram`/`DAY_ORDER` dead code deleted.
- **`components/Sheet.tsx`** — the shared backdrop+sheet scaffold 11 modals used to hand-roll
  (Settings, Swap, MuscleSwap, ExerciseForm, Wizard, WeekReview, WarmupDetail, MuscleDrill,
  ExerciseHistory, ArchiveDetail, MusclesWorked-centered). Carries `role="dialog"`/aria-modal,
  the stopPropagation, and documents the app's z-index ladder (15 chrome / 20 fullscreen pages /
  30-33 sheets / 40-45 dialogs / 60 tutorial / 70 banner). Deliberately NO global Escape handler
  (stacked sheets would all close at once; hardware-back popstate already closes topmost).
  EditWeekModal stays bespoke (its delete-day confirm is a sibling overlay inside the backdrop).
  The Day Builder's ✕ — which permanently deletes a plan slot and was the one unguarded
  destructive action — is now tap-twice (`confirmRemoveBuilderIdx` in AppState, "Confirm?"
  button state, cleared on builder close). Verified live: Settings/swap sheets render + close on
  backdrop, change-password form opens, ✕ → Confirm? → row removed, zero console errors.

Same deploy story as phase 46 (one combined push): frontend auto-deploys;
**`wrangler deploy` from `worker/` required**, and the remote D1 migration should be applied
around the same time: `npx wrangler d1 execute alpha-lifts-db --remote
--file=migrate-add-password-security.sql` (safe in either order — the Worker reads the new
columns defensively, treating missing as version 0 — but until BOTH are live, password
change/reset and revocation aren't in effect).

**All of the above WAS deployed and verified in production the same session**: migration applied
(columns + indexes confirmed via pragma query), Worker deployed with both rate-limit bindings,
live smoke tests green (spoofed-identity 401, reset page served, localhost origin 403), Pages
picked up the bundle + CSP. **Resend email is fully working in prod** — RESEND_API_KEY is set,
the `alpha-lifts.com` sending domain is verified, and a real password-reset email was triggered,
delivered, and received by the owner (live `wrangler tail` showed zero Resend errors).

Deploy friction hit this round, worth remembering: `wrangler d1 execute --remote` failed with
**"Authentication error [code: 10000]"** despite `wrangler whoami` showing the right account WITH
`d1 (write)` scope — the OAuth token was simply stale (wrangler warned about missing newer
scopes). Fix: `npx wrangler login` to re-consent in the browser, then retry. If a migration then
says "duplicate column name", it already applied on an earlier attempt — safe to ignore, but
confirm with `SELECT name FROM pragma_table_info('users')`.

(48) **third hardening round — the last deferred audit items.** Five tracks:

- **Durable-projection sync** (`state/durable.ts` new): pushes now send `projectDurable(state)`,
  which strips ~40 TRANSIENT fields (navigation, open modals, staged confirms, in-flight inputs,
  the live `workout`) — exclusion-based on purpose, so a NEW field is synced by default (safe for
  data; a forgotten transient costs bytes, a forgotten durable field would silently stop
  syncing). Consequences, all verified live: a keystroke/nav change no longer marks sync dirty at
  all (zero PUTs observed on typing + tab hopping; exactly one on a real durable change); the
  dirty-clear check in useCloudSync compares PROJECTIONS by content, not state identity, so a
  transient-only change mid-flight can't hold the dirty flag; and every place that ADOPTS a
  server copy (sign-in reconcile's two same-account branches + the mid-session 409-conflict
  adopt) grafts this device's live `workout` / `pendingPlanUpdate` / complete-screen state back
  on via `mergeDeviceSession` — the server projection never contains a session, and a plain
  adopt used to be able to erase a workout in progress. Verified: seeded live workout + newer
  other-device push → reload adopted the server rename WHILE the workout (incl. its done set)
  survived, landing back on the workout screen.
- **schemaVersion migration framework** (`useApp.ts` MIGRATIONS + `SCHEMA_VERSION` in
  initialState.ts): blobs record the highest one-time migration applied; the four historical
  inline back-compat passes (onboarded inference, userName derivation, counts backfill, equip
  attribution) are now migration v1, run once instead of every load. Blobs with no version
  (pre-framework, or pushed by an old client via sync) read as 0 and re-run everything — so
  migrations must stay idempotent. Always-run load SANITIZATION (coachPending reset, stuck-rest
  guard) deliberately stays outside the framework: those states can recur. A migration that
  throws leaves the blob un-migrated and un-stamped (retries next load) instead of wiping to
  defaults.
- **Self-hosted fonts + PWA identity**: Inter + Space Grotesk latin VARIABLE woff2s (~70 KB
  total, one file per family) live in `src/assets/fonts/`, referenced RELATIVELY from index.css
  so Vite hashes + rebases them for the `/alpha-lifts/` base (absolute /public paths in CSS are
  NOT rebased — that's why they're not in public/). The render-blocking Google Fonts @import is
  gone (offline installs used to silently fall back to system fonts), `woff2` joined
  globPatterns (precache 35 entries / ~1.2 MB), CSP dropped the fonts.googleapis/gstatic origins
  (`font-src 'self'`), the manifest gained a stable `id`, and package.json is finally
  `alpha-lifts@1.0.0`. Verified: both families load from `/src/assets` (dev) with zero requests
  to fonts.g*.
- **Worker leftovers**: `json()` sends `Cache-Control: no-store` + `X-Content-Type-Options:
  nosniff` on every response; `MODEL` lives once in usage.ts next to PRICING (was duplicated in
  3 files — a one-file swap to an unpriced id used to silently zero the spend cap; unknown
  models now meter at the priciest known rate with a loud console.error); SPLIT_IDS/
  TRAINING_TYPES exported from tools.ts and imported by onboard/parsePlan (were 3 private
  copies); **GET /auth/verify is now a confirm-button page and the verification happens on its
  POST** — mail scanners prefetching the GET used to consume the single-use token before the
  human clicked (verified: two GETs leave the token alive, POST consumes, second POST rejected);
  expired verify tokens are cleared from the row on sight; the login DUMMY_HASH derives its
  iteration count from PBKDF2_ITERATIONS (a hardcoded 100000 had silently diverged from real-row
  timing when the constant went to 600k — the timing equalizer wasn't equal);
  `REQUIRE_EMAIL_VERIFICATION="true"` (wrangler.toml) keeps BLOCKING unverified logins even if
  the Resend key is rotated out (send-gate and enforce-gate used to be one key-presence check
  that failed open); MAX_STATE_BYTES measured via TextEncoder byteLength (UTF-16 length
  undercounted ~3x); coach `refused` returns 502 not 200; APP_URL is validated+escaped before
  HTML interpolation (safeAppUrl).
- **Typed view model + decomposition**: the 8 `let x: any` section blocks in buildViewModel
  (currentDay, builderExercises, workout, detail, quickEdit, swap, muscleSwap, muscleDrill rows)
  are now named inner builders (`buildCurrentDay()` etc.) with fully INFERRED return types and
  `as const` open-flag discriminants, and every one of the ~77 `: any`/`as any` casts across 19
  component files is gone — a VM field rename now fails `tsc` instead of silently compiling.
  Also: aria-labels on 43 glyph-only buttons (✕/‹/↑/↓/+/–), id-based keys on the reorderable
  lists, the Day View ⇄ Swap span got role="button"+tabIndex+keyboard handling (it can't be a
  real <button> — it sits inside the row's quick-edit button and nested buttons are invalid
  HTML), and VideoEmbed validates the 11-char YouTube id shape before interpolating.
  **Deliberately NOT done: the useApp.ts hook split.** It's ~1,900 lines of callbacks sharing
  setState/stateRef/restInterval/restDoneForRef closures; splitting means re-threading those
  refs through hook boundaries — pure structure, zero behavior, maximal regression surface. If
  it's ever done, do it as its own dedicated round with the browser-verification budget that
  deserves, not as the tail of a batch.

Verified: worker `tsc --noEmit` + 13-case suite (headers, verify-button flow, versioned state,
expired-token cleanup) on top of the still-passing earlier suites; app `tsc -b` + `npm run build`
clean; live browser pass (fonts, projection push behavior, schemaVersion stamp, adopt-with-
workout-carryover, all sheets still render) with zero console errors. Same deploy story:
frontend on push, **Worker needs `wrangler deploy`** (no DB migration this round).


(49) **market-gap round — test harness + five features from a competitive analysis.** A research
pass (Strong/Hevy/Fitbod/Jefit comparisons + 2026 fitness-app feature roundups) mapped the app
against market expectations; the approved quick wins and medium items all shipped in one session
(full analysis: ~/.claude/plans/do-a-search-online-sleepy-badger.md). Six tracks:

- **Vitest harness — the first automated tests in the repo.** `vitest.config.ts` (deliberately
  separate from vite.config.ts; plain node, no DOM), `npm test`, and a `npm test` step in
  deploy.yml so a red suite blocks the Pages deploy. 240 tests across `src/state/logic.test.ts`,
  `src/data/wizard.test.ts`, `src/state/deload.test.ts`, `src/data/csv.test.ts`, with shared
  builders in `src/state/testFixtures.ts` (no vitest imports there, so tsc -b typechecks it with
  the app). Wizard suite runs every split preset x training type asserting: full week shape, no
  within-day duplicate exercises, 1-8 sets per exercise, the 90-min hard cap (recomputed via the
  real restForExercise), every muscle programmed, and nothing over MAV. Test files live in src/
  (tsconfig.app includes them, so they're typechecked); vitest.config.ts joined tsconfig.node's
  include.
- **CSV export** (`src/data/csv.ts`, Settings > BACKUP): one-tap Strong-style set-by-set CSV.
  Joins real per-set rows (weight/reps/RIR/equipment/deload) from exerciseHistory back to
  sessions via the same date+day key weeklyHeatmapData uses; sessions aged out of the 8-entry
  cap fall back to parsing resultText (weight+unit as logged, equipment/RIR blank). ISO dates
  derived from HistoryEntry.id timestamps; weights in the CURRENT display unit at 0.1 precision
  on joined rows; UTF-8 BOM for Excel; time exercises fill a Seconds column instead of
  Weight/Reps. Button hidden until a completed session exists.
- **Equipment filter on the Exercises tab**: chip row (All + each equipment type at least one
  exercise offers), tap-again-to-clear, and the text search now also matches equipment labels
  ("smith" finds all 9 Smith-machine exercises). New transient `exerciseEquipFilter` field.
- **Loggable warm-up sets**: the advisory ramp card gained "+ Log warm-up sets", which prepends
  the ramp as checkable blue-tinted rows (`WorkoutSetRow.warmup`) labeled "Warm-up N", no RIR
  picker, flat 60s rest, no superset choreography. THE INVARIANT: warm-up rows are excluded from
  volume, set/rep counts, PR detection, exerciseHistory, and the slot's stored `last` (both
  `filter(r => r.done)` sites in completeWorkout carry `&& !r.warmup`); warm-ups alone don't
  count as doing the exercise. Superset round-matching and per-set "last time" now index by
  WORKING-set ordinal, not raw row index — prepended rows would otherwise shift both.
- **Body measurements + progress photos** (Progress tab). Measurements mirror the bodyweight
  pattern exactly: fixed 8-type catalog (`MEASUREMENT_TYPES` in logic.ts), stored cm, displayed
  cm/in by unit setting, one entry per type per LOCAL date, `measurementChartData()` reuses the
  sparkline shape. Photos are deliberately OUTSIDE AppState: IndexedDB (`src/data/photoStore.ts`,
  DB `alpha-lifts-photos`), downscaled to 1280px JPEG q0.85 on import, rendered by the
  self-contained `ProgressPhotosCard.tsx` (the one sanctioned exception to the vm-only rule —
  IDB is async; the "why" is commented in both files). UI states photos stay on-device: not in
  backups, not synced (a photo sync would multiply the 4MB-capped state PUT).
- **Web Push cloud reminders** — the first true push notifications; removes the "reminders only
  fire while the app is open" ceiling reminders.ts documents. Server half (`worker/src/push.ts`):
  `/push/config` (public VAPID key), `/push/subscribe|unsubscribe` (session-authed; endpoint-
  keyed upsert into new D1 table `push_subscriptions` — schema.sql + migrate-add-push.sql), and
  a `scheduled()` cron sweep (`*/10 * * * *` in wrangler.toml [triggers]) that sends a
  VAPID-signed EMPTY push when: user-local time (IANA zone per subscription, DST-proof, via
  Intl) is past reminder_time but within a 60-min catch-up window, nothing sent this user-local
  day (last_sent_date), and the user's synced state says a training day is still owed (mirror of
  shouldFireReminder; absent/unparseable state = remind anyway). Dead endpoints pruned on
  404/410; transient send errors still mark the date (one push/day, never a retry storm).
  Empty pushes are the load-bearing simplification: VAPID is just an ES256 JWT via WebCrypto
  (~40 lines, zero deps), while a payload would need RFC 8291 aes128gcm — the SW's `push`
  handler composes the text instead ("Time to train"), and p256dh/auth are stored anyway so
  payloads can be added later without re-subscribing devices. Client half: `src/state/push.ts`
  (uses getRegistration, NOT .ready, which never resolves under npm run dev), a per-device
  "Cloud Reminders" toggle in Settings (transient `pushRemindersEnabled` — a subscription
  belongs to ONE browser; syncing the flag would lie on other devices), failure reasons
  surfaced via `pushSetupNotice`, and changing the reminder time re-posts the subscription
  (Worker upserts on endpoint). **VAPID keys**: public in wrangler.toml, private is the
  `VAPID_PRIVATE_JWK` secret; `worker/scripts/gen-vapid.mjs` regenerates a pair, but doing so
  invalidates every existing subscription. Verified against `wrangler dev --test-scheduled`
  with a local HTTP listener standing in for the push service (correct VAPID JWT aud/sub/TTL,
  empty body, once-per-day dedupe, rest-day skip, unsubscribe); **deployed the same session**:
  remote D1 migrated, secret set, Worker + cron live, production /push/config serving. The
  wrangler "Authentication error"-looking failure during the remote migration was actually
  PowerShell 5.1 wrapping wrangler's stderr WARNING banner as a NativeCommandError — the
  migration had succeeded; read the full output before re-running (phase 47's stale-OAuth note
  still applies when it IS real).
  Not yet exercised: a real end-to-end browser delivery on the deployed app (needs the owner's
  signed-in device to flip the Settings toggle once and receive the next due reminder).

Round-wide notes: dev-server port for THIS repo's browser verification moved to 5199
(root `.claude/launch.json`) so it can't collide with another session's 5173. Commit messages
must avoid double quotes — PowerShell 5.1 mangles embedded quotes when passing here-string args
to native git, splitting the message into bogus pathspecs.


(50) **roadmap continuation — the four remaining medium items from phase 49's analysis.** The
large bets (native wrapper, cardio, social feed, marketplace, cycle training) stay deliberately
parked. Four tracks, each verified live and committed separately; 245 tests green throughout:

- **Drop sets + AMRAP** (`WorkoutSetRow.setType`/`SetHistoryRow.setType`, 'drop' | 'amrap';
  warm-ups stay a separate boolean). A pill on each working-set card cycles Normal -> Drop ->
  AMRAP (hidden on warm-ups and time-tracked exercises). Behaviour: NO rest into a pending drop
  set (checked in toggleSetDone before the superset logic — a drop set follows immediately);
  AMRAP shows an open rep target. Both count FULLY toward volume/set counts/PRs, but the
  progression reference excludes them on both sides — completeWorkout's topSet/hitTop read only
  `setType == null` rows (fallback: all), and effectiveLast applies the same filter to history
  entries — so a trailing 60% drop set never becomes "last time's weight" and a short drop rep
  count never blocks hitTop. Types persist into lastSets/exerciseHistory rows and a new CSV
  'Type' column (header now Date..Set,Type,Weight..; column indices in csv.test.ts shifted).
- **Supersets generalized to N-exercise circuits.** toggleSuperset now MERGES groups (chaining
  Link Next builds A-B-C) and, on two same-group members, SPLITS at their boundary (each side
  keeping/getting a group, solo sides unlinked) — for a pair that degenerates to the old
  unlink-both. Mid-workout is a round-robin: completing working-ordinal k advances to the next
  member (cyclic, day order) still owing set k (a never-visited member with enough planned sets
  counts as owing, matching the old lazy-exSets behaviour); a full round rests using the LONGEST
  member's restForExercise. New helpers `groupIndices`/`clearSoloGroup` in useApp; all six
  clearing sites (builder remove, in-session remove, both swapConfirm paths, muscleSwapConfirm,
  coach proposals) now keep survivors linked unless the group drops to one. Banner: "Circuit
  with X + Y — rotate through...". Verified: 3-exercise rotation, shared 120s rest, survivor
  linking, builder chain+split.
- **Share cards + plan share links.** `src/data/shareCard.ts` canvas-renders a 1080px PNG
  (gradient bg, day/date, volume/duration/PR stat tiles, up to 10 exercise rows with PR
  highlight, skipped rows excluded) → Web Share API with files when supported, else download;
  "Share This Workout" on the Complete screen (vm.shareWorkout builds the data from history[0] +
  completeSummary). Plan links: `worker/src/share.ts` — POST /share (session-authed, auth rate
  limiter, 64KB cap, newest-20-per-account trim) writes the PlanEnvelope to new D1 table
  `shared_plans` (schema.sql + migrate-add-share.sql) and returns a 12-char id; GET /share/:id
  is public (the unguessable id is the capability; the plan stays opaque server-side — all
  validation is client-side parsePlanFile, same as the file path). Client: planIO refactored
  onto `buildPlanEnvelope`; `src/state/share.ts` creates `origin + BASE_URL + #plan=<id>` links
  (Settings > Workout Plan "Copy Share Link", clipboard + visible URL); a boot-hash effect in
  useApp (mirrors #rest-exercise) fetches #plan=<id>, strips the hash, and stages the plan
  behind the SAME pendingPlanImport confirm — never auto-applied. Verified end-to-end against
  local wrangler dev on :8787 (which the dev client's .env.local already points at): create →
  copy → open link → staged "My Push Plan" prompt; 401 unauth create; 404 unknown id.
  **Live-verification traps hit:** worker/.dev.vars ALLOWED_ORIGINS needed http://localhost:5199
  added (and wrangler dev does NOT hot-reload .dev.vars — restart it); and seeding localStorage
  state for a REAL signed-in local account gets wiped by reconcileOnSignIn adopting the
  account's empty server state — PUT the seed state to /state first, then reload to pull.
- **Nutrition check-in** (`nutritionLog` — {date, calories?, proteinG?}, one entry per LOCAL
  date, same-day re-log MERGES fields rather than erasing). Progress-tab card: two inputs +
  protein/calories sparkline toggle (`nutritionChartData`, skipping days that didn't log that
  metric) + `nutritionSummary` 7-day line (averages computed only over days carrying each
  field). buildCoachContext emits the summary as `ctx.nutrition` (only when non-empty);
  worker/src/prompt.ts sanitizes it (capNum bounds) and renders "Nutrition check-in: logged N of
  the last 7 days, averaging ~X kcal/day and ~Y g protein/day." Explicitly NOT a food diary.

Prod deploys this round: Worker deployed twice (share routes + nutrition prompt; cron intact),
`shared_plans` created in remote D1. **Note: `wrangler d1 execute --remote --file=...` hit a real
Authentication error [code: 10000] on the d1 IMPORT endpoint while `wrangler deploy` worked fine
— the `--command` form (different API endpoint) succeeded. Try --command with the file's
statements inline before reaching for `npx wrangler login`.** Pages auto-deployed on push.
