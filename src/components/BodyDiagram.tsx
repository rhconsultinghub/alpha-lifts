// Schematic anatomical body map, redrawn to follow the proportions/pose of a reference anatomy
// chart (standing straight, arms hanging at the sides, standard front/back muscle-group split) —
// single accent color, opacity encodes how much each muscle is worked. Every region's shape
// deliberately overlaps its neighbor by a few units (shoulder into arm, chest into abs, hip into
// thigh, etc.) so the composite reads as one continuous figure instead of floating disconnected
// parts; only the ab grid and minor connective bits (neck, forearms, hands, feet) stay simple
// geometric shapes since they read fine that way even in real anatomy references.
const ACCENT_BASE = 'oklch(0.65 0.19 35';

interface RectShape { shape: 'rect'; attrs: { x: number; y: number; width: number; height: number; rx: number }; muscle: string | null; }
interface CircleShape { shape: 'circle'; attrs: { cx: number; cy: number; r: number }; muscle: string | null; }
interface PathShape { shape: 'path'; d: string; muscle: string | null; }
type Shape = RectShape | CircleShape | PathShape;

const rect = (x: number, y: number, width: number, height: number, rx: number, muscle: string | null): RectShape =>
  ({ shape: 'rect', attrs: { x, y, width, height, rx }, muscle });
const circle = (cx: number, cy: number, r: number, muscle: string | null): CircleShape =>
  ({ shape: 'circle', attrs: { cx, cy, r }, muscle });
const path = (d: string, muscle: string | null): PathShape => ({ shape: 'path', d, muscle });

// deltoid cap — used for both front (Shoulders) and back (Rear Delts) views, since the outline is
// the same from either side. Reaches up into the neck/traps region and down into the arm.
const DELT_L = 'M66,26 Q24,26 20,52 Q20,70 50,70 Q60,60 62,40 Q64,30 66,26 Z';
const DELT_R = 'M94,26 Q136,26 140,52 Q140,70 110,70 Q100,60 98,40 Q96,30 94,26 Z';
// upper arm — used for both front (Biceps) and back (Triceps), hanging straight down at the side.
const ARM_L = 'M52,58 Q24,56 22,80 Q20,100 34,104 Q48,100 48,80 Q50,66 52,58 Z';
const ARM_R = 'M108,58 Q136,56 138,80 Q140,100 126,104 Q112,100 112,80 Q110,66 108,58 Z';
// front thigh (Quads) and back thigh (Hamstrings) share the same silhouette.
const THIGH_L = 'M58,136 Q82,130 80,166 Q78,196 66,206 Q56,200 56,176 Q52,152 58,136 Z';
const THIGH_R = 'M102,136 Q78,130 80,166 Q82,196 94,206 Q104,200 104,176 Q108,152 102,136 Z';
// calf — same silhouette on both views.
const CALF_L = 'M60,200 Q80,204 76,230 Q74,250 64,258 Q56,252 56,232 Q54,212 60,200 Z';
const CALF_R = 'M100,200 Q80,204 84,230 Q86,250 96,258 Q104,252 104,232 Q106,212 100,200 Z';
// neck — wide enough to overlap both the shoulder caps and (on the back view) the traps.
const NECK = rect(60, 24, 40, 18, 5, null);
const FOREARM_L = rect(22, 96, 18, 42, 7, null);
const FOREARM_R = rect(120, 96, 18, 42, 7, null);
const HAND_L = rect(20, 134, 20, 20, 6, null);
const HAND_R = rect(120, 134, 20, 20, 6, null);
const FOOT_L = rect(52, 254, 26, 14, 5, null);
const FOOT_R = rect(82, 254, 26, 14, 5, null);

const FRONT_PARTS: Shape[] = [
  // head + neck
  circle(80, 15, 14, null),
  NECK,
  // shoulders (deltoids)
  path(DELT_L, 'Shoulders'), path(DELT_R, 'Shoulders'),
  // chest — a pair of curved pecs reaching up past the collarbone and in past the sternum
  path('M78,38 Q60,28 50,44 Q44,58 52,70 Q64,78 78,72 Q82,60 78,38 Z', 'Chest'),
  path('M82,38 Q100,28 110,44 Q116,58 108,70 Q96,78 82,72 Q78,60 82,38 Z', 'Chest'),
  // upper arms / forearms / hands
  path(ARM_L, 'Biceps'), path(ARM_R, 'Biceps'),
  FOREARM_L, FOREARM_R, HAND_L, HAND_R,
  // abs — 3x2 grid, reaching up to overlap the chest
  rect(62, 66, 16, 16, 5, 'Core'),
  rect(82, 66, 16, 16, 5, 'Core'),
  rect(62, 84, 16, 16, 5, 'Core'),
  rect(82, 84, 16, 16, 5, 'Core'),
  rect(62, 102, 16, 16, 5, 'Core'),
  rect(82, 102, 16, 16, 5, 'Core'),
  // obliques flanking the abs
  rect(50, 68, 14, 56, 5, 'Core'),
  rect(96, 68, 14, 56, 5, 'Core'),
  // hips/waist connector
  rect(54, 116, 52, 28, 13, null),
  // quads
  path(THIGH_L, 'Quads'), path(THIGH_R, 'Quads'),
  // calves
  path(CALF_L, 'Calves'), path(CALF_R, 'Calves'),
  // feet
  FOOT_L, FOOT_R
];

const BACK_PARTS: Shape[] = [
  // head + neck
  circle(80, 15, 14, null),
  NECK,
  // trapezius — kite shape from the neck down between the shoulder blades, overlapping the
  // rear delts on either side
  path('M80,24 Q100,28 96,54 Q90,64 80,62 Q70,64 64,54 Q60,28 80,24 Z', 'Back'),
  // rear delts
  path(DELT_L, 'Rear Delts'), path(DELT_R, 'Rear Delts'),
  // lats — wing shapes tapering from the armpit down to a point at the waist (v-taper)
  path('M58,60 Q64,90 56,116 Q50,132 38,134 Q30,120 34,96 Q38,68 58,60 Z', 'Back'),
  path('M102,60 Q96,90 104,116 Q110,132 122,134 Q130,120 126,96 Q122,68 102,60 Z', 'Back'),
  // triceps / forearms / hands
  path(ARM_L, 'Triceps'), path(ARM_R, 'Triceps'),
  FOREARM_L, FOREARM_R, HAND_L, HAND_R,
  // lower back / erector spinae — a wide column either side of the spine, bridging the traps
  // above to the glutes below
  path('M66,58 Q60,80 64,110 Q72,118 80,116 Q88,118 96,110 Q100,80 94,58 Q80,50 66,58 Z', 'Back'),
  // glutes
  path('M50,110 Q80,102 110,110 Q118,124 110,138 Q80,148 50,138 Q42,124 50,110 Z', 'Glutes'),
  // hamstrings
  path(THIGH_L, 'Hamstrings'), path(THIGH_R, 'Hamstrings'),
  // calves
  path(CALF_L, 'Calves'), path(CALF_R, 'Calves'),
  // feet
  FOOT_L, FOOT_R
];

export function fillForMuscle(muscle: string | null, ranks: Record<string, number>): string {
  if (!muscle || !(muscle in ranks)) return 'rgba(255,255,255,.07)';
  const opacity = 0.22 + 0.78 * (ranks[muscle] || 0);
  return ACCENT_BASE + ' / ' + opacity.toFixed(2) + ')';
}

export function BodyDiagram({ view, ranks, width = 34, height = 63, showStroke = false }: {
  view: 'front' | 'back';
  ranks: Record<string, number>;
  width?: number;
  height?: number;
  showStroke?: boolean;
}) {
  const parts = view === 'front' ? FRONT_PARTS : BACK_PARTS;
  return (
    <svg viewBox="0 0 160 296" style={{ width, height, display: 'block' }}>
      {parts.map((p, i) => {
        const fill = fillForMuscle(p.muscle, ranks);
        const strokeProps = showStroke ? { stroke: 'rgba(255,255,255,.14)', strokeWidth: 1 } : {};
        if (p.shape === 'circle') return <circle key={i} cx={p.attrs.cx} cy={p.attrs.cy} r={p.attrs.r} fill={fill} {...strokeProps} />;
        if (p.shape === 'path') return <path key={i} d={p.d} fill={fill} {...strokeProps} />;
        return <rect key={i} x={p.attrs.x} y={p.attrs.y} width={p.attrs.width} height={p.attrs.height} rx={p.attrs.rx} fill={fill} {...strokeProps} />;
      })}
    </svg>
  );
}
