// Anatomical body map. Earlier versions tried to overlay hand-traced shading regions on top of a
// separate reference photo (public/body-front.png / body-back.png) and match their contours
// pixel-for-pixel — four calibration passes across multiple sessions never fully landed, because
// getting an overlay to sit exactly inside a photo's muscle outlines by eyeballing/sampling pixel
// coordinates is inherently fiddly. This version sidesteps the containment problem entirely: the
// figure itself is built from simple SVG primitives (rects/ellipses) authored directly in this
// file, so a muscle region's shape *is* the body art rather than an approximation of something
// else — there's nothing external to mis-align against. A muted "skin" layer (torso backdrop,
// head, neck, hips, forearms, feet) fills in the untracked connective parts so the figure always
// reads as one coherent body, with tracked muscle regions rendered on top: a faint permanent base
// fill/stroke so the shape is visible even unworked, plus the accent-color highlight layered over
// that when the muscle has been trained (same intensity-by-opacity scheme as before).
const ACCENT_BASE = 'oklch(0.65 0.19 35';
const SKIN = 'rgba(245,240,234,.09)';
const SKIN_STROKE = 'rgba(245,240,234,.14)';
const BASE_FILL = 'rgba(245,240,234,.06)';
const BASE_STROKE = 'rgba(245,240,234,.16)';

const VB_W = 200, VB_H = 488;
const CX = 100;

type Rect = { kind: 'rect'; x: number; y: number; w: number; h: number; rx: number };
type Ellipse = { kind: 'ellipse'; cx: number; cy: number; rx: number; ry: number };
type Shape = Rect | Ellipse;
interface Region { shape: Shape; muscle: string; }

const mirror = (s: Shape): Shape =>
  s.kind === 'rect' ? { ...s, x: VB_W - s.x - s.w } : { ...s, cx: VB_W - s.cx };

const rect = (x: number, y: number, w: number, h: number, rx: number): Rect => ({ kind: 'rect', x, y, w, h, rx });
const ellipse = (cx: number, cy: number, rx: number, ry: number): Ellipse => ({ kind: 'ellipse', cx, cy, rx, ry });

// ---------- shared skeleton (both views draw the same limb boxes; only the label/shading on top
// differs — biceps and triceps are literally the front/back of the same upper-arm box, etc.) ----
const HEAD = ellipse(CX, 25, 18, 22);
const NECK = rect(CX - 9, 44, 18, 12, 4);
const SHOULDER_L = ellipse(58, 72, 19, 24);
const SHOULDER_R = mirror(SHOULDER_L) as Ellipse;
const UPPER_ARM_L = rect(29, 74, 26, 92, 13);
const UPPER_ARM_R = mirror(UPPER_ARM_L) as Rect;
const FOREARM_L = rect(28, 163, 22, 78, 11);
const FOREARM_R = mirror(FOREARM_L) as Rect;
const HAND_L = ellipse(39, 250, 10, 13);
const HAND_R = mirror(HAND_L) as Ellipse;
const THIGH_L = rect(60, 266, 35, 108, 17);
const THIGH_R = mirror(THIGH_L) as Rect;
const KNEE_L = ellipse(77, 380, 16, 11);
const KNEE_R = mirror(KNEE_L) as Ellipse;
const CALF_L = rect(62, 388, 29, 76, 14);
const CALF_R = mirror(CALF_L) as Rect;
const FOOT_L = ellipse(76, 472, 16, 9);
const FOOT_R = mirror(FOOT_L) as Ellipse;

const TORSO_SKIN = rect(56, 68, 88, 156, 22);
const HIP_SKIN = rect(54, 214, 92, 58, 24);

const SKIN_SHAPES: Shape[] = [
  HEAD, NECK, FOREARM_L, FOREARM_R, HAND_L, HAND_R, KNEE_L, KNEE_R, FOOT_L, FOOT_R
];

const FRONT_REGIONS: Region[] = [
  { shape: TORSO_SKIN, muscle: '' }, // backdrop, rendered as skin (muscle: '' never matches a rank)
  { shape: HIP_SKIN, muscle: '' },
  { shape: rect(58, 70, 38, 46, 16), muscle: 'Chest' },
  { shape: mirror(rect(58, 70, 38, 46, 16)), muscle: 'Chest' },
  { shape: rect(72, 118, 56, 90, 14), muscle: 'Core' },
  { shape: SHOULDER_L, muscle: 'Shoulders' },
  { shape: SHOULDER_R, muscle: 'Shoulders' },
  { shape: UPPER_ARM_L, muscle: 'Biceps' },
  { shape: UPPER_ARM_R, muscle: 'Biceps' },
  { shape: THIGH_L, muscle: 'Quads' },
  { shape: THIGH_R, muscle: 'Quads' },
  { shape: CALF_L, muscle: 'Calves' },
  { shape: CALF_R, muscle: 'Calves' }
];

const BACK_REGIONS: Region[] = [
  { shape: rect(56, 66, 88, 162, 22), muscle: 'Back' },
  { shape: HIP_SKIN, muscle: '' },
  { shape: rect(54, 216, 92, 54, 22), muscle: 'Glutes' },
  { shape: SHOULDER_L, muscle: 'Rear Delts' },
  { shape: SHOULDER_R, muscle: 'Rear Delts' },
  { shape: UPPER_ARM_L, muscle: 'Triceps' },
  { shape: UPPER_ARM_R, muscle: 'Triceps' },
  { shape: THIGH_L, muscle: 'Hamstrings' },
  { shape: THIGH_R, muscle: 'Hamstrings' },
  { shape: CALF_L, muscle: 'Calves' },
  { shape: CALF_R, muscle: 'Calves' }
];

export function fillForMuscle(muscle: string | null, ranks: Record<string, number>): string {
  if (!muscle || !(muscle in ranks)) return 'transparent';
  const opacity = 0.28 + 0.6 * (ranks[muscle] || 0);
  return ACCENT_BASE + ' / ' + opacity.toFixed(2) + ')';
}

function ShapeEl({ shape, fill, stroke }: { shape: Shape; fill: string; stroke?: string }) {
  if (shape.kind === 'ellipse') {
    return <ellipse cx={shape.cx} cy={shape.cy} rx={shape.rx} ry={shape.ry} fill={fill} stroke={stroke} strokeWidth={stroke ? 1 : 0} />;
  }
  return <rect x={shape.x} y={shape.y} width={shape.w} height={shape.h} rx={shape.rx} fill={fill} stroke={stroke} strokeWidth={stroke ? 1 : 0} />;
}

export function BodyDiagram({ view, ranks, width = 34, height = 63 }: {
  view: 'front' | 'back';
  ranks: Record<string, number>;
  width?: number;
  height?: number;
}) {
  const isFront = view === 'front';
  const regions = isFront ? FRONT_REGIONS : BACK_REGIONS;
  return (
    <div style={{ width, height, position: 'relative', borderRadius: 8, overflow: 'hidden', background: '#0a0908', flex: 'none' }}>
      <svg viewBox={`0 0 ${VB_W} ${VB_H}`} preserveAspectRatio="xMidYMid meet" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
        {SKIN_SHAPES.map((s, i) => <ShapeEl key={'skin' + i} shape={s} fill={SKIN} stroke={SKIN_STROKE} />)}
        {regions.map((r, i) => (
          <ShapeEl key={'base' + i} shape={r.shape} fill={r.muscle ? BASE_FILL : SKIN} stroke={r.muscle ? BASE_STROKE : SKIN_STROKE} />
        ))}
        {regions.filter(r => r.muscle).map((r, i) => (
          <ShapeEl key={'fill' + i} shape={r.shape} fill={fillForMuscle(r.muscle, ranks)} />
        ))}
      </svg>
    </div>
  );
}
