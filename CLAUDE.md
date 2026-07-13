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
  `dumbbellProgram()`/`seededFrac()` in `src/data/program.ts` are dead code, not imported anywhere
  in the live app; `createInitialState()` genuinely returns an empty program and `onboarded: false`.
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
