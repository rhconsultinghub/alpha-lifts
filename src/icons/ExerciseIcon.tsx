// Original line-art pictograms for exercises, keyed by movement "pattern" (shared across
// equipment variants of the same movement — e.g. barbell row / dumbbell row both use "row").
// Drawn fresh for this app; no external assets. Body lines render as a soft duotone stroke
// (a wide translucent underlayer plus a crisp top line) so the figure reads with some mass/weight
// instead of a thin wireframe; equipment (bars, benches, machines) stays a plain single line so
// the eye can tell person from gear at a glance. Falls back to a generic dumbbell glyph for
// patterns without a dedicated pose.
import type { CSSProperties } from 'react';

const STROKE = 'currentColor';

function Figure({ children }: { children: React.ReactNode }) {
  return (
    <svg viewBox="0 0 64 64" fill="none" stroke={STROKE} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" style={{ width: '100%', height: '100%' }}>
      {children}
    </svg>
  );
}

// A "body" line: drawn twice (wide + soft, then narrow + solid) so the figure has visual mass.
function B({ d }: { d: string }) {
  return (
    <>
      <path d={d} strokeWidth={7.5} opacity={0.22} />
      <path d={d} strokeWidth={2.9} />
    </>
  );
}

// Small filled disc — used at barbell ends to read as a loaded weight plate.
function Plate({ cx, cy }: { cx: number; cy: number }) {
  return <circle cx={cx} cy={cy} r={3.4} fill={STROKE} stroke="none" />;
}

const HEAD = <circle cx="32" cy="12" r="5.5" fill={STROKE} stroke="none" />;
const HEAD_AT = (cx: number, cy: number) => <circle cx={cx} cy={cy} r="5.5" fill={STROKE} stroke="none" />;

const POSES: Record<string, React.ReactNode> = {
  // horizontal press (bench press family)
  bench_press: (
    <Figure>
      {HEAD}
      <path d="M18 33h28" />{/* bench */}
      <path d="M21 33 L21 40" />
      <path d="M43 33 L43 40" />
      <B d="M22 20 L22 30" />
      <B d="M42 20 L42 30" />
      <path d="M14 20 L50 20" />{/* bar */}
      <Plate cx={16} cy={20} /><Plate cx={48} cy={20} />
      <B d="M27 19 L27 30 M37 19 L37 30" />
    </Figure>
  ),
  // vertical press (overhead press family)
  overhead_press: (
    <Figure>
      {HEAD}
      <B d="M32 17 L32 44" />
      <B d="M32 26 L20 14 M32 26 L44 14" />
      <path d="M13 14 L51 14" />
      <Plate cx={14} cy={14} /><Plate cx={50} cy={14} />
      <B d="M32 44 L24 58 M32 44 L40 58" />
    </Figure>
  ),
  incline_press: (
    <Figure>
      {HEAD_AT(20, 20)}
      <path d="M16 26 L44 12" />{/* incline bench */}
      <B d="M20 25 L20 34" />
      <B d="M40 15 L40 26" />
      <path d="M18 24 L46 10" />{/* bar path */}
      <Plate cx={19} cy={24} /><Plate cx={45} cy={11} />
      <B d="M25 21 L25 32 M35 15 L35 26" />
    </Figure>
  ),
  pushup: (
    <Figure>
      {HEAD_AT(24, 16)}
      <B d="M27 18 L52 40" />
      <B d="M27 18 L14 28" />
      <path d="M18 24 L14 28 L18 32" />
      <path d="M48 36 L52 40 L48 44" />
    </Figure>
  ),
  dip: (
    <Figure>
      {HEAD}
      <B d="M32 17 L32 38" />
      <path d="M20 18 L20 44 M44 18 L44 44" />{/* parallel bars */}
      <B d="M32 24 L20 30 M32 24 L44 30" />
      <B d="M32 38 L26 54 M32 38 L38 54" />
    </Figure>
  ),
  close_grip_bench: (
    <Figure>
      {HEAD}
      <path d="M18 33h28" />
      <path d="M21 33 L21 40" /><path d="M43 33 L43 40" />
      <B d="M29 21 L29 30 M35 21 L35 30" />
      <path d="M16 21 L48 21" />
      <Plate cx={17} cy={21} /><Plate cx={47} cy={21} />
    </Figure>
  ),
  // rows
  row: (
    <Figure>
      {HEAD}
      <B d="M32 17 L32 34 L26 50" />
      <B d="M32 34 L44 50" />
      <B d="M32 24 L14 30" />
      <path d="M14 26 L10 30 L14 34" />
    </Figure>
  ),
  shrug_row: (
    <Figure>
      {HEAD}
      <B d="M32 17 L32 34 L26 50" />
      <B d="M32 34 L44 50" />
      <path d="M20 20 L44 20" />
      <Plate cx={20} cy={20} /><Plate cx={44} cy={20} />
      <B d="M22 20 L18 26 M42 20 L46 26" />
    </Figure>
  ),
  shrug: (
    <Figure>
      {HEAD}
      <B d="M32 17 L32 44 L26 58 M32 44 L38 58" />
      <B d="M18 28 L18 40 M46 28 L46 40" />
      <path d="M14 28 L22 28 M42 28 L50 28" />
      <Plate cx={14} cy={28} /><Plate cx={50} cy={28} />
    </Figure>
  ),
  pullover: (
    <Figure>
      {HEAD}
      <path d="M18 30h28" />{/* bench */}
      <B d="M22 20 L22 30" /><B d="M42 20 L42 30" />
      <path d="M16 14 L48 14" />
      <Plate cx={17} cy={14} /><Plate cx={47} cy={14} />
      <B d="M32 14 L32 22" />
    </Figure>
  ),
  straight_arm_pulldown: (
    <Figure>
      {HEAD}
      <B d="M32 17 L32 44 L26 58 M32 44 L38 58" />
      <path d="M20 16 L44 16" />
      <B d="M20 16 L26 30 M44 16 L38 30" />
    </Figure>
  ),
  // pull-down / pull-up
  pulldown: (
    <Figure>
      {HEAD}
      <B d="M32 17 L32 44" />
      <path d="M18 12 L46 12" />
      <B d="M18 12 L26 26 M46 12 L38 26" />
      <B d="M32 44 L26 58 M32 44 L38 58" />
    </Figure>
  ),
  pullup: (
    <Figure>
      <path d="M12 12 L52 12" />{/* bar */}
      {HEAD_AT(32, 20)}
      <B d="M32 25 L24 14 M32 25 L40 14" />
      <B d="M32 25 L32 40" />
      <B d="M32 40 L25 52 M32 40 L39 52" />
    </Figure>
  ),
  // hinge (deadlift / RDL / good morning)
  hinge: (
    <Figure>
      {HEAD_AT(20, 20)}
      <B d="M20 25 L38 34" />
      <B d="M38 34 L38 52" />
      <B d="M38 34 L48 30" />
      <B d="M20 25 L14 44" />
      <path d="M4 44 L28 44" />
      <Plate cx={6} cy={44} /><Plate cx={26} cy={44} />
    </Figure>
  ),
  // squat family
  squat: (
    <Figure>
      {HEAD}
      <B d="M32 17 L32 32" />
      <path d="M16 20 L48 20" />
      <Plate cx={17} cy={20} /><Plate cx={47} cy={20} />
      <B d="M32 32 L22 40 L22 54" />
      <B d="M32 32 L42 40 L42 54" />
    </Figure>
  ),
  split_squat: (
    <Figure>
      {HEAD}
      <B d="M32 17 L32 32" />
      <B d="M22 22 L22 32 M42 22 L42 32" />
      <B d="M32 32 L24 44 L24 56" />
      <B d="M32 32 L42 40 L48 34" />
    </Figure>
  ),
  lunge: (
    <Figure>
      {HEAD}
      <B d="M32 17 L30 34" />
      <B d="M30 34 L18 44 L14 56" />
      <B d="M30 34 L42 40 L46 54" />
      <B d="M22 24 L38 20" />
    </Figure>
  ),
  lateral_squat: (
    <Figure>
      {HEAD}
      <B d="M32 17 L30 30" />
      <B d="M30 30 L14 40" />
      <B d="M30 30 L44 48" />
      <B d="M20 24 L40 22" />
    </Figure>
  ),
  sissy_squat: (
    <Figure>
      {HEAD}
      <B d="M32 17 L26 34" />
      <B d="M26 34 L38 46" />
      <B d="M38 46 L38 58" />
      <B d="M26 34 L20 50 L28 56" />
    </Figure>
  ),
  sled: (
    <Figure>
      {HEAD_AT(30, 17)}
      <B d="M30 20 L44 30" />
      <path d="M44 30 L54 30 L54 40 L44 40 Z" />
      <B d="M30 20 L18 30 L14 44" />
      <B d="M44 30 L36 42 L40 54" />
    </Figure>
  ),
  leg_press: (
    <Figure>
      <path d="M8 44 L56 44" />
      {HEAD_AT(20, 34)}
      <B d="M20 39 L20 50" />
      <B d="M20 44 L36 34 L48 34" />
      <path d="M48 26 L48 42" />
      <Plate cx={48} cy={24} />
    </Figure>
  ),
  leg_extension: (
    <Figure>
      <path d="M10 20 L10 50" />
      {HEAD_AT(20, 26)}
      <B d="M20 31 L20 44 L36 44" />
      <B d="M36 44 L46 34" />
      <path d="M46 30 L46 40" />
    </Figure>
  ),
  leg_curl: (
    <Figure>
      <path d="M8 44 L54 44" />
      {HEAD_AT(20, 34)}
      <B d="M20 39 L20 44 L38 44" />
      <B d="M38 44 L48 34" />
      <path d="M46 30 L50 34 L46 38" />
    </Figure>
  ),
  back_extension: (
    <Figure>
      {HEAD}
      <B d="M32 17 L32 30" />
      <path d="M20 34 L44 34" />
      <B d="M32 30 L20 34" />
      <B d="M32 30 L44 40 L44 54" />
    </Figure>
  ),
  hip_thrust: (
    <Figure>
      <path d="M10 40 L54 40" />
      {HEAD_AT(16, 24)}
      <B d="M16 29 L16 40" />
      <B d="M16 40 L34 40" />
      <B d="M34 40 L44 30" />
      <B d="M34 40 L44 48" />
      <Plate cx={44} cy={20} />
    </Figure>
  ),
  glute_kickback: (
    <Figure>
      {HEAD}
      <B d="M32 17 L32 32" />
      <B d="M20 40 L32 32 L44 40" />
      <B d="M32 32 L38 34" />
      <B d="M38 34 L48 30" />
    </Figure>
  ),
  hip_abduction: (
    <Figure>
      {HEAD}
      <B d="M32 17 L32 34" />
      <B d="M32 34 L20 48 M32 34 L44 48" />
      <path d="M20 30 L44 30" />
    </Figure>
  ),
  // curls
  curl: (
    <Figure>
      {HEAD}
      <B d="M32 17 L32 40 L26 54" />
      <B d="M32 40 L44 54" />
      <B d="M32 26 L24 34 L30 40" />
      <Plate cx={22} cy={33} />
    </Figure>
  ),
  // extensions / triceps
  triceps_extension: (
    <Figure>
      {HEAD}
      <B d="M32 17 L32 40 L26 54" />
      <B d="M32 40 L38 54" />
      <path d="M20 16 L44 16" />
      <Plate cx={21} cy={16} /><Plate cx={43} cy={16} />
      <B d="M22 16 L26 28 M42 16 L38 28" />
    </Figure>
  ),
  // shoulders isolation
  lateral_raise: (
    <Figure>
      {HEAD}
      <B d="M32 17 L32 44 L26 58 M32 44 L38 58" />
      <B d="M32 24 L16 20 M32 24 L48 20" />
    </Figure>
  ),
  front_raise: (
    <Figure>
      {HEAD}
      <B d="M32 17 L32 44 L26 58 M32 44 L38 58" />
      <B d="M32 24 L20 14 M32 24 L44 14" />
    </Figure>
  ),
  upright_row: (
    <Figure>
      {HEAD}
      <B d="M32 17 L32 44 L26 58 M32 44 L38 58" />
      <B d="M32 20 L32 34" />
      <path d="M25 22 L39 22" />
      <Plate cx={25} cy={22} /><Plate cx={39} cy={22} />
    </Figure>
  ),
  rear_delt_fly: (
    <Figure>
      {HEAD_AT(32, 26)}
      <B d="M32 30 L32 44 L26 58 M32 44 L38 58" />
      <B d="M32 22 L16 26 M32 22 L48 26" />
    </Figure>
  ),
  landmine_press: (
    <Figure>
      {HEAD}
      <B d="M32 17 L32 40" />
      <path d="M14 54 L44 20" />
      <Plate cx={17} cy={51} />
      <B d="M32 26 L40 20" />
      <B d="M32 40 L26 54 M32 40 L38 54" />
    </Figure>
  ),
  fly: (
    <Figure>
      {HEAD}
      <path d="M18 32h28" />
      <B d="M22 20 L22 32" /><B d="M42 20 L42 32" />
      <B d="M16 18 L22 22 M48 18 L42 22" />
    </Figure>
  ),
  face_pull: (
    <Figure>
      {HEAD}
      <B d="M32 17 L32 44 L26 58 M32 44 L38 58" />
      <B d="M32 22 L18 24 M32 22 L46 24" />
      <path d="M18 24 L14 20 M46 24 L50 20" />
    </Figure>
  ),
  // calves
  calf_raise: (
    <Figure>
      {HEAD}
      <B d="M32 17 L32 40" />
      <B d="M32 40 L28 56" />
      <path d="M22 58 L34 58" />
      <B d="M28 50 L28 56" />
    </Figure>
  ),
  // core
  plank: (
    <Figure>
      {HEAD_AT(24, 16)}
      <B d="M27 18 L54 30" />
      <B d="M27 18 L16 22" />
      <path d="M50 26 L54 30 L50 34" />
    </Figure>
  ),
  leg_raise: (
    <Figure>
      <path d="M12 12 L52 12" />
      {HEAD_AT(32, 20)}
      <B d="M32 25 L32 40" />
      <B d="M32 40 L44 28 M32 40 L20 28" />
    </Figure>
  ),
  crunch: (
    <Figure>
      {HEAD_AT(20, 24)}
      <B d="M22 30 Q32 40 42 30" />
      <B d="M22 30 L14 24" />
      <B d="M42 30 L48 44" />
    </Figure>
  ),
  rollout: (
    <Figure>
      {HEAD_AT(24, 16)}
      <B d="M28 20 L44 40" />
      <circle cx="48" cy="44" r="4.5" />
      <B d="M28 20 L18 30 L18 44" />
    </Figure>
  ),
  twist: (
    <Figure>
      {HEAD}
      <B d="M32 17 L32 40" />
      <B d="M20 44 L32 40 L44 44" />
      <path d="M20 24 L44 30" />
    </Figure>
  ),
  situp: (
    <Figure>
      {HEAD_AT(20, 22)}
      <B d="M20 24 Q32 8 42 20" />
      <B d="M20 24 L14 42" />
      <B d="M42 20 L48 42" />
    </Figure>
  ),
  anti_rotation: (
    <Figure>
      {HEAD}
      <B d="M32 17 L32 44 L26 58 M32 44 L38 58" />
      <B d="M32 26 L48 26" />
      <path d="M44 22 L48 26 L44 30" />
    </Figure>
  ),
  carry: (
    <Figure>
      {HEAD}
      <B d="M32 17 L32 44 L26 58 M32 44 L38 58" />
      <B d="M20 26 L20 40 M44 26 L44 40" />
      <path d="M32 24 L20 26 M32 24 L44 26" />
      <Plate cx={20} cy={41} /><Plate cx={44} cy={41} />
    </Figure>
  )
};

const FALLBACK = (
  <Figure>
    <circle cx="20" cy="20" r="8" fill={STROKE} opacity={0.85} />
    <circle cx="44" cy="20" r="8" fill={STROKE} opacity={0.85} />
    <path d="M28 20 L36 20" strokeWidth={4} />
  </Figure>
);

export function ExerciseIcon({ pattern, style, className }: { pattern: string; style?: CSSProperties; className?: string }) {
  return (
    <div className={className} style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', ...style }}>
      {POSES[pattern] ?? FALLBACK}
    </div>
  );
}
