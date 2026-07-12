// Anatomical body map — this renders the user-supplied reference anatomy chart itself
// (public/body-front.png / body-back.png, cropped from their original front+back composite
// image, then color-inverted so it's light line art on a dark background instead of a white
// square that clashed with the rest of this app's dark UI) with a semi-transparent SVG shading
// overlay on top, rather than a hand-drawn approximation of it. Opacity per region = how much
// that muscle is worked, same as before.
//
// Overlay `<path>`/ellipse coordinates were calibrated directly against these exact images
// (front is 482x973px, back is 470x966px) by compositing each candidate shape onto the real
// image with `sharp` and visually checking containment, iterating until each region sat inside
// its muscle's outline instead of bleeding across it — a coordinate grid alone wasn't precise
// enough for this (an earlier pass left shoulders overlapping the neck and the arm regions
// running well past the elbow into the forearm). If the reference image ever changes, redo the
// same composite-and-check loop rather than trusting grid-reading alone.
const ACCENT_BASE = 'oklch(0.65 0.19 35';

interface Region { d: string; muscle: string; }

const FRONT_W = 482, FRONT_H = 973;
const BACK_W = 470, BACK_H = 966;

const FRONT_REGIONS: Region[] = [
  { d: 'M118,205 A38,44 0 1 1 118,293 A38,44 0 1 1 118,205', muscle: 'Shoulders' },
  { d: 'M364,205 A38,44 0 1 1 364,293 A38,44 0 1 1 364,205', muscle: 'Shoulders' },
  { d: 'M236,200 Q178,203 168,232 Q164,256 188,278 Q214,286 236,282 Z', muscle: 'Chest' },
  { d: 'M246,200 Q304,203 314,232 Q318,256 294,278 Q268,286 246,282 Z', muscle: 'Chest' },
  { d: 'M97,245 A50,85 0 1 1 97,415 A50,85 0 1 1 97,245', muscle: 'Biceps' },
  { d: 'M385,245 A50,85 0 1 1 385,415 A50,85 0 1 1 385,245', muscle: 'Biceps' },
  { d: 'M175,292 L307,292 Q315,340 300,400 Q280,440 241,462 Q202,440 182,400 Q167,340 175,292 Z', muscle: 'Core' },
  { d: 'M172,498 Q238,492 236,560 Q234,620 220,672 Q195,678 178,650 Q165,580 172,498 Z', muscle: 'Quads' },
  { d: 'M310,498 Q244,492 246,560 Q248,620 262,672 Q287,678 304,650 Q317,580 310,498 Z', muscle: 'Quads' },
  { d: 'M178,702 Q233,708 228,760 Q225,800 205,822 Q182,815 178,775 Q172,730 178,702 Z', muscle: 'Calves' },
  { d: 'M304,702 Q249,708 254,760 Q257,800 277,822 Q300,815 304,775 Q310,730 304,702 Z', muscle: 'Calves' }
];

const BACK_REGIONS: Region[] = [
  { d: 'M235,72 Q283,88 268,165 Q252,192 235,188 Q218,192 202,165 Q187,88 235,72 Z', muscle: 'Back' },
  { d: 'M140,163 A42,52 0 1 1 140,267 A42,52 0 1 1 140,163', muscle: 'Rear Delts' },
  { d: 'M330,163 A42,52 0 1 1 330,267 A42,52 0 1 1 330,163', muscle: 'Rear Delts' },
  { d: 'M172,258 Q178,312 172,368 Q160,400 135,405 Q125,385 128,330 Q130,275 172,258 Z', muscle: 'Back' },
  { d: 'M298,258 Q292,312 298,368 Q310,400 335,405 Q345,385 342,330 Q340,275 298,258 Z', muscle: 'Back' },
  { d: 'M65,260 A48,75 0 1 1 65,410 A48,75 0 1 1 65,260', muscle: 'Triceps' },
  { d: 'M405,260 A48,75 0 1 1 405,410 A48,75 0 1 1 405,260', muscle: 'Triceps' },
  { d: 'M208,220 Q198,300 208,395 Q220,412 235,410 Q250,412 262,395 Q272,300 262,220 Q235,205 208,220 Z', muscle: 'Back' },
  { d: 'M140,405 Q235,395 330,405 Q350,462 330,512 Q235,536 140,512 Q120,462 140,405 Z', muscle: 'Glutes' },
  { d: 'M168,528 Q228,522 226,590 Q224,640 210,678 Q185,682 170,655 Q162,590 168,528 Z', muscle: 'Hamstrings' },
  { d: 'M302,528 Q242,522 244,590 Q246,640 260,678 Q285,682 300,655 Q308,590 302,528 Z', muscle: 'Hamstrings' },
  { d: 'M178,700 Q228,706 224,755 Q220,795 202,822 Q180,814 176,778 Q170,733 178,700 Z', muscle: 'Calves' },
  { d: 'M292,700 Q242,706 246,755 Q250,795 268,822 Q290,814 294,778 Q300,733 292,700 Z', muscle: 'Calves' }
];

export function fillForMuscle(muscle: string | null, ranks: Record<string, number>): string {
  if (!muscle || !(muscle in ranks)) return 'transparent';
  const opacity = 0.28 + 0.6 * (ranks[muscle] || 0);
  return ACCENT_BASE + ' / ' + opacity.toFixed(2) + ')';
}

export function BodyDiagram({ view, ranks, width = 34, height = 63 }: {
  view: 'front' | 'back';
  ranks: Record<string, number>;
  width?: number;
  height?: number;
}) {
  const isFront = view === 'front';
  const src = `${import.meta.env.BASE_URL}${isFront ? 'body-front.png' : 'body-back.png'}`;
  const regions = isFront ? FRONT_REGIONS : BACK_REGIONS;
  const vbW = isFront ? FRONT_W : BACK_W;
  const vbH = isFront ? FRONT_H : BACK_H;
  return (
    <div style={{ width, height, position: 'relative', borderRadius: 8, overflow: 'hidden', background: '#0a0908', flex: 'none' }}>
      <img src={src} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain' }} />
      <svg viewBox={`0 0 ${vbW} ${vbH}`} preserveAspectRatio="xMidYMid meet" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
        {regions.map((r, i) => <path key={i} d={r.d} fill={fillForMuscle(r.muscle, ranks)} />)}
      </svg>
    </div>
  );
}
