import type { ExerciseDef, EquipOption, Muscle, TrainingType } from './types';

// weekly, per-muscle set targets at "progressive overload" baseline (moderate effort, ~1-3 reps
// in reserve most sets) — roughly the commonly-cited MEV-to-MAV hypertrophy volume zone per
// muscle per week (e.g. Renaissance Periodization volume landmarks, Schoenfeld volume meta-analyses).
export const MUSCLE_TARGETS: Record<Muscle, number> = {
  'Back': 16, 'Biceps': 10, 'Rear Delts': 8, 'Chest': 12, 'Triceps': 8, 'Shoulders': 10,
  'Quads': 14, 'Hamstrings': 10, 'Glutes': 10, 'Calves': 12, 'Core': 10
};

// multiplier applied to the baseline above per training style:
//  - Strength (low reps near 1RM, not to failure): load does the work, less volume needed.
//  - High Intensity/Failure (Mentzer/HIT-style, every set to true failure): far less volume needed,
//    and recovery cost is much higher, so weekly tolerance drops a lot.
//  - Endurance (higher reps, submaximal, rarely to failure): needs more total sets to add up.
//  - General/maintenance: well under MAV is enough to hold on to gains without progressing hard.
export const TRAINING_MULT: Record<TrainingType, number> = {
  progressive_overload: 1, strength: 0.6, hit: 0.4, endurance: 1.3, general: 0.6
};

export const TRAINING_LABELS: Record<TrainingType, string> = {
  progressive_overload: 'Progressive Overload', strength: 'Strength', hit: 'High Intensity (Failure)',
  endurance: 'Endurance', general: 'General Fitness'
};

export const TRAINING_TYPE_DESCS: Record<TrainingType, string> = {
  progressive_overload: 'Steadily add weight or reps most sessions, 1-3 reps shy of failure. Standard weekly volume per muscle.',
  strength: 'Low reps near your max, not to failure (e.g. 5/3/1-style). Load does the work — needs less weekly volume.',
  hit: 'Every set taken to true failure (Mentzer/HIT-style). Each set is so taxing you need far less weekly volume and more recovery time.',
  endurance: 'Higher reps, lighter loads, rarely to failure. Needs more total weekly volume to add up to a stimulus.',
  general: 'Balanced, moderate effort for maintenance. Well under max volume is enough to hold onto gains.'
};

// default rep count used when an exercise is newly added to a program — pulled toward the
// active training plan's typical rep style rather than always defaulting to the top of range.
export function planRepDefault(trainingType: TrainingType, lib: ExerciseDef): number {
  const mid = Math.round((lib.repLo + lib.repHi) / 2);
  switch (trainingType) {
    case 'strength': return lib.repLo;
    case 'hit': return Math.max(lib.repLo, mid - 1);
    case 'endurance': return lib.repHi + 3;
    case 'general': return mid;
    default: return lib.repHi; // progressive_overload
  }
}

type RawExLib = Record<string, Omit<ExerciseDef, 'secondary'>>;

// restBase (seconds) reflects load + joints/muscles involved + systemic fatigue cost:
// heavy multi-joint barbell lifts rest longest, moderate compound machine/cable work less,
// small single-joint isolation work needs the least recovery between sets.
const RAW_EXLIB: RawExLib = {
  deadlift: { name: 'Barbell Deadlift', muscle: 'Back', compound: true, restBase: 180, pattern: 'hinge', equip: [{ v: 'barbell', label: 'Barbell' }, { v: 'smith', label: 'Smith Machine' }, { v: 'trapbar', label: 'Trap Bar' }], repLo: 6, repHi: 8, cue: 'Hinge at the hips, keep the bar close to your shins, and drive through the floor while keeping your spine neutral.' },
  lat_pulldown: { name: 'Lat Pulldown', muscle: 'Back', compound: true, restBase: 90, pattern: 'pulldown', equip: [{ v: 'machine', label: 'Machine' }, { v: 'cable', label: 'Cable' }], repLo: 10, repHi: 12, cue: 'Pull your elbows down and back, squeezing your shoulder blades together at the bottom of each rep.' },
  seated_row: { name: 'Seated Cable Row', muscle: 'Back', compound: true, restBase: 90, pattern: 'row', equip: [{ v: 'cable', label: 'Cable' }, { v: 'machine', label: 'Machine' }], repLo: 10, repHi: 12, cue: 'Row to your belly button, keep your chest tall, and avoid leaning back to cheat the weight.' },
  barbell_row: { name: 'Barbell Row', muscle: 'Back', compound: true, restBase: 100, pattern: 'row', equip: [{ v: 'barbell', label: 'Barbell' }], repLo: 8, repHi: 10, cue: 'Hinge forward with a flat back, row the bar to your lower ribs, and control the descent.' },
  dumbbell_row: { name: 'Dumbbell Row', muscle: 'Back', compound: true, restBase: 90, pattern: 'row', equip: [{ v: 'dumbbell', label: 'Dumbbell' }], repLo: 10, repHi: 12, cue: 'Brace on a bench, row your elbow straight back, and avoid rotating your torso.' },
  barbell_curl: { name: 'Barbell Curl', muscle: 'Biceps', compound: false, restBase: 60, pattern: 'curl', equip: [{ v: 'barbell', label: 'Barbell' }, { v: 'dumbbell', label: 'Dumbbell' }, { v: 'ezbar', label: 'EZ-Bar' }], repLo: 10, repHi: 12, cue: 'Keep your elbows pinned to your sides and control the lowering phase — don’t let momentum do the work.' },
  face_pull: { name: 'Face Pull', muscle: 'Rear Delts', compound: false, restBase: 60, pattern: 'face_pull', equip: [{ v: 'cable', label: 'Cable' }, { v: 'band', label: 'Band' }], repLo: 12, repHi: 15, cue: 'Pull to eye level and rotate your shoulders back at the finish to target the rear delts and rotator cuff.' },
  bench_press: { name: 'Bench Press', muscle: 'Chest', compound: true, restBase: 120, pattern: 'bench_press', equip: [{ v: 'barbell', label: 'Barbell' }, { v: 'dumbbell', label: 'Dumbbell' }, { v: 'smith', label: 'Smith Machine' }], repLo: 6, repHi: 8, cue: 'Lower the bar to mid-chest with elbows around 45°, then drive up and slightly back over your face.' },
  overhead_press: { name: 'Overhead Press', muscle: 'Shoulders', compound: true, restBase: 105, pattern: 'overhead_press', equip: [{ v: 'barbell', label: 'Barbell' }, { v: 'dumbbell', label: 'Dumbbell' }, { v: 'smith', label: 'Smith Machine' }], repLo: 8, repHi: 10, cue: 'Brace your core, press straight overhead, and avoid flaring your ribs up as the weight passes your face.' },
  incline_db_press: { name: 'Incline DB Press', muscle: 'Chest', compound: true, restBase: 100, pattern: 'incline_press', equip: [{ v: 'dumbbell', label: 'Dumbbell' }, { v: 'smith', label: 'Smith Machine' }], repLo: 10, repHi: 12, cue: 'Set the bench to about 30°, press up and slightly inward, and control the stretch at the bottom.' },
  triceps_pushdown: { name: 'Triceps Pushdown', muscle: 'Triceps', compound: false, restBase: 60, pattern: 'triceps_extension', equip: [{ v: 'cable', label: 'Cable' }, { v: 'machine', label: 'Machine' }], repLo: 10, repHi: 12, cue: 'Keep your elbows locked at your sides and fully extend at the bottom of every rep.' },
  lateral_raise: { name: 'Lateral Raise', muscle: 'Shoulders', compound: false, restBase: 60, pattern: 'lateral_raise', equip: [{ v: 'dumbbell', label: 'Dumbbell' }, { v: 'cable', label: 'Cable' }, { v: 'machine', label: 'Machine' }], repLo: 12, repHi: 15, cue: 'Lead with your elbows and raise to shoulder height without swinging or shrugging.' },
  back_squat: { name: 'Back Squat', muscle: 'Quads', compound: true, restBase: 150, pattern: 'squat', equip: [{ v: 'barbell', label: 'Barbell' }, { v: 'smith', label: 'Smith Machine' }], repLo: 6, repHi: 8, cue: 'Brace hard, break at the hips and knees together, and drive up through your mid-foot.' },
  leg_curl: { name: 'Leg Curl', muscle: 'Hamstrings', compound: false, restBase: 75, pattern: 'leg_curl', equip: [{ v: 'machine', label: 'Machine' }], repLo: 10, repHi: 12, cue: 'Control the eccentric on the way back and avoid letting your hips lift off the pad.' },
  pullup: { name: 'Pull-Up', muscle: 'Back', compound: true, restBase: 100, pattern: 'pullup', equip: [{ v: 'bodyweight', label: 'Bodyweight' }, { v: 'assisted', label: 'Assisted Machine' }], repLo: 8, repHi: 10, cue: 'Lead with your chest and pull your elbows down toward your hips rather than just up.' },
  db_shoulder_press: { name: 'DB Shoulder Press', muscle: 'Shoulders', compound: true, restBase: 90, pattern: 'overhead_press', equip: [{ v: 'dumbbell', label: 'Dumbbell' }, { v: 'machine', label: 'Machine' }], repLo: 10, repHi: 12, cue: 'Press up and slightly inward, keeping your ribcage down to protect your lower back.' },
  cable_fly: { name: 'Cable Fly', muscle: 'Chest', compound: false, restBase: 60, pattern: 'fly', equip: [{ v: 'cable', label: 'Cable' }, { v: 'machine', label: 'Machine' }], repLo: 12, repHi: 15, cue: 'Keep a slight bend in your elbows and squeeze your hands together at the midline.' },
  hammer_curl: { name: 'Hammer Curl', muscle: 'Biceps', compound: false, restBase: 60, pattern: 'curl', equip: [{ v: 'dumbbell', label: 'Dumbbell' }], repLo: 10, repHi: 12, cue: 'Use a neutral grip, control the negative, and avoid swinging the weight up.' },
  rdl: { name: 'Romanian Deadlift', muscle: 'Hamstrings', compound: true, restBase: 120, pattern: 'hinge', equip: [{ v: 'barbell', label: 'Barbell' }, { v: 'dumbbell', label: 'Dumbbell' }], repLo: 8, repHi: 10, cue: 'Push your hips back with soft knees until you feel a deep hamstring stretch, then drive back up.' },
  leg_press: { name: 'Leg Press', muscle: 'Quads', compound: true, restBase: 100, pattern: 'leg_press', equip: [{ v: 'machine', label: 'Machine' }], repLo: 10, repHi: 12, cue: 'Feet shoulder width on the platform, and avoid locking your knees out fully at the top.' },
  hip_thrust: { name: 'Hip Thrust', muscle: 'Glutes', compound: true, restBase: 90, pattern: 'hip_thrust', equip: [{ v: 'barbell', label: 'Barbell' }, { v: 'machine', label: 'Machine' }], repLo: 10, repHi: 12, cue: 'Drive through your heels and squeeze your glutes hard at the top of every rep.' },
  calf_raise: { name: 'Standing Calf Raise', muscle: 'Calves', compound: false, restBase: 60, pattern: 'calf_raise', equip: [{ v: 'machine', label: 'Machine' }, { v: 'dumbbell', label: 'Dumbbell' }, { v: 'bodyweight', label: 'Bodyweight' }], repLo: 12, repHi: 15, cue: 'Get a full stretch at the bottom and pause briefly at the top of each rep.' },
  seated_calf_raise: { name: 'Seated Calf Raise', muscle: 'Calves', compound: false, restBase: 60, pattern: 'calf_raise', equip: [{ v: 'machine', label: 'Machine' }], repLo: 12, repHi: 15, cue: 'Pause at full stretch and drive through the balls of your feet, isolating the soleus.' },

  decline_bench_press: { name: 'Decline Bench Press', muscle: 'Chest', compound: true, restBase: 110, pattern: 'bench_press', equip: [{ v: 'barbell', label: 'Barbell' }, { v: 'dumbbell', label: 'Dumbbell' }, { v: 'smith', label: 'Smith Machine' }], repLo: 8, repHi: 10, cue: 'Lower to your lower chest and drive up and slightly back, keeping your shoulder blades pinned.' },
  pushup: { name: 'Push-Up', muscle: 'Chest', compound: true, restBase: 60, pattern: 'pushup', equip: [{ v: 'bodyweight', label: 'Bodyweight' }], repLo: 12, repHi: 20, cue: 'Keep your body in a straight line and lower until your chest nearly touches the floor.' },
  pec_deck: { name: 'Pec Deck', muscle: 'Chest', compound: false, restBase: 60, pattern: 'fly', equip: [{ v: 'machine', label: 'Machine' }], repLo: 12, repHi: 15, cue: 'Bring your elbows together in a hugging motion and squeeze at the midline.' },
  dip: { name: 'Dip', muscle: 'Chest', compound: true, restBase: 90, pattern: 'dip', equip: [{ v: 'bodyweight', label: 'Bodyweight' }, { v: 'assisted', label: 'Assisted Machine' }], repLo: 8, repHi: 12, cue: 'Lean forward and lower until your shoulders are level with your elbows, then press back up.' },

  chest_supported_row: { name: 'Chest-Supported Row', muscle: 'Back', compound: true, restBase: 90, pattern: 'row', equip: [{ v: 'dumbbell', label: 'Dumbbell' }, { v: 'machine', label: 'Machine' }], repLo: 10, repHi: 12, cue: 'Brace your chest on the pad and row your elbows back without using momentum.' },
  tbar_row: { name: 'T-Bar Row', muscle: 'Back', compound: true, restBase: 100, pattern: 'row', equip: [{ v: 'barbell', label: 'Barbell' }, { v: 'machine', label: 'Machine' }], repLo: 8, repHi: 10, cue: 'Hinge forward with a flat back and row the handle to your sternum.' },
  single_arm_row: { name: 'Single-Arm Dumbbell Row', muscle: 'Back', compound: true, restBase: 75, pattern: 'row', equip: [{ v: 'dumbbell', label: 'Dumbbell' }], repLo: 10, repHi: 12, cue: 'Brace on a bench, row your elbow straight back, and avoid twisting your torso.' },
  straight_arm_pulldown: { name: 'Straight-Arm Pulldown', muscle: 'Back', compound: false, restBase: 60, pattern: 'straight_arm_pulldown', equip: [{ v: 'cable', label: 'Cable' }], repLo: 12, repHi: 15, cue: 'Keep your arms straight and pull the bar down in an arc, squeezing your lats.' },
  chinup: { name: 'Chin-Up', muscle: 'Back', compound: true, restBase: 100, pattern: 'pullup', equip: [{ v: 'bodyweight', label: 'Bodyweight' }, { v: 'assisted', label: 'Assisted Machine' }], repLo: 8, repHi: 10, cue: 'Use an underhand grip and pull your chest to the bar, leading with your elbows.' },
  back_extension: { name: 'Back Extension', muscle: 'Hamstrings', compound: true, restBase: 75, pattern: 'back_extension', equip: [{ v: 'bodyweight', label: 'Bodyweight' }, { v: 'machine', label: 'Machine' }], repLo: 12, repHi: 15, cue: 'Hinge at the hips over the pad and squeeze your glutes and hamstrings at the top.' },
  good_morning: { name: 'Good Morning', muscle: 'Hamstrings', compound: true, restBase: 100, pattern: 'hinge', equip: [{ v: 'barbell', label: 'Barbell' }], repLo: 8, repHi: 10, cue: 'Keep a soft bend in your knees and hinge forward until you feel a deep hamstring stretch.' },

  arnold_press: { name: 'Arnold Press', muscle: 'Shoulders', compound: true, restBase: 90, pattern: 'overhead_press', equip: [{ v: 'dumbbell', label: 'Dumbbell' }], repLo: 8, repHi: 10, cue: 'Rotate your palms from facing you to facing forward as you press overhead.' },
  machine_shoulder_press: { name: 'Machine Shoulder Press', muscle: 'Shoulders', compound: true, restBase: 90, pattern: 'overhead_press', equip: [{ v: 'machine', label: 'Machine' }], repLo: 10, repHi: 12, cue: 'Press straight up without arching your lower back off the pad.' },
  front_raise: { name: 'Front Raise', muscle: 'Shoulders', compound: false, restBase: 60, pattern: 'front_raise', equip: [{ v: 'dumbbell', label: 'Dumbbell' }, { v: 'cable', label: 'Cable' }], repLo: 12, repHi: 15, cue: 'Raise to shoulder height with a slight bend in your elbows, without swinging.' },
  upright_row: { name: 'Upright Row', muscle: 'Shoulders', compound: false, restBase: 60, pattern: 'upright_row', equip: [{ v: 'barbell', label: 'Barbell' }, { v: 'cable', label: 'Cable' }], repLo: 10, repHi: 12, cue: 'Lead with your elbows and raise the bar to chest height, keeping it close to your body.' },
  rear_delt_fly: { name: 'Rear Delt Fly', muscle: 'Rear Delts', compound: false, restBase: 60, pattern: 'rear_delt_fly', equip: [{ v: 'dumbbell', label: 'Dumbbell' }, { v: 'machine', label: 'Machine' }, { v: 'cable', label: 'Cable' }], repLo: 12, repHi: 15, cue: 'Keep a slight bend in your elbows and squeeze your shoulder blades together.' },

  incline_curl: { name: 'Incline Dumbbell Curl', muscle: 'Biceps', compound: false, restBase: 60, pattern: 'curl', equip: [{ v: 'dumbbell', label: 'Dumbbell' }], repLo: 10, repHi: 12, cue: 'Let your arms hang straight down for a deep stretch, then curl without swinging your shoulders.' },
  cable_curl: { name: 'Cable Curl', muscle: 'Biceps', compound: false, restBase: 60, pattern: 'curl', equip: [{ v: 'cable', label: 'Cable' }], repLo: 10, repHi: 12, cue: 'Keep constant tension through the cable and control the negative all the way down.' },
  preacher_curl: { name: 'Preacher Curl', muscle: 'Biceps', compound: false, restBase: 60, pattern: 'curl', equip: [{ v: 'barbell', label: 'Barbell' }, { v: 'dumbbell', label: 'Dumbbell' }, { v: 'ezbar', label: 'EZ-Bar' }], repLo: 10, repHi: 12, cue: 'Rest your arms on the pad and avoid locking out hard at the bottom to protect your elbows.' },

  overhead_triceps_ext: { name: 'Overhead Triceps Extension', muscle: 'Triceps', compound: false, restBase: 60, pattern: 'triceps_extension', equip: [{ v: 'dumbbell', label: 'Dumbbell' }, { v: 'cable', label: 'Cable' }, { v: 'ezbar', label: 'EZ-Bar' }], repLo: 10, repHi: 12, cue: 'Keep your elbows pointed forward and lower the weight behind your head with control.' },
  skull_crusher: { name: 'Skull Crusher', muscle: 'Triceps', compound: false, restBase: 60, pattern: 'triceps_extension', equip: [{ v: 'barbell', label: 'Barbell' }, { v: 'ezbar', label: 'EZ-Bar' }, { v: 'dumbbell', label: 'Dumbbell' }], repLo: 10, repHi: 12, cue: 'Keep your upper arms vertical and lower the bar toward your forehead under control.' },
  close_grip_bench: { name: 'Close-Grip Bench Press', muscle: 'Triceps', compound: true, restBase: 100, pattern: 'close_grip_bench', equip: [{ v: 'barbell', label: 'Barbell' }, { v: 'smith', label: 'Smith Machine' }], repLo: 8, repHi: 10, cue: 'Grip just inside shoulder width and keep your elbows tucked as you press.' },

  front_squat: { name: 'Front Squat', muscle: 'Quads', compound: true, restBase: 150, pattern: 'squat', equip: [{ v: 'barbell', label: 'Barbell' }, { v: 'smith', label: 'Smith Machine' }], repLo: 6, repHi: 8, cue: 'Keep your elbows high and torso upright, and sit straight down between your hips.' },
  hack_squat: { name: 'Hack Squat', muscle: 'Quads', compound: true, restBase: 120, pattern: 'squat', equip: [{ v: 'machine', label: 'Machine' }], repLo: 8, repHi: 10, cue: 'Keep your back flat on the pad and push through your whole foot on the way up.' },
  bulgarian_split_squat: { name: 'Bulgarian Split Squat', muscle: 'Quads', compound: true, restBase: 100, pattern: 'split_squat', equip: [{ v: 'dumbbell', label: 'Dumbbell' }, { v: 'barbell', label: 'Barbell' }], repLo: 10, repHi: 12, cue: 'Rest your rear foot on a bench and drop straight down through your front leg.' },
  walking_lunge: { name: 'Walking Lunge', muscle: 'Quads', compound: true, restBase: 90, pattern: 'lunge', equip: [{ v: 'dumbbell', label: 'Dumbbell' }, { v: 'barbell', label: 'Barbell' }, { v: 'bodyweight', label: 'Bodyweight' }], repLo: 10, repHi: 12, cue: 'Step forward into a deep lunge and drive through your front heel to the next step.' },
  leg_extension: { name: 'Leg Extension', muscle: 'Quads', compound: false, restBase: 75, pattern: 'leg_extension', equip: [{ v: 'machine', label: 'Machine' }], repLo: 12, repHi: 15, cue: 'Extend fully and squeeze your quads at the top without slamming the weight down.' },

  seated_leg_curl: { name: 'Seated Leg Curl', muscle: 'Hamstrings', compound: false, restBase: 75, pattern: 'leg_curl', equip: [{ v: 'machine', label: 'Machine' }], repLo: 10, repHi: 12, cue: 'Curl your heels toward the pad and control the return without letting the weight drop.' },

  glute_bridge: { name: 'Glute Bridge', muscle: 'Glutes', compound: true, restBase: 75, pattern: 'hip_thrust', equip: [{ v: 'bodyweight', label: 'Bodyweight' }, { v: 'barbell', label: 'Barbell' }], repLo: 12, repHi: 15, cue: 'Drive through your heels and squeeze your glutes hard at the top without arching your lower back.' },
  cable_kickback: { name: 'Cable Kickback', muscle: 'Glutes', compound: false, restBase: 60, pattern: 'glute_kickback', equip: [{ v: 'cable', label: 'Cable' }], repLo: 12, repHi: 15, cue: 'Kick straight back and squeeze your glute at the top without swinging your torso.' },
  hip_abduction: { name: 'Hip Abduction Machine', muscle: 'Glutes', compound: false, restBase: 60, pattern: 'hip_abduction', equip: [{ v: 'machine', label: 'Machine' }], repLo: 12, repHi: 15, cue: 'Push your knees outward against the pads in a slow, controlled motion.' },

  plank: { name: 'Plank', muscle: 'Core', compound: false, restBase: 45, pattern: 'plank', equip: [{ v: 'bodyweight', label: 'Bodyweight' }], repLo: 30, repHi: 60, trackingMode: 'time', cue: 'Keep a straight line from head to heels and brace your core — hold for time, not reps.' },
  hanging_leg_raise: { name: 'Hanging Leg Raise', muscle: 'Core', compound: false, restBase: 60, pattern: 'leg_raise', equip: [{ v: 'bodyweight', label: 'Bodyweight' }], repLo: 10, repHi: 15, cue: 'Curl your pelvis up and avoid swinging — control the descent every rep.' },
  cable_crunch: { name: 'Cable Crunch', muscle: 'Core', compound: false, restBase: 60, pattern: 'crunch', equip: [{ v: 'cable', label: 'Cable' }], repLo: 12, repHi: 15, cue: 'Round your spine and crunch down toward your knees, keeping the weight close to your head.' },
  ab_wheel_rollout: { name: 'Ab Wheel Rollout', muscle: 'Core', compound: false, restBase: 60, pattern: 'rollout', equip: [{ v: 'bodyweight', label: 'Bodyweight' }], repLo: 8, repHi: 12, cue: 'Roll out as far as you can while keeping your core braced and back flat, then pull back in.' },
  russian_twist: { name: 'Russian Twist', muscle: 'Core', compound: false, restBase: 45, pattern: 'twist', equip: [{ v: 'dumbbell', label: 'Dumbbell' }, { v: 'bodyweight', label: 'Bodyweight' }], repLo: 15, repHi: 20, cue: 'Rotate from your torso, not just your arms, and keep your feet lifted for extra difficulty.' },
  situp: { name: 'Sit-Up', muscle: 'Core', compound: false, restBase: 45, pattern: 'situp', equip: [{ v: 'bodyweight', label: 'Bodyweight' }], repLo: 15, repHi: 20, cue: 'Curl up one vertebra at a time and exhale as you reach the top.' },

  kelso_shrug: { name: 'Kelso Shrug', muscle: 'Back', compound: false, restBase: 60, pattern: 'shrug_row', equip: [{ v: 'barbell', label: 'Barbell' }, { v: 'dumbbell', label: 'Dumbbell' }], repLo: 12, repHi: 15, cue: 'Lean into a bench at an angle and shrug your shoulder blades together and down — no arm pull, traps and rear delts only.' },
  barbell_shrug: { name: 'Barbell Shrug', muscle: 'Back', compound: false, restBase: 60, pattern: 'shrug', equip: [{ v: 'barbell', label: 'Barbell' }, { v: 'dumbbell', label: 'Dumbbell' }, { v: 'smith', label: 'Smith Machine' }], repLo: 10, repHi: 15, cue: 'Shrug straight up toward your ears and pause briefly at the top — avoid rolling your shoulders.' },
  pendlay_row: { name: 'Pendlay Row', muscle: 'Back', compound: true, restBase: 100, pattern: 'row', equip: [{ v: 'barbell', label: 'Barbell' }], repLo: 6, repHi: 8, cue: 'Start each rep from a dead stop on the floor, torso parallel to the ground, and pull explosively to your abdomen.' },
  seal_row: { name: 'Seal Row', muscle: 'Back', compound: true, restBase: 90, pattern: 'row', equip: [{ v: 'barbell', label: 'Barbell' }, { v: 'dumbbell', label: 'Dumbbell' }], repLo: 10, repHi: 12, cue: 'Lie face-down on a raised bench and row straight up — momentum and leg drive are impossible by design.' },
  meadows_row: { name: 'Meadows Row', muscle: 'Back', compound: true, restBase: 90, pattern: 'row', equip: [{ v: 'barbell', label: 'Barbell' }], repLo: 10, repHi: 12, cue: 'Grip one end of a landmine-anchored bar and row it toward your hip, rotating your torso slightly for a deep lat squeeze.' },
  cable_pullover: { name: 'Cable Pullover', muscle: 'Back', compound: false, restBase: 60, pattern: 'pullover', equip: [{ v: 'cable', label: 'Cable' }], repLo: 12, repHi: 15, cue: 'Keep your arms nearly straight and pull the bar down and back in an arc, leading with your elbows.' },
  snatch_grip_deadlift: { name: 'Snatch-Grip Deadlift', muscle: 'Back', compound: true, restBase: 180, pattern: 'hinge', equip: [{ v: 'barbell', label: 'Barbell' }], repLo: 5, repHi: 8, cue: 'Take a wide, snatch-width grip to increase range of motion and upper-back demand — keep your hips lower than a normal deadlift.' },
  deficit_deadlift: { name: 'Deficit Deadlift', muscle: 'Back', compound: true, restBase: 180, pattern: 'hinge', equip: [{ v: 'barbell', label: 'Barbell' }], repLo: 5, repHi: 8, cue: 'Stand on a small platform to extend the pull’s range of motion — brace hard, this one’s unforgiving on form.' },

  landmine_press: { name: 'Landmine Press', muscle: 'Shoulders', compound: true, restBase: 90, pattern: 'landmine_press', equip: [{ v: 'barbell', label: 'Barbell' }], repLo: 10, repHi: 12, cue: 'Press the anchored bar up and slightly forward along its natural arc — easy on the shoulder joint.' },
  behind_neck_press: { name: 'Behind-the-Neck Press', muscle: 'Shoulders', compound: true, restBase: 100, pattern: 'overhead_press', equip: [{ v: 'barbell', label: 'Barbell' }], repLo: 8, repHi: 10, cue: 'Lower only to ear level with a grip slightly wider than shoulder width — stop short if you feel any shoulder pinch.' },

  zercher_squat: { name: 'Zercher Squat', muscle: 'Quads', compound: true, restBase: 150, pattern: 'squat', equip: [{ v: 'barbell', label: 'Barbell' }], repLo: 6, repHi: 8, cue: 'Cradle the bar in the crooks of your elbows and squat upright — brutal on the core and upper back.' },
  sissy_squat: { name: 'Sissy Squat', muscle: 'Quads', compound: false, restBase: 60, pattern: 'sissy_squat', equip: [{ v: 'bodyweight', label: 'Bodyweight' }], repLo: 10, repHi: 15, cue: 'Rise onto your toes and lean back from the knees, keeping hips extended — pure quad stretch and burn.' },
  cossack_squat: { name: 'Cossack Squat', muscle: 'Quads', compound: true, restBase: 75, pattern: 'lateral_squat', equip: [{ v: 'bodyweight', label: 'Bodyweight' }, { v: 'dumbbell', label: 'Dumbbell' }], repLo: 10, repHi: 12, cue: 'Shift your weight fully into one deep side lunge, keeping the opposite leg straight with toes up.' },
  sled_push: { name: 'Sled Push', muscle: 'Quads', compound: true, restBase: 90, pattern: 'sled', equip: [{ v: 'machine', label: 'Machine' }], repLo: 1, repHi: 1, cue: 'Drive through your whole foot with short, powerful steps and a forward lean — measured in distance, not reps.' },

  nordic_curl: { name: 'Nordic Curl', muscle: 'Hamstrings', compound: false, restBase: 75, pattern: 'leg_curl', equip: [{ v: 'bodyweight', label: 'Bodyweight' }], repLo: 6, repHi: 10, cue: 'Anchor your ankles and lower yourself forward as slowly as possible, catching yourself with your hands at the bottom.' },
  reverse_hyper: { name: 'Reverse Hyper', muscle: 'Hamstrings', compound: true, restBase: 75, pattern: 'back_extension', equip: [{ v: 'machine', label: 'Machine' }], repLo: 12, repHi: 15, cue: 'Swing your legs up and squeeze your glutes and hamstrings at the top without using momentum to yank the weight.' },

  farmers_carry: { name: 'Farmer’s Carry', muscle: 'Core', compound: true, restBase: 75, pattern: 'carry', equip: [{ v: 'dumbbell', label: 'Dumbbell' }, { v: 'trapbar', label: 'Trap Bar' }], repLo: 1, repHi: 1, cue: 'Stand tall, brace your core, and walk for distance or time without letting your shoulders round forward.' },
  suitcase_carry: { name: 'Suitcase Carry', muscle: 'Core', compound: true, restBase: 60, pattern: 'carry', equip: [{ v: 'dumbbell', label: 'Dumbbell' }], repLo: 1, repHi: 1, cue: 'Carry the weight in one hand and resist leaning — the anti-lateral-flexion challenge is the whole point.' },
  pallof_press: { name: 'Pallof Press', muscle: 'Core', compound: false, restBase: 45, pattern: 'anti_rotation', equip: [{ v: 'cable', label: 'Cable' }, { v: 'band', label: 'Band' }], repLo: 12, repHi: 15, cue: 'Press straight out from your chest and resist the cable’s pull to rotate you — brace like someone might shove the bar.' },
  copenhagen_plank: { name: 'Copenhagen Plank', muscle: 'Core', compound: false, restBase: 60, pattern: 'plank', equip: [{ v: 'bodyweight', label: 'Bodyweight' }], repLo: 20, repHi: 40, trackingMode: 'time', cue: 'Prop your top foot on a bench and hold a side plank off your bottom leg — brutal on the inner thigh and obliques.' },

  spider_curl: { name: 'Spider Curl', muscle: 'Biceps', compound: false, restBase: 60, pattern: 'curl', equip: [{ v: 'dumbbell', label: 'Dumbbell' }, { v: 'ezbar', label: 'EZ-Bar' }], repLo: 10, repHi: 12, cue: 'Lean chest-first over an incline bench so your arms hang straight down, eliminating any shoulder swing.' },
  zottman_curl: { name: 'Zottman Curl', muscle: 'Biceps', compound: false, restBase: 60, pattern: 'curl', equip: [{ v: 'dumbbell', label: 'Dumbbell' }], repLo: 10, repHi: 12, cue: 'Curl up with palms facing up, then rotate palms down before lowering — the twist hits your forearms on the way down.' },

  jm_press: { name: 'JM Press', muscle: 'Triceps', compound: false, restBase: 75, pattern: 'close_grip_bench', equip: [{ v: 'barbell', label: 'Barbell' }, { v: 'ezbar', label: 'EZ-Bar' }], repLo: 8, repHi: 10, cue: 'A hybrid of a close-grip press and skull crusher — lower the bar toward your chin, elbows tucked.' },
  larsen_press: { name: 'Larsen Press', muscle: 'Chest', compound: true, restBase: 110, pattern: 'bench_press', equip: [{ v: 'barbell', label: 'Barbell' }], repLo: 8, repHi: 10, cue: 'Press with your feet up on the bench — no leg drive means your chest and triceps do all the work.' }
};

const SECONDARY: Record<string, Muscle[]> = {
  deadlift: ['Hamstrings', 'Glutes'], lat_pulldown: ['Biceps'], seated_row: ['Biceps'],
  barbell_row: ['Biceps'], dumbbell_row: ['Biceps'],
  barbell_curl: ['Shoulders'], face_pull: ['Shoulders'],
  bench_press: ['Triceps', 'Shoulders'], overhead_press: ['Triceps'], incline_db_press: ['Triceps', 'Shoulders'],
  triceps_pushdown: [], lateral_raise: ['Shoulders'],
  back_squat: ['Glutes', 'Hamstrings'], leg_curl: [], pullup: ['Biceps'],
  db_shoulder_press: ['Triceps'], cable_fly: ['Shoulders'], hammer_curl: [],
  rdl: ['Glutes', 'Back'], leg_press: ['Glutes'], hip_thrust: ['Hamstrings'], calf_raise: [],
  seated_calf_raise: [],
  decline_bench_press: ['Triceps', 'Shoulders'], pushup: ['Triceps', 'Shoulders'], pec_deck: ['Shoulders'], dip: ['Triceps', 'Shoulders'],
  chest_supported_row: ['Biceps'], tbar_row: ['Biceps'], single_arm_row: ['Biceps'], straight_arm_pulldown: [], chinup: ['Biceps'],
  back_extension: ['Glutes', 'Back'], good_morning: ['Glutes', 'Back'],
  arnold_press: ['Triceps'], machine_shoulder_press: ['Triceps'], front_raise: [], upright_row: ['Rear Delts'], rear_delt_fly: ['Shoulders'],
  incline_curl: [], cable_curl: [], preacher_curl: [],
  overhead_triceps_ext: [], skull_crusher: [], close_grip_bench: ['Chest', 'Shoulders'],
  front_squat: ['Glutes'], hack_squat: ['Glutes'], bulgarian_split_squat: ['Glutes', 'Hamstrings'], walking_lunge: ['Glutes', 'Hamstrings'], leg_extension: [],
  seated_leg_curl: [],
  glute_bridge: ['Hamstrings'], cable_kickback: [], hip_abduction: [],
  plank: [], hanging_leg_raise: [], cable_crunch: [], ab_wheel_rollout: [], russian_twist: [], situp: [],
  kelso_shrug: ['Rear Delts'], barbell_shrug: [], pendlay_row: ['Biceps'], seal_row: ['Biceps'], meadows_row: ['Biceps'],
  cable_pullover: ['Triceps'], snatch_grip_deadlift: ['Hamstrings', 'Glutes'], deficit_deadlift: ['Hamstrings', 'Glutes'],
  landmine_press: ['Triceps'], behind_neck_press: ['Triceps'],
  zercher_squat: ['Back', 'Glutes'], sissy_squat: [], cossack_squat: ['Glutes'], sled_push: ['Glutes', 'Calves'],
  nordic_curl: ['Glutes'], reverse_hyper: ['Glutes', 'Back'],
  farmers_carry: ['Shoulders', 'Back'], suitcase_carry: ['Shoulders'], pallof_press: [], copenhagen_plank: [],
  spider_curl: [], zottman_curl: [],
  jm_press: [], larsen_press: ['Triceps', 'Shoulders']
};

export const EXLIB: Record<string, ExerciseDef> = {};
Object.keys(RAW_EXLIB).forEach(id => {
  EXLIB[id] = { ...RAW_EXLIB[id], secondary: SECONDARY[id] || [] };
});

// equipment choices offered when building a custom exercise
export const EQUIP_CATALOG: EquipOption[] = [
  { v: 'barbell', label: 'Barbell' }, { v: 'dumbbell', label: 'Dumbbell' }, { v: 'smith', label: 'Smith Machine' },
  { v: 'cable', label: 'Cable' }, { v: 'machine', label: 'Machine' }, { v: 'ezbar', label: 'EZ-Bar' },
  { v: 'band', label: 'Band' }, { v: 'trapbar', label: 'Trap Bar' }, { v: 'bodyweight', label: 'Bodyweight' },
  { v: 'assisted', label: 'Assisted Machine' }
];

export function incrementForEquip(v: string): number | null {
  if (v === 'barbell' || v === 'smith' || v === 'trapbar') return 2.5;
  if (v === 'dumbbell' || v === 'cable' || v === 'machine' || v === 'ezbar' || v === 'band') return 1;
  return null; // bodyweight / assisted -> rep-based progression
}

export const KG_PER_LB_STEP = 5 / 2.20462; // manual stepper moves a clean 5lb when in lb mode

export const DAY_ORDER = ['push', 'pull', 'legs', 'upper', 'lower'];

// which muscles fit each day's theme — replacement suggestions stay within this set
// so a Push day never gets offered a Glutes exercise, etc.
export const DAY_THEMES: Record<string, Muscle[]> = {
  push: ['Chest', 'Shoulders', 'Triceps'],
  pull: ['Back', 'Biceps', 'Rear Delts'],
  legs: ['Quads', 'Hamstrings', 'Glutes', 'Calves'],
  upper: ['Chest', 'Back', 'Shoulders', 'Biceps', 'Triceps'],
  lower: ['Quads', 'Hamstrings', 'Glutes', 'Calves']
};
