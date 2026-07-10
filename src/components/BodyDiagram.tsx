// Schematic anatomical body map — single accent color, opacity encodes how much each muscle is
// worked. More detailed than a plain silhouette: chest/abs/back are split into distinct
// anatomical regions (pecs, obliques, traps, lats, erectors) rather than one big torso blob.
const ACCENT_BASE = 'oklch(0.65 0.19 35';

interface RectShape { shape: 'rect'; attrs: { x: number; y: number; width: number; height: number; rx: number }; muscle: string | null; }
interface CircleShape { shape: 'circle'; attrs: { cx: number; cy: number; r: number }; muscle: string | null; }
type Shape = RectShape | CircleShape;

const rect = (x: number, y: number, width: number, height: number, rx: number, muscle: string | null): RectShape =>
  ({ shape: 'rect', attrs: { x, y, width, height, rx }, muscle });
const circle = (cx: number, cy: number, r: number, muscle: string | null): CircleShape =>
  ({ shape: 'circle', attrs: { cx, cy, r }, muscle });

const FRONT_PARTS: Shape[] = [
  // head + neck
  circle(80, 16, 13, null),
  rect(73, 27, 14, 10, 3, null),
  // shoulders (deltoids)
  circle(43, 45, 12, 'Shoulders'),
  circle(117, 45, 12, 'Shoulders'),
  // chest — two pecs either side of the sternum line
  rect(56, 38, 22, 32, 13, 'Chest'),
  rect(82, 38, 22, 32, 13, 'Chest'),
  // upper arms / forearms
  rect(29, 50, 15, 40, 7, 'Biceps'),
  rect(116, 50, 15, 40, 7, 'Biceps'),
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
  rect(54, 162, 23, 62, 11, 'Quads'),
  rect(83, 162, 23, 62, 11, 'Quads'),
  // calves
  rect(56, 226, 19, 50, 9, 'Calves'),
  rect(85, 226, 19, 50, 9, 'Calves'),
  // feet
  rect(54, 278, 21, 10, 4, null),
  rect(85, 278, 21, 10, 4, null)
];

const BACK_PARTS: Shape[] = [
  // head + neck
  circle(80, 16, 13, null),
  rect(73, 27, 14, 10, 3, null),
  // trapezius
  rect(64, 36, 32, 24, 11, 'Back'),
  // rear delts
  circle(43, 45, 12, 'Rear Delts'),
  circle(117, 45, 12, 'Rear Delts'),
  // lats
  rect(44, 58, 21, 56, 10, 'Back'),
  rect(95, 58, 21, 56, 10, 'Back'),
  // triceps / forearms
  rect(29, 50, 15, 40, 7, 'Triceps'),
  rect(116, 50, 15, 40, 7, 'Triceps'),
  rect(27, 91, 13, 38, 6, null),
  rect(120, 91, 13, 38, 6, null),
  rect(24, 128, 11, 16, 5, null),
  rect(125, 128, 11, 16, 5, null),
  // lower back / erector spinae
  rect(68, 108, 24, 30, 10, 'Back'),
  // glutes
  rect(54, 138, 52, 28, 15, 'Glutes'),
  // hamstrings
  rect(54, 166, 23, 60, 11, 'Hamstrings'),
  rect(83, 166, 23, 60, 11, 'Hamstrings'),
  // calves
  rect(56, 226, 19, 50, 9, 'Calves'),
  rect(85, 226, 19, 50, 9, 'Calves'),
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
        return p.shape === 'circle'
          ? <circle key={i} cx={p.attrs.cx} cy={p.attrs.cy} r={p.attrs.r} fill={fill} {...strokeProps} />
          : <rect key={i} x={p.attrs.x} y={p.attrs.y} width={p.attrs.width} height={p.attrs.height} rx={p.attrs.rx} fill={fill} {...strokeProps} />;
      })}
    </svg>
  );
}
