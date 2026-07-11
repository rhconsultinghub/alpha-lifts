// Exercise ids with a bundled reference photo in public/exercise-photos/{id}.jpg — sourced from
// free-exercise-db (github.com/yuhonas/free-exercise-db, public domain/Unlicense). Every exercise
// falls into one of three groups:
//  1. The 67 exercises imported from that same source (see exercises.ts) — one photo each,
//     downloaded alongside the exercise data itself.
//  2. The original ~90 hand-curated exercises — matched afterward by name/muscle against the
//     free-exercise-db catalog (not every one had a match; see the gap below).
//  3. Anything with no reasonable match in that catalog (mostly niche/coined variant names like
//     "Kelso Shrug" or "Larsen Press" that don't exist there), plus any custom user-created
//     exercise — these fall back to the hand-drawn SVG pictogram in ExerciseIcon instead of
//     getting a mismatched or misleading photo.
export const EXERCISE_PHOTO_IDS = new Set([
  'ab_rollout', 'ab_rollout_on_knees', 'alternate_bicep_curl', 'alternate_hammer_curl',
  'alternating_floor_press', 'alternating_press', 'alternating_renegade_row', 'alternating_shoulder_press',
  'anti_gravity_press', 'bench_press_medium_grip', 'bench_press_with_neutral_grip', 'bent_arm_pullover',
  'bent_over_one_arm_long_bar_row', 'bent_over_row', 'bent_over_two_arm_long_bar_row', 'bent_over_two_dumbbell_row',
  'bent_over_two_dumbbell_row_with_palms_in', 'bent_press', 'bicep_curl', 'box_squat_with_chains',
  'calf_press', 'calf_raise_machine', 'chair_squat', 'chest_press', 'clean_and_press', 'clock_push_up',
  'close_grip_front_lat_pulldown', 'cross_body_crunch', 'cuban_press', 'decline_flyes', 'decline_oblique_crunch',
  'decline_press', 'decline_reverse_crunch', 'double_push_press', 'drag_curl', 'elevated_back_lunge',
  'extended_range_one_arm_floor_press', 'flyes', 'freehand_jump_squat', 'front_squat_clean_grip',
  'front_squat_to_a_bench', 'glute_kickback', 'high_curls', 'jackknife_sit_up', 'lunge_pass_through',
  'lying_leg_curls', 'one_arm_row', 'one_arm_upright_row', 'one_legged_deadlift', 'one_legged_kickback',
  'palms_down_wrist_curl_over_a_bench', 'palms_up_wrist_curl_over_a_bench', 'pistol_squat', 'press_sit_up',
  'reverse_calf_raises', 'reverse_crunch', 'reverse_curl', 'reverse_flyes', 'rocking_standing_calf_raise',
  'seated_one_leg_calf_raise', 'seated_palms_down_wrist_curl', 'seated_press', 'single_leg_glute_bridge',
  'squat', 'squat_to_a_bench', 'standing_leg_curl', 'stiff_legged_deadlift',
  // matched from the original hand-curated exercises
  'ab_wheel_rollout', 'arnold_press', 'back_extension', 'back_squat', 'barbell_curl', 'barbell_row',
  'barbell_shrug', 'behind_neck_press', 'bench_press', 'cable_crunch', 'cable_curl', 'cable_fly',
  'cable_kickback', 'cable_pullover', 'calf_raise', 'chinup', 'close_grip_bench', 'db_shoulder_press',
  'deadlift', 'decline_bench_press', 'deficit_deadlift', 'dip', 'dumbbell_row', 'face_pull',
  'farmers_carry', 'front_raise', 'front_squat', 'glute_bridge', 'good_morning', 'hack_squat',
  'hammer_curl', 'hanging_leg_raise', 'hip_thrust', 'incline_curl', 'incline_db_press', 'jm_press',
  'lat_pulldown', 'lateral_raise', 'leg_curl', 'leg_extension', 'leg_press', 'machine_shoulder_press',
  'overhead_press', 'overhead_triceps_ext', 'pallof_press', 'plank', 'preacher_curl', 'pullup',
  'pushup', 'rdl', 'rear_delt_fly', 'reverse_hyper', 'russian_twist', 'seated_calf_raise',
  'seated_leg_curl', 'seated_row', 'single_arm_row', 'sissy_squat', 'situp', 'skull_crusher',
  'sled_push', 'snatch_grip_deadlift', 'spider_curl', 'straight_arm_pulldown', 'tbar_row',
  'triceps_pushdown', 'upright_row', 'walking_lunge', 'zercher_squat', 'zottman_curl'
]);

export function exercisePhotoUrl(id: string): string | null {
  return EXERCISE_PHOTO_IDS.has(id) ? `${import.meta.env.BASE_URL}exercise-photos/${id}.jpg` : null;
}
