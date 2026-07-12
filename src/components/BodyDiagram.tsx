// Anatomical body map — this renders the user-supplied reference anatomy chart itself
// (public/body-front.png / body-back.png, cropped from their original front+back composite
// image) with a semi-transparent SVG shading overlay on top, rather than a hand-drawn
// approximation of it. Overlay shape coordinates were calibrated directly against these exact
// images (front is 482x973px, back is 470x966px — a coordinate grid was composited over each and
// read back to place every region), not derived from generic anatomy proportions, so they track
// this specific artwork's pose/proportions. Opacity per region encodes how much that muscle is
// worked, same as before.
const ACCENT_BASE = 'oklch(0.65 0.19 35';

interface Region { d: string; muscle: string; }

const FRONT_W = 482, FRONT_H = 973;
const BACK_W = 470, BACK_H = 966;

const FRONT_REGIONS: Region[] = [
  { d: 'M118,149 A52,58 0 1 1 118,265 A52,58 0 1 1 118,149', muscle: 'Shoulders' },
  { d: 'M364,149 A52,58 0 1 1 364,265 A52,58 0 1 1 364,149', muscle: 'Shoulders' },
  { d: 'M238,178 Q160,182 148,225 Q143,260 175,288 Q210,295 238,290 Z', muscle: 'Chest' },
  { d: 'M244,178 Q322,182 334,225 Q339,260 307,288 Q272,295 244,290 Z', muscle: 'Chest' },
  { d: 'M108,250 A42,85 0 1 1 108,420 A42,85 0 1 1 108,250', muscle: 'Biceps' },
  { d: 'M374,250 A42,85 0 1 1 374,420 A42,85 0 1 1 374,250', muscle: 'Biceps' },
  { d: 'M175,292 L307,292 Q315,340 300,400 Q280,440 241,462 Q202,440 182,400 Q167,340 175,292 Z', muscle: 'Core' },
  { d: 'M172,498 Q238,492 236,560 Q234,620 220,672 Q195,678 178,650 Q165,580 172,498 Z', muscle: 'Quads' },
  { d: 'M310,498 Q244,492 246,560 Q248,620 262,672 Q287,678 304,650 Q317,580 310,498 Z', muscle: 'Quads' },
  { d: 'M178,702 Q233,708 228,760 Q225,800 205,822 Q182,815 178,775 Q172,730 178,702 Z', muscle: 'Calves' },
  { d: 'M304,702 Q249,708 254,760 Q257,800 277,822 Q300,815 304,775 Q310,730 304,702 Z', muscle: 'Calves' }
];

const BACK_REGIONS: Region[] = [
  { d: 'M235,92 Q295,105 280,190 Q260,220 235,215 Q210,220 190,190 Q175,105 235,92 Z', muscle: 'Back' },
  { d: 'M105,147 A48,58 0 1 1 105,263 A48,58 0 1 1 105,147', muscle: 'Rear Delts' },
  { d: 'M365,147 A48,58 0 1 1 365,263 A48,58 0 1 1 365,147', muscle: 'Rear Delts' },
  { d: 'M172,232 Q180,300 165,370 Q150,410 95,418 Q75,390 82,320 Q90,255 172,232 Z', muscle: 'Back' },
  { d: 'M298,232 Q290,300 305,370 Q320,410 375,418 Q395,390 388,320 Q380,255 298,232 Z', muscle: 'Back' },
  { d: 'M108,250 A42,85 0 1 1 108,420 A42,85 0 1 1 108,250', muscle: 'Triceps' },
  { d: 'M374,250 A42,85 0 1 1 374,420 A42,85 0 1 1 374,250', muscle: 'Triceps' },
  { d: 'M205,230 Q195,300 205,380 Q220,400 235,398 Q250,400 265,380 Q275,300 265,230 Q235,215 205,230 Z', muscle: 'Back' },
  { d: 'M150,395 Q235,382 320,395 Q335,435 320,465 Q235,485 150,465 Q135,435 150,395 Z', muscle: 'Glutes' },
  { d: 'M168,498 Q228,492 226,560 Q224,620 210,668 Q185,672 170,640 Q162,570 168,498 Z', muscle: 'Hamstrings' },
  { d: 'M302,498 Q242,492 244,560 Q246,620 260,668 Q285,672 300,640 Q308,570 302,498 Z', muscle: 'Hamstrings' },
  { d: 'M178,692 Q228,698 224,750 Q220,790 202,818 Q180,810 176,772 Q170,725 178,692 Z', muscle: 'Calves' },
  { d: 'M292,692 Q242,698 246,750 Q250,790 268,818 Q290,810 294,772 Q300,725 292,692 Z', muscle: 'Calves' }
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
    <div style={{ width, height, position: 'relative', borderRadius: 8, overflow: 'hidden', background: '#f7f3ee', flex: 'none' }}>
      <img src={src} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain' }} />
      <svg viewBox={`0 0 ${vbW} ${vbH}`} preserveAspectRatio="xMidYMid meet" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
        {regions.map((r, i) => <path key={i} d={r.d} fill={fillForMuscle(r.muscle, ranks)} />)}
      </svg>
    </div>
  );
}
