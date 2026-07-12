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
- **`src/components/BodyDiagram.tsx`** — anatomical body map (front/back). This renders a real
  reference image (`public/body-front.png` / `body-back.png`, 482x973 / 470x966px — cropped and
  auto-trimmed from a user-supplied front+back anatomy chart) with a semi-transparent SVG shading
  overlay on top; it does **not** hand-draw the body. Opacity per region = how much that muscle is
  worked, same as before. The source images are **color-inverted** (`sharp().negate()`, then
  palette-compressed) so they render as light line art on a near-black `#0a0908` background
  instead of dark lines on a white card — the white card was previously called out by the user as
  looking like "a white square that sticks out" against this app's otherwise all-dark UI; inverting
  the art itself (rather than just recoloring the wrapper behind it) was the fix, since the
  original source art's background *was* the white square. Overlay `<path>`/ellipse coordinates
  were calibrated directly against these exact images — a coordinate grid was composited over each
  cropped image with `sharp`, read back visually, and each region's shape hand-placed to align
  with that specific artwork — not derived from generic anatomy proportions. This calibration has
  gone through two passes: the first pass got the coordinate *space* right but left several
  regions genuinely mispositioned (front shoulders overlapping the neck, front/back arm regions
  bleeding past the elbow into the forearm, back rear-delts/traps/triceps overlapping each other
  heavily); the second pass tightened all of those per user feedback that highlights weren't
  staying inside the muscle outlines. If the reference image ever changes, the overlay coordinates
  need to be recalibrated the same way (composite a labeled grid over the new image, read it,
  redraw the regions, then composite the *exact* region paths back over the image and visually
  confirm containment before trusting it — a coordinate grid read by eye alone was not precise
  enough on its own in either pass). The component sizes the image via `objectFit: contain` +
  matching SVG `viewBox`/`preserveAspectRatio` so the overlay and image always scale identically
  regardless of the two images' slightly different aspect ratios. There's no live-app screenshot
  tool reliably available in every sandbox — verifying a change here by extracting the rendered
  SVG's live DOM markup and compositing it back onto the source PNG with `sharp` in a scratch
  script, then reading the resulting PNG, has worked when the harness's own screenshot action
  hangs.
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

- `vite.config.ts`: `base: '/alpha-lifts/'` in production builds (must match the GitHub repo
  name — this repo is named `alpha-lifts`). Dev server stays at `/`.
- `vite-plugin-pwa` generates the manifest + service worker (`registerType: 'autoUpdate'`).
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
- Project folder is at `C:\Users\Ryan\Desktop\Personal Projects\Alpha Lifts\alpha-lifts` (a
  prior handoff had it under OneDrive instead — it's since moved to Desktop; update this note
  again if it moves again, since tooling that hardcodes a path — e.g. a dev-server launcher
  config — will silently break otherwise).
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
out against the rest of the UI (see `BodyDiagram.tsx` notes above).

## Open/pending work as of this handoff

Working a punch list from user feedback on phases 8-10 above. Still open:
- **Adaptive workout time estimate** — `estimateDayTime()` in `logic.ts` is currently a static
  formula that never changes. User wants it to start from that formula as a default and then
  evolve based on the user's actual logged `durationMin` history for that program day over time.
  Important constraint from the user: an exercise that was *skipped* mid-session (present in the
  plan, just not completed that particular time — see `exercisesDoneMask`) must **not** reduce
  the estimate; only an exercise actually *removed* from the day's plan should. Needs care to
  distinguish those two cases when deriving the adaptive estimate from history.
- **Default-plan exercise variety** — premade splits currently allow the same exercise to be
  selected for more than one day in the same plan (`DAY_TYPE_EXERCISES` in `wizard.ts`). User
  wants more deliberate/varied exercise selection per day so plans don't repeat the same movement
  needlessly. Re-run the `.verify/`-style per-split/per-training-type audit (volume % + day time,
  see phase 7 above) after any change here, since exercise selection interacts with the
  set-count-rebalancing logic from phase 7 and could regress it.

Ask the user before starting any of the above if picking this up cold — confirm which item(s)
they want next, since this list was captured mid-session and priority order wasn't specified.
