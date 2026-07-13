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
  { d: 'M155,175 Q120,170 95,178 Q68,192 68,215 Q65,235 78,252 Q100,262 125,258 Q150,240 155,215 Q158,195 155,175 Z', muscle: 'Shoulders' },
  { d: 'M327,175 Q362,170 387,178 Q414,192 414,215 Q417,235 404,252 Q382,262 357,258 Q332,240 327,215 Q324,195 327,175 Z', muscle: 'Shoulders' },
  { d: 'M236,200 Q178,203 168,232 Q164,256 188,278 Q214,286 236,282 Z', muscle: 'Chest' },
  { d: 'M246,200 Q304,203 314,232 Q318,256 294,278 Q268,286 246,282 Z', muscle: 'Chest' },
  { d: 'M75,250 L125,258 Q128,300 122,335 Q120,370 100,400 Q85,418 65,410 Q48,375 48,330 Q48,290 60,258 Q68,252 75,250 Z', muscle: 'Biceps' },
  { d: 'M407,250 L357,258 Q354,300 360,335 Q362,370 382,400 Q397,418 417,410 Q434,375 434,330 Q434,290 422,258 Q414,252 407,250 Z', muscle: 'Biceps' },
  { d: 'M175,292 L307,292 Q315,340 300,400 Q280,440 241,462 Q202,440 182,400 Q167,340 175,292 Z', muscle: 'Core' },
  { d: 'M172,498 Q238,492 236,560 Q234,620 220,672 Q195,678 178,650 Q165,580 172,498 Z', muscle: 'Quads' },
  { d: 'M310,498 Q244,492 246,560 Q248,620 262,672 Q287,678 304,650 Q317,580 310,498 Z', muscle: 'Quads' },
  { d: 'M178,702 Q233,708 228,760 Q225,800 205,822 Q182,815 178,775 Q172,730 178,702 Z', muscle: 'Calves' },
  { d: 'M304,702 Q249,708 254,760 Q257,800 277,822 Q300,815 304,775 Q310,730 304,702 Z', muscle: 'Calves' }
];

const BACK_REGIONS: Region[] = [
  { d: 'M235,72 Q283,88 268,165 Q252,192 235,188 Q218,192 202,165 Q187,88 235,72 Z', muscle: 'Back' },
  { d: 'M150,150 Q120,152 100,160 Q75,172 72,195 Q68,215 68,225 Q70,240 85,250 Q105,255 118,252 Q135,235 140,220 Q148,185 150,150 Z', muscle: 'Rear Delts' },
  { d: 'M320,150 Q350,152 370,160 Q395,172 398,195 Q402,215 402,225 Q400,240 385,250 Q365,255 352,252 Q335,235 330,220 Q322,185 320,150 Z', muscle: 'Rear Delts' },
  { d: 'M172,258 Q178,312 172,368 Q160,400 135,405 Q125,385 128,330 Q130,275 172,258 Z', muscle: 'Back' },
  { d: 'M298,258 Q292,312 298,368 Q310,400 335,405 Q345,385 342,330 Q340,275 298,258 Z', muscle: 'Back' },
  { d: 'M85,250 L118,252 Q120,300 115,340 Q112,375 100,405 Q85,415 70,405 Q55,370 55,330 Q55,290 65,260 Q75,252 85,250 Z', muscle: 'Triceps' },
  { d: 'M385,250 L352,252 Q350,300 355,340 Q358,375 370,405 Q385,415 400,405 Q415,370 415,330 Q415,290 405,260 Q395,252 385,250 Z', muscle: 'Triceps' },
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
