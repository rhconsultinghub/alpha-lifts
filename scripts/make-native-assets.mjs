// Generates the @capacitor/assets source images (assets/icon.png 1024², splash 2732²) from the
// existing app icon art, plus the Android notification status-bar drawables (ic_stat_notify)
// from the same white-barbell alpha art the web badge uses. Kept in the repo (like
// make-badge.mjs / make-muscle-masks.mjs — losing one-off asset scripts is a documented
// mistake in this project). Run from the app root:
//   npm install --no-save sharp
//   node scripts/make-native-assets.mjs
//   npm run cap:assets
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';

const BG = '#0d0c0b';

mkdirSync('assets', { recursive: true });

// 1024² icon: the 512 source composited onto its own background color at 2x. The art is a
// rounded-square gradient tile; scaling it to fill 1024 keeps it identical to the PWA icon.
const icon512 = await sharp('public/icon-512.png').resize(1024, 1024, { kernel: 'lanczos3' }).toBuffer();
await sharp(icon512).png().toFile('assets/icon.png');

// 2732² splash: dark background, glyph centered at ~28% width (splash screens crop from center
// on every aspect ratio, so the safe zone is small).
const glyph = await sharp('public/icon-512.png').resize(760, 760, { kernel: 'lanczos3' }).toBuffer();
const splash = sharp({ create: { width: 2732, height: 2732, channels: 4, background: BG } })
  .composite([{ input: glyph, gravity: 'center' }])
  .png();
await splash.toFile('assets/splash.png');
await sharp('assets/splash.png').toFile('assets/splash-dark.png');

// Notification small icon: Android renders alpha-only and tints it, exactly like the web badge.
// Standard dpi bucket sizes for a 24dp status-bar icon.
const buckets = [
  ['mdpi', 24], ['hdpi', 36], ['xhdpi', 48], ['xxhdpi', 72], ['xxxhdpi', 96]
];
for (const [bucket, px] of buckets) {
  const dir = `android/app/src/main/res/drawable-${bucket}`;
  mkdirSync(dir, { recursive: true });
  await sharp('public/badge-96.png').resize(px, px, { kernel: 'lanczos3' }).png().toFile(`${dir}/ic_stat_notify.png`);
}

console.log('native assets written: assets/icon.png, assets/splash*.png, ic_stat_notify drawables');
