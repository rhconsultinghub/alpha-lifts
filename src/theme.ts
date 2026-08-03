// Single source of truth for the app's brand accent. Previously each of viewModel.ts,
// BodyDiagram.tsx and AppTutorial.tsx declared its own accent constant (and AppTutorial used a
// different orange, #f0752f, than the rest of the app's oklch orange), so the in-app accent had
// drifted. These are the canonical in-app values — importing them keeps every surface in sync.
//
// Note: the app-icon / favicon raster assets in public/ are their own #f0752f orange and are not
// governed by this file (they're pre-rendered PNGs); they read as visually close to the accent.

// Raw oklch Lightness/Chroma/Hue triple, for building alpha-composited variants.
export const ACCENT_OKLCH = '0.65 0.19 35';

// Solid accent — fills, selected states, primary buttons, progress bars.
export const ACCENT = `oklch(${ACCENT_OKLCH})`;

// Slightly lighter/less-saturated accent for text on dark backgrounds (better contrast).
export const ACCENT_TEXT = 'oklch(0.72 0.17 35)';

// Accent at a given opacity, e.g. accentAlpha(0.35) -> 'oklch(0.65 0.19 35 / 0.35)'.
export function accentAlpha(opacity: number): string {
  return `oklch(${ACCENT_OKLCH} / ${opacity.toFixed(2)})`;
}
