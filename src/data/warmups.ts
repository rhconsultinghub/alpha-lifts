import type { Muscle } from './types';

export interface WarmupMove {
  id: string;
  name: string;
  cue: string;
  muscles: Muscle[];
}

// Simple, equipment-free movements used to prep whichever muscles a training day targets —
// not part of the tracked program, purely a suggested pre-workout routine.
export const WARMUP_LIBRARY: WarmupMove[] = [
  { id: 'arm_circles', name: 'Arm Circles', cue: '20 sec each direction', muscles: ['Shoulders', 'Rear Delts'] },
  { id: 'band_pull_apart', name: 'Band Pull-Aparts (or empty-hand)', cue: '15 reps', muscles: ['Rear Delts', 'Back', 'Shoulders'] },
  { id: 'cat_cow', name: 'Cat-Cow', cue: '10 slow reps', muscles: ['Back', 'Core'] },
  { id: 'scap_pushup', name: 'Scapular Push-Ups', cue: '10 reps', muscles: ['Chest', 'Back', 'Shoulders'] },
  { id: 'pushup_to_downdog', name: 'Push-Up to Down Dog', cue: '8 reps', muscles: ['Chest', 'Shoulders', 'Triceps', 'Core'] },
  { id: 'light_curls', name: 'Light Band or Empty-Bar Curls', cue: '15 reps', muscles: ['Biceps'] },
  { id: 'triceps_stretch', name: 'Overhead Triceps Stretch', cue: '20 sec each side', muscles: ['Triceps'] },
  { id: 'torso_twist', name: 'Standing Torso Twists', cue: '20 reps', muscles: ['Core'] },
  { id: 'bodyweight_squat', name: 'Bodyweight Squats', cue: '15 reps', muscles: ['Quads', 'Glutes', 'Hamstrings'] },
  { id: 'leg_swings', name: 'Leg Swings', cue: '10 each leg', muscles: ['Hamstrings', 'Quads', 'Glutes'] },
  { id: 'walking_lunge', name: 'Walking Lunges', cue: '10 each leg', muscles: ['Quads', 'Glutes', 'Hamstrings'] },
  { id: 'glute_bridge', name: 'Glute Bridges', cue: '15 reps', muscles: ['Glutes', 'Hamstrings', 'Core'] },
  { id: 'ankle_bounce', name: 'Ankle Bounces', cue: '30 sec', muscles: ['Calves'] },
  { id: 'worlds_greatest_stretch', name: "World's Greatest Stretch", cue: '5 each side', muscles: ['Quads', 'Hamstrings', 'Glutes', 'Core'] },
  { id: 'jumping_jacks', name: 'Jumping Jacks', cue: '30 sec', muscles: ['Calves', 'Shoulders'] }
];
