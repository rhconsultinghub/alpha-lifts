// Generates public/badge-96.png, the small status-bar glyph for rest notifications.
//
// Kept in the repo rather than run as a throwaway: the app-icon generator wasn't, and CLAUDE.md
// records that as a mistake — those icons can now only be changed by hand. Run from the project
// root: `npm install --no-save sharp && node scripts/make-badge.mjs`. sharp is deliberately not a
// dependency, since this runs approximately never.
// Android renders `badge` as a pure alpha mask tinted by the system, so this is deliberately
// solid white on transparent with no interior detail — anything shaded would flatten to a blob.
// Stroke weights are heavy for the same reason: it renders around 24dp in the status bar.
import sharp from 'sharp';

const S = 96;
// Bar runs the full width; two plate pairs per side, inner plates taller than outer, and a pair of
// collars between them. Everything is centered on y=48 and mirrored around x=48.
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}" viewBox="0 0 96 96">
  <g fill="#fff">
    <rect x="6"  y="42" width="84" height="12" rx="4"/>
    <rect x="14" y="26" width="12" height="44" rx="5"/>
    <rect x="70" y="26" width="12" height="44" rx="5"/>
    <rect x="30" y="32" width="10" height="32" rx="4"/>
    <rect x="56" y="32" width="10" height="32" rx="4"/>
  </g>
</svg>`;

await sharp(Buffer.from(svg)).png().toFile('public/badge-96.png');
console.log('wrote public/badge-96.png');
