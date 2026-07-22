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
