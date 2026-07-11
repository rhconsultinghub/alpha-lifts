// Schematic anatomical body map — single accent color, opacity encodes how much each muscle is
// worked. Major muscle groups (deltoids, pecs, lats, arms, quads/hamstrings, calves, glutes,
// traps/erectors) are hand-drawn organic shapes rather than plain rectangles, echoing a proper
// anatomy-chart silhouette; the ab grid and minor connective bits (neck, forearms, feet) stay
// simple geometric shapes since they read fine that way even in real anatomy references.
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
// the same from either side.
const DELT_L = 'M43,33 Q54,33 54,45 Q54,57 43,57 Q34,55 34,44 Q35,34 43,33 Z';
const DELT_R = 'M117,33 Q106,33 106,45 Q106,57 117,57 Q126,55 126,44 Q125,34 117,33 Z';
// upper arm — used for both front (Biceps) and back (Triceps).
const ARM_L = 'M30,52 Q44,48 43,68 Q42,86 32,88 Q26,86 27,68 Q26,54 30,52 Z';
const ARM_R = 'M130,52 Q116,48 117,68 Q118,86 128,88 Q134,86 133,68 Q134,54 130,52 Z';
// front thigh (Quads) and back thigh (Hamstrings) share the same silhouette.
const THIGH_L = 'M56,164 Q78,160 77,190 Q76,214 66,222 Q58,218 56,196 Q52,176 56,164 Z';
const THIGH_R = 'M104,164 Q82,160 83,190 Q84,214 94,222 Q102,218 104,196 Q108,176 104,164 Z';
// calf — same silhouette on both views.
const CALF_L = 'M58,228 Q76,232 74,252 Q72,268 64,274 Q58,270 57,252 Q56,236 58,228 Z';
const CALF_R = 'M102,228 Q84,232 86,252 Q88,268 96,274 Q102,270 103,252 Q104,236 102,228 Z';

const FRONT_PARTS: Shape[] = [
  // head + neck
  circle(80, 16, 13, null),
  rect(73, 27, 14, 10, 3, null),
  // shoulders (deltoids)
  path(DELT_L, 'Shoulders'), path(DELT_R, 'Shoulders'),
  // chest — a pair of curved pecs tapering to a point at the sternum
  path('M78,40 Q66,34 58,42 Q54,54 60,64 Q68,70 76,66 Q80,56 78,40 Z', 'Chest'),
  path('M82,40 Q94,34 102,42 Q106,54 100,64 Q92,70 84,66 Q80,56 82,40 Z', 'Chest'),
  // upper arms / forearms
  path(ARM_L, 'Biceps'), path(ARM_R, 'Biceps'),
  rect(27, 91, 13, 38, 6, null),
  rect(120, 91, 13, 38, 6, null),
  rect(24, 128, 11, 16, 5, null),
  rect(125, 128, 11, 16, 5, null),
  // abs — 3x2 grid
  rect(63, 74, 15, 15, 5, 'Core'),
  rect(82, 74, 15, 15, 5, 'Core'),
  rect(63, 91, 15, 15, 5, 'Core'),
  rect(82, 91, 15, 15, 5, 'Core'),
  rect(63, 108, 15, 15, 5, 'Core'),
  rect(82, 108, 15, 15, 5, 'Core'),
  // obliques flanking the abs
  rect(53, 76, 8, 46, 4, 'Core'),
  rect(99, 76, 8, 46, 4, 'Core'),
  // hips/waist connector
  rect(58, 138, 44, 22, 12, null),
  // quads
  path(THIGH_L, 'Quads'), path(THIGH_R, 'Quads'),
  // calves
  path(CALF_L, 'Calves'), path(CALF_R, 'Calves'),
  // feet
  rect(54, 278, 21, 10, 4, null),
  rect(85, 278, 21, 10, 4, null)
];

const BACK_PARTS: Shape[] = [
  // head + neck
  circle(80, 16, 13, null),
  rect(73, 27, 14, 10, 3, null),
  // trapezius — kite shape from the neck down between the shoulder blades
  path('M80,34 Q96,38 92,52 Q86,60 80,58 Q74,60 68,52 Q64,38 80,34 Z', 'Back'),
  // rear delts
  path(DELT_L, 'Rear Delts'), path(DELT_R, 'Rear Delts'),
  // lats — wing shapes tapering from the armpit down to a point at the waist (v-taper)
  path('M65,60 Q68,80 62,100 Q58,112 48,114 Q42,104 44,86 Q46,66 65,60 Z', 'Back'),
  path('M95,60 Q92,80 98,100 Q102,112 112,114 Q118,104 116,86 Q114,66 95,60 Z', 'Back'),
  // triceps / forearms
  path(ARM_L, 'Triceps'), path(ARM_R, 'Triceps'),
  rect(27, 91, 13, 38, 6, null),
  rect(120, 91, 13, 38, 6, null),
  rect(24, 128, 11, 16, 5, null),
  rect(125, 128, 11, 16, 5, null),
  // lower back / erector spinae — a column either side of the spine
  path('M70,110 Q66,124 70,136 Q80,140 90,136 Q94,124 90,110 Q80,106 70,110 Z', 'Back'),
  // glutes
  path('M56,140 Q80,132 104,140 Q110,152 104,162 Q80,170 56,162 Q50,152 56,140 Z', 'Glutes'),
  // hamstrings
  path(THIGH_L, 'Hamstrings'), path(THIGH_R, 'Hamstrings'),
  // calves
  path(CALF_L, 'Calves'), path(CALF_R, 'Calves'),
  // feet
  rect(54, 278, 21, 10, 4, null),
  rect(85, 278, 21, 10, 4, null)
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
