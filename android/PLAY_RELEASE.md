# Play Store release runbook (M1)

Everything code-side is done; the steps below need the owner's tooling/accounts.

## One-time setup (owner)
1. **Android Studio** (developer.android.com/studio): install with SDK Platform 35, Build-Tools,
   Platform-Tools, Emulator. For the emulator on Windows 11 Home, enable Windows Hypervisor
   Platform (Windows features) or install the Android Emulator Hypervisor Driver from SDK
   Manager. A real phone with USB debugging is better for notification testing.
2. **Play Console account** — $25 one-time at play.google.com/console. New personal accounts
   must run a closed test (≥12 testers for 14 days) before *production*; internal testing works
   immediately and indefinitely.
3. **Upload keystore**: from `android/`:
   `keytool -genkeypair -v -keystore alpha-lifts-upload.keystore -alias upload -keyalg RSA -keysize 2048 -validity 10000`
   Copy `keystore.properties.template` → `keystore.properties`, fill it in, and BACK UP the
   keystore + passwords. Enroll the app in **Play App Signing** at first upload.

## Build & first run
- Dev loop: `npm run cap:run` (builds web assets natively-based, syncs, deploys to the connected
  device/emulator). Debug from desktop Chrome via `chrome://inspect#devices`.
- Release bundle: `npm run cap:sync` then `cd android && .\gradlew bundleRelease` →
  `android/app/build/outputs/bundle/release/app-release.aab`.
- If Gradle ever chokes on the space in `L:\Personal Projects\...`, use a directory junction
  (`New-Item -ItemType Junction`) as documented in CLAUDE.md.

## First-boot verification checklist (emulator or device)
- App boots dark, splash → app with no white flash; `window.Capacitor` present.
- Zero CSP violations in the inspected console (fallback if any: native-mode transformIndexHtml
  strip — see plan).
- Onboarding, workout logging, body-diagram masks, exercise photos, YouTube embeds.
- Sign-in against the production Worker (origins already allowlisted + deployed).
- Rest notification: start rest → background + screen off → fires at restEndAt with the barbell
  status-bar icon; tap lands on the owed exercise. Skip/±15s cancel/reschedule it.
- Daily reminder: set 2 min ahead, force-close the app → fires.
- Back button: closes modals one level at a time; on the Program screen it minimizes (not kills).
- Exports (backup/CSV/plan/share card) open the Android share sheet; backup import + progress
  photo add round-trip; airplane mode → app fully usable.
- Measure rest-alert drift (no exact-alarm permission requested); if >~1 min late under Doze,
  add the changeExactNotificationSetting() Settings row (see src/native/notifications.ts note).

## Play Console submission
- Create app (name Alpha Lifts, appId **com.alphalifts.app** — confirm before upload, it is
  permanent) → upload AAB to **Internal testing** first.
- Store listing: short + full description (draft below), phone screenshots (Program, Workout
  with rest timer, Progress charts, Body Diagram, Coach), 512 icon + 1024×500 feature graphic
  (generate from assets/icon.png art).
- Privacy policy URL: `https://rhconsultinghub.github.io/alpha-lifts/privacy.html` (ships with
  the Pages deploy).
- Data safety form: collects email (account, required for sync), fitness info (synced workout
  data), device ID (AI-coach metering); encrypted in transit; deletion via Reset App +
  support-email account deletion (a self-serve delete endpoint is the flagged fast-follow).
- Content rating questionnaire (fitness app, no user-generated content shared publicly).
- The disabled "Subscribe — Coming soon" button is fine for Play (inert upsell; M4 wires IAP).

## Listing copy draft
**Short (80 chars):**
Plan lifts, log sets, and watch every muscle group grow — with an AI coach.

**Full:**
Alpha Lifts is a no-nonsense strength tracker built for progressive overload.
- Smart programs: six proven splits, auto-balanced weekly volume per muscle group
- Fast logging: pre-filled sets, rest timers tuned to effort, warm-up ramps, drop sets, AMRAP, circuits
- Real progression: per-exercise recommendations, PR detection, automatic deload weeks when your training says so
- See it working: est. 1RM trends, weekly muscle heatmaps, an anatomical muscle map, body measurements
- AI Coach (Premium): ask about your lifts and let it adjust your plan in chat
- Your data is yours: works fully offline, free CSV export, optional cloud sync
