import { useCallback, useEffect, useRef, useState } from 'react';
import { EXLIB, EQUIP_CATALOG, MUSCLE_TARGETS } from '../data/exercises';
import { mkEx, slugify } from '../data/program';
import { createInitialState } from '../data/initialState';
import { exportBackup as exportBackupFile, mergeBackupIntoDefaults } from '../data/backup';
import { SPLIT_PRESETS, buildProgramFromPreset, buildCustomProgram } from '../data/wizard';
import type {
  AppState, CoachVoice, ExerciseFormState, Muscle, ProgramExercise, RestPacing, Screen, TrainingType,
  Units, WarmupStyle, WorkoutSetRow, WizardCustomDay
} from '../data/types';
import {
  recommendation, restForExercise, dayMuscleRanks, isWeekComplete, fmtWeight,
  nextIncompleteIndex, defaultCompareLiftIds, bestSetScore, effectiveLast
} from './logic';
import { vibrateRestEnd, playRestEndSound, notifyRestEnd, updateRestProgressNotification, clearRestProgressNotification } from './alerts';
import { shouldFireReminder, fireReminder } from './reminders';

const STORAGE_KEY = 'fitness-app-state-v1';

function loadInitial(): AppState {
  const defaults = createInitialState();
  let state: AppState = defaults;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    // shallow-merge over fresh defaults so fields added in later app versions (not present in an
    // older saved session) fall back to their default rather than being `undefined`.
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<AppState>;
      state = { ...defaults, ...parsed };
      // back-compat: sessions saved before onboarding existed have no `onboarded` flag in storage —
      // infer it from already having a real program, so returning users aren't sent through the
      // wizard again (which would otherwise overwrite their existing program).
      if (parsed.onboarded === undefined && parsed.dayOrder && parsed.dayOrder.length > 0) {
        state.onboarded = true;
      }
    }
  } catch {
    state = defaults;
  }
  // custom exercises live in persisted state but the exercise library itself is a module-level
  // singleton (mutated everywhere, like the original prototype) — merge them back in on load.
  Object.entries(state.customExercises || {}).forEach(([id, def]) => { EXLIB[id] = def; });
  return state;
}

// If a workout is in progress and the user hasn't interacted with the app for this long, prompt to
// confirm they're still training (they may have set the phone down and walked off). 30 minutes.
const IDLE_WORKOUT_MS = 30 * 60 * 1000;

// A linked superset pair shares rest after a full round (both exercises' current-index set done)
// rather than each exercise having its own rest — uses the longer of the two so neither lift gets
// shortchanged on recovery.
function restTotalFor(dayExercises: ProgramExercise[], idx: number, restPacing: RestPacing, trainingType: TrainingType, rir?: number): number {
  const ex = dayExercises[idx];
  const base = restForExercise(ex.id, restPacing, trainingType, rir);
  if (!ex.supersetGroup) return base;
  const partner = dayExercises.find((e, i) => i !== idx && e.supersetGroup === ex.supersetGroup);
  if (!partner) return base;
  return Math.max(base, restForExercise(partner.id, restPacing, trainingType, rir));
}

export function useApp() {
  const [state, setState] = useState<AppState>(loadInitial);
  const restInterval = useRef<number | null>(null);
  const elapsedInterval = useRef<number | null>(null);
  const [, forceTick] = useState(0);
  // Timestamp of the last in-app user interaction, tracked in a ref (no re-render on every tap) and
  // used only to decide whether an in-progress workout has gone idle. Not persisted.
  const lastActivityRef = useRef(Date.now());
  // restEndAt of the rest period whose completion alerts have already fired — makes restTick's
  // completion branch idempotent across the interval and the visibilitychange resync.
  const restDoneForRef = useRef<number | null>(null);

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { /* storage full/unavailable */ }
  }, [state]);

  // reminder check runs every 60s while the app is open (see reminders.ts for why that's the
  // ceiling on what a backend-less reminder can do) — reads the latest state via a ref rather
  // than closing over `state` directly, so the interval doesn't need to be torn down/recreated
  // every time unrelated state changes.
  const stateRef = useRef(state);
  useEffect(() => { stateRef.current = state; }, [state]);
  useEffect(() => {
    const id = window.setInterval(() => {
      const cur = stateRef.current;
      // Idle-workout check: a workout is open but the app hasn't been touched for IDLE_WORKOUT_MS.
      // Runs on the same 60s cadence, so it fires within a minute of crossing the threshold.
      if (cur.workout && !cur.idleWorkoutPrompt && Date.now() - lastActivityRef.current >= IDLE_WORKOUT_MS) {
        setState(s => (s.workout && !s.idleWorkoutPrompt ? { ...s, idleWorkoutPrompt: true } : s));
      }
      const now = new Date();
      if (!shouldFireReminder(cur, now)) return;
      const dow = now.toLocaleDateString(undefined, { weekday: 'long' });
      const todayProgDay = cur.dayOrder.map(k => cur.program[k]).find(d => d && d.dow === dow);
      fireReminder(todayProgDay ? todayProgDay.label : 'Today’s workout');
      setState(s => ({ ...s, lastReminderFiredDate: now.toDateString() }));
    }, 60000);
    return () => window.clearInterval(id);
  }, []);

  // Track any in-app interaction as activity, in a ref so ordinary taps never trigger a re-render.
  // The idle prompt is a blocking dialog resolved only via its Continue/End buttons, so there's no
  // auto-dismiss here (which would also risk the dialog unmounting between pointerdown and click).
  useEffect(() => {
    const onActivity = () => { lastActivityRef.current = Date.now(); };
    window.addEventListener('pointerdown', onActivity);
    window.addEventListener('keydown', onActivity);
    return () => {
      window.removeEventListener('pointerdown', onActivity);
      window.removeEventListener('keydown', onActivity);
    };
  }, []);

  const startElapsedTimer = useCallback(() => {
    if (elapsedInterval.current) window.clearInterval(elapsedInterval.current);
    elapsedInterval.current = window.setInterval(() => forceTick(t => t + 1), 1000);
  }, []);
  const stopElapsedTimer = useCallback(() => {
    if (elapsedInterval.current) { window.clearInterval(elapsedInterval.current); elapsedInterval.current = null; }
  }, []);
  // keep the elapsed timer alive across reloads if a workout is already running
  useEffect(() => {
    if (state.workout) startElapsedTimer();
    return () => stopElapsedTimer();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openExerciseHistory = useCallback((id: string) => setState(s => ({ ...s, exerciseHistoryModalId: id })), []);
  const closeExerciseHistory = useCallback(() => setState(s => ({ ...s, exerciseHistoryModalId: null })), []);
  const openArchiveDetail = useCallback((id: string) => setState(s => ({ ...s, archiveDetailId: id })), []);
  const closeArchiveDetail = useCallback(() => setState(s => ({ ...s, archiveDetailId: null })), []);
  const selectExerciseProgress = useCallback((id: string) => setState(s => ({ ...s, selectedProgressEx: id, progressPickerOpen: false })), []);
  const toggleProgressPicker = useCallback(() => setState(s => ({ ...s, progressPickerOpen: !s.progressPickerOpen })), []);
  const toggleCompareLift = useCallback((id: string) => {
    setState(s => {
      const cur = s.compareLiftIds && s.compareLiftIds.length ? s.compareLiftIds : defaultCompareLiftIds(s);
      const has = cur.includes(id);
      if (!has && cur.length >= 3) return { ...s, compareLiftLimitHit: true };
      const compareLiftIds = has ? cur.filter(x => x !== id) : [...cur, id];
      return { ...s, compareLiftIds, compareLiftLimitHit: false };
    });
  }, []);
  const toggleCompareLiftPicker = useCallback(() => setState(s => ({ ...s, compareLiftPickerOpen: !s.compareLiftPickerOpen })), []);
  const setProgressMetric = useCallback((m: 'weight' | 'e1rm') => setState(s => ({ ...s, progressMetric: m })), []);

  const openWeekReview = useCallback(() => setState(s => ({ ...s, weekReviewOpen: true, weekReviewSelected: null })), []);
  const closeWeekReview = useCallback(() => setState(s => ({ ...s, weekReviewOpen: false })), []);
  const selectReviewWeek = useCallback((w: number) => setState(s => ({ ...s, weekReviewSelected: w })), []);
  const backToWeekList = useCallback(() => setState(s => ({ ...s, weekReviewSelected: null })), []);

  // ---------- nav ----------
  const goProgram = useCallback(() => setState(s => ({ ...s, screen: 'program' as Screen, activeDayKey: null })), []);
  const goProgress = useCallback(() => setState(s => ({ ...s, screen: 'progress' as Screen })), []);
  const goExercises = useCallback(() => setState(s => ({ ...s, screen: 'exercises' as Screen })), []);
  const goAchievements = useCallback(() => setState(s => ({ ...s, screen: 'achievements' as Screen })), []);
  // deliberately NOT bundled into goAchievements — it needs to fire *after* the screen has
  // already rendered once with the pre-visit seen set, or "NEW" badges would never be visible
  // (see AchievementsScreen.tsx's mount effect, which calls this).
  const markAchievementsSeen = useCallback((ids: string[]) => setState(s => ({ ...s, seenAchievementIds: Array.from(new Set([...s.seenAchievementIds, ...ids])) })), []);

  const openDay = useCallback((key: string) => {
    setState(s => {
      const ranks = dayMuscleRanks(s, key);
      const top = Object.keys(ranks).sort((a, b) => ranks[b] - ranks[a])[0];
      const BACK_MUSCLES = ['Back', 'Rear Delts', 'Triceps', 'Hamstrings', 'Glutes'];
      const view = top && BACK_MUSCLES.includes(top) ? 'back' : 'front';
      return { ...s, screen: 'dayView' as Screen, activeDayKey: key, bodyView: view as 'front' | 'back' };
    });
  }, []);
  const openDayBuilder = useCallback(() => setState(s => ({ ...s, screen: 'dayBuilder' as Screen })), []);
  const closeDayBuilder = useCallback(() => setState(s => ({ ...s, screen: 'dayView' as Screen })), []);

  const setTrainingType = useCallback((t: TrainingType) => setState(s => ({ ...s, trainingType: t })), []);
  const openSettings = useCallback(() => setState(s => ({ ...s, showSettings: true })), []);
  const closeSettings = useCallback(() => setState(s => ({ ...s, showSettings: false })), []);
  // Wipes localStorage and every EXLIB entry a prior session added, dropping straight back to
  // onboarding — mainly so "does a genuinely fresh install look right" can actually be tested
  // without needing to clear site data from the browser's own settings UI.
  const requestResetApp = useCallback(() => setState(s => ({ ...s, confirmResetApp: true })), []);
  const cancelResetApp = useCallback(() => setState(s => ({ ...s, confirmResetApp: false })), []);
  const resetApp = useCallback(() => {
    setState(s => {
      try { localStorage.removeItem(STORAGE_KEY); } catch { /* storage unavailable */ }
      // only drop the custom exercises this session merged into the EXLIB singleton — the ~151
      // built-in exercises live in exercises.ts, not localStorage, and must survive a reset.
      Object.keys(s.customExercises || {}).forEach(id => { delete EXLIB[id]; });
      return createInitialState();
    });
  }, []);
  const setUnits = useCallback((u: Units) => setState(s => ({ ...s, units: u })), []);
  const setRestPacing = useCallback((v: RestPacing) => setState(s => ({ ...s, restPacing: v })), []);
  const setCoachVoice = useCallback((v: CoachVoice) => setState(s => ({ ...s, coachVoice: v })), []);
  const setWarmupStyle = useCallback((v: WarmupStyle) => setState(s => ({ ...s, warmupStyle: v })), []);
  const renameProgram = useCallback((name: string) => setState(s => ({ ...s, programName: name })), []);
  const dismissDeloadSuggestion = useCallback(() => setState(s => ({ ...s, deloadDismissedWeek: s.weekNumber })), []);

  // ---------- backup export/import ----------
  const exportBackup = useCallback(() => { exportBackupFile(state); }, [state]);
  const stageBackupImport = useCallback((data: Partial<AppState>) => setState(s => ({ ...s, pendingBackupImport: data })), []);
  const cancelBackupImport = useCallback(() => setState(s => ({ ...s, pendingBackupImport: null })), []);
  const confirmBackupImport = useCallback(() => {
    setState(s => {
      if (!s.pendingBackupImport) return s;
      const restored = mergeBackupIntoDefaults(s.pendingBackupImport);
      Object.entries(restored.customExercises || {}).forEach(([id, def]) => { EXLIB[id] = def; });
      return { ...restored, pendingBackupImport: null };
    });
  }, []);

  // ---------- rest-timer alerts ----------
  const requestNotifyPermissionIfNeeded = () => {
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') Notification.requestPermission();
  };
  const setRestAlertSound = useCallback((v: boolean) => setState(s => ({ ...s, restAlertSound: v })), []);
  // Vibration while the app is minimized is only reachable via a system notification's own
  // vibrate pattern (see alerts.ts), so turning this on needs the same permission grant as the
  // notify toggle — not just a page-level Vibration API call, which no-ops when the doc is hidden.
  const setRestAlertVibrate = useCallback((v: boolean) => {
    if (v) requestNotifyPermissionIfNeeded();
    setState(s => ({ ...s, restAlertVibrate: v }));
  }, []);
  const setRestAlertNotify = useCallback((v: boolean) => {
    if (v) requestNotifyPermissionIfNeeded();
    setState(s => ({ ...s, restAlertNotify: v }));
  }, []);

  // ---------- reminder notifications ----------
  const setRemindersEnabled = useCallback((v: boolean) => {
    if (v && typeof Notification !== 'undefined' && Notification.permission === 'default') {
      Notification.requestPermission();
    }
    setState(s => ({ ...s, remindersEnabled: v }));
  }, []);
  const setReminderTime = useCallback((v: string) => setState(s => ({ ...s, reminderTime: v })), []);

  // ---------- body-weight tracking ----------
  const setBodyWeightInput = useCallback((v: string) => setState(s => ({ ...s, bodyWeightInput: v })), []);
  const logBodyWeight = useCallback(() => {
    setState(s => {
      const displayVal = parseFloat(s.bodyWeightInput);
      if (!Number.isFinite(displayVal) || displayVal <= 0) return s;
      const weightKg = s.units === 'lb' ? displayVal / 2.20462 : displayVal;
      const todayKey = new Date().toISOString().slice(0, 10);
      const bodyWeightLog = [...s.bodyWeightLog.filter(e => e.date !== todayKey), { date: todayKey, weightKg }];
      return { ...s, bodyWeightLog, bodyWeightInput: '' };
    });
  }, []);

  // ---------- program management ----------
  const switchProgram = useCallback((id: string) => {
    setState(s => {
      if (id === s.activeProgramId) return s;
      const savedPrograms = { ...s.savedPrograms };
      savedPrograms[s.activeProgramId] = { name: s.programName, trainingType: s.trainingType, dayOrder: s.dayOrder, startedAt: s.startedAt, days: s.program, weekNumber: s.weekNumber, weekStartedAt: s.weekStartedAt };
      const target = savedPrograms[id];
      delete savedPrograms[id];
      return {
        ...s,
        activeProgramId: id, programName: target.name,
        trainingType: target.trainingType || 'progressive_overload',
        dayOrder: target.dayOrder || Object.keys(target.days),
        startedAt: target.startedAt || new Date().toISOString(),
        weekNumber: target.weekNumber || 1, weekStartedAt: target.weekStartedAt || target.startedAt || new Date().toISOString(),
        program: target.days, savedPrograms, activeDayKey: null, screen: 'program' as Screen
      };
    });
  }, []);
  const newProgram = useCallback(() => {
    setState(s => {
      const newId = 'prog_' + Date.now();
      const savedPrograms = { ...s.savedPrograms };
      savedPrograms[s.activeProgramId] = { name: s.programName, trainingType: s.trainingType, dayOrder: s.dayOrder, startedAt: s.startedAt, days: s.program, weekNumber: s.weekNumber, weekStartedAt: s.weekStartedAt };
      return {
        ...s,
        activeProgramId: newId, programName: s.programName + ' Copy',
        program: JSON.parse(JSON.stringify(s.program)), dayOrder: [...s.dayOrder], trainingType: s.trainingType,
        startedAt: new Date().toISOString(), weekNumber: 1, weekStartedAt: new Date().toISOString(),
        savedPrograms
      };
    });
  }, []);
  const requestRemoveProgram = useCallback((id: string) => {
    setState(s => {
      if (s.confirmDeleteProgId !== id) return { ...s, confirmDeleteProgId: id };
      const savedPrograms = { ...s.savedPrograms };
      delete savedPrograms[id];
      return { ...s, savedPrograms, confirmDeleteProgId: null };
    });
  }, []);
  const renameSavedProgram = useCallback((id: string, name: string) => {
    setState(s => (s.savedPrograms[id] ? { ...s, savedPrograms: { ...s.savedPrograms, [id]: { ...s.savedPrograms[id], name } } } : s));
  }, []);

  // ---------- new program wizard ----------
  const openNewProgramWizard = useCallback(() => setState(s => ({
    ...s, newProgramWizard: { name: 'New Program', trainingType: 'progressive_overload', splitId: 'ppl6', customDays: [], prefill: 'recommended' }
  })), []);
  const closeNewProgramWizard = useCallback(() => setState(s => ({ ...s, newProgramWizard: null })), []);
  const setWizardField = useCallback((field: 'name' | 'trainingType', val: string) => {
    setState(s => (s.newProgramWizard ? { ...s, newProgramWizard: { ...s.newProgramWizard, [field]: val } } : s));
  }, []);
  const setWizardPrefill = useCallback((val: 'recommended' | 'scratch') => {
    setState(s => (s.newProgramWizard ? { ...s, newProgramWizard: { ...s.newProgramWizard, prefill: val } } : s));
  }, []);
  const selectWizardSplit = useCallback((id: string) => {
    setState(s => {
      if (!s.newProgramWizard) return s;
      const customDays = id === 'custom' && !s.newProgramWizard.customDays.length
        ? [{ label: 'Day 1', kind: 'training' as const }, { label: 'Rest Day', kind: 'rest' as const }]
        : s.newProgramWizard.customDays;
      return { ...s, newProgramWizard: { ...s.newProgramWizard, splitId: id, customDays } };
    });
  }, []);
  const addWizardCustomDay = useCallback(() => {
    setState(s => (s.newProgramWizard ? {
      ...s, newProgramWizard: { ...s.newProgramWizard, customDays: [...s.newProgramWizard.customDays, { label: 'Day ' + (s.newProgramWizard.customDays.length + 1), kind: 'training' as const }] }
    } : s));
  }, []);
  const removeWizardCustomDay = useCallback((i: number) => {
    setState(s => (s.newProgramWizard ? { ...s, newProgramWizard: { ...s.newProgramWizard, customDays: s.newProgramWizard.customDays.filter((_, idx) => idx !== i) } } : s));
  }, []);
  const setWizardCustomDayField = useCallback((i: number, field: keyof WizardCustomDay, val: string) => {
    setState(s => (s.newProgramWizard ? {
      ...s, newProgramWizard: { ...s.newProgramWizard, customDays: s.newProgramWizard.customDays.map((d, idx) => idx === i ? { ...d, [field]: val } : d) }
    } : s));
  }, []);
  const createProgramFromWizard = useCallback(() => {
    setState(s => {
      const w = s.newProgramWizard;
      if (!w) return s;
      const name = w.name.trim() || 'New Program';
      const built = w.splitId === 'custom'
        ? buildCustomProgram(w.customDays.length ? w.customDays : [{ label: 'Day 1', kind: 'training' }])
        : buildProgramFromPreset(SPLIT_PRESETS.find(p => p.id === w.splitId) || SPLIT_PRESETS[0], w.trainingType, w.prefill);
      const newId = 'prog_' + Date.now();
      const savedPrograms = { ...s.savedPrograms };
      savedPrograms[s.activeProgramId] = { name: s.programName, trainingType: s.trainingType, dayOrder: s.dayOrder, startedAt: s.startedAt, days: s.program, weekNumber: s.weekNumber, weekStartedAt: s.weekStartedAt };
      return {
        ...s,
        activeProgramId: newId, programName: name, trainingType: w.trainingType,
        program: built.days, dayOrder: built.dayOrder, startedAt: new Date().toISOString(),
        weekNumber: 1, weekStartedAt: new Date().toISOString(), savedPrograms,
        newProgramWizard: null, showSettings: false, activeDayKey: null, screen: 'program' as Screen
      };
    });
  }, []);

  // first-run onboarding: same wizard fields/build logic as createProgramFromWizard, but there's
  // no existing program to stash into savedPrograms yet.
  const completeOnboarding = useCallback(() => {
    setState(s => {
      const w = s.newProgramWizard;
      if (!w) return s;
      const name = w.name.trim() || 'My Program';
      const built = w.splitId === 'custom'
        ? buildCustomProgram(w.customDays.length ? w.customDays : [{ label: 'Day 1', kind: 'training' }])
        : buildProgramFromPreset(SPLIT_PRESETS.find(p => p.id === w.splitId) || SPLIT_PRESETS[0], w.trainingType, w.prefill);
      const newId = 'prog_' + Date.now();
      return {
        ...s,
        onboarded: true,
        activeProgramId: newId, programName: name, trainingType: w.trainingType,
        program: built.days, dayOrder: built.dayOrder, startedAt: new Date().toISOString(),
        weekNumber: 1, weekStartedAt: new Date().toISOString(),
        newProgramWizard: null, screen: 'program' as Screen
      };
    });
  }, []);

  const toggleSkipDay = useCallback((dayKey: string) => {
    setState(s => {
      const program = JSON.parse(JSON.stringify(s.program));
      const day = program[dayKey];
      const turningOn = !day.skipped;
      day.skipped = turningOn;
      if (turningOn) {
        day.lastCompletedAt = null;
        const now = new Date();
        const dateStr = now.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
        const entry = {
          id: 'h' + now.getTime(), day: day.label, program: s.programName, date: dateStr,
          volumeKg: 0, durationMin: 0, avgRestSec: 0,
          weekNumber: s.weekNumber, status: 'skipped' as const, exercises: []
        };
        let weekNumber = s.weekNumber, weekStartedAt = s.weekStartedAt;
        if (isWeekComplete(program, s.dayOrder, weekStartedAt)) {
          weekNumber += 1; weekStartedAt = now.toISOString();
          s.dayOrder.forEach(k => {
            const d = program[k];
            if (d && (d.kind || 'training') !== 'rest') { d.skipped = false; d.lastCompletedAt = null; }
          });
        }
        return { ...s, program, history: [entry, ...s.history], weekNumber, weekStartedAt };
      }
      return { ...s, program };
    });
  }, []);

  const setBodyView = useCallback((v: 'front' | 'back') => setState(s => ({ ...s, bodyView: v })), []);
  const openBodyModal = useCallback(() => setState(s => ({ ...s, showBodyModal: true })), []);
  const closeBodyModal = useCallback(() => setState(s => ({ ...s, showBodyModal: false })), []);

  // ---------- detail overlay ----------
  const openDetail = useCallback((dayKey: string, exIndex: number) => setState(s => ({ ...s, detail: { dayKey, exIndex } })), []);
  const closeDetail = useCallback(() => setState(s => ({ ...s, detail: null })), []);
  const openQuickEdit = useCallback((dayKey: string, exIndex: number) => setState(s => ({ ...s, quickEdit: { dayKey, exIndex } })), []);
  const closeQuickEdit = useCallback(() => setState(s => ({ ...s, quickEdit: null })), []);

  // ---------- muscle drill ----------
  const openMuscleDrill = useCallback((name: string) => setState(s => ({ ...s, muscleDrill: name as AppState['muscleDrill'] })), []);
  const closeMuscleDrill = useCallback(() => setState(s => ({ ...s, muscleDrill: null })), []);

  // ---------- warm-up detail ----------
  const openWarmupDetail = useCallback((id: string) => setState(s => ({ ...s, warmupDetailId: id })), []);
  const closeWarmupDetail = useCallback(() => setState(s => ({ ...s, warmupDetailId: null })), []);

  // ---------- exercise library ----------
  const openLibraryDetail = useCallback((id: string) => setState(s => ({ ...s, libraryDetailId: id })), []);
  const closeLibraryDetail = useCallback(() => setState(s => ({ ...s, libraryDetailId: null })), []);
  const setExerciseSearchQuery = useCallback((q: string) => setState(s => ({ ...s, exerciseSearchQuery: q })), []);

  const openAddExerciseForm = useCallback(() => {
    setState(s => ({
      ...s,
      exerciseForm: {
        editingId: null, name: '', muscle: (Object.keys(MUSCLE_TARGETS) as Muscle[])[0], secondary: [],
        equip: [], restBase: 90, repLo: 10, repHi: 12, compound: false, pattern: '', cue: '', error: '',
        trackingMode: 'reps'
      }
    }));
  }, []);
  const openEditExerciseForm = useCallback((id: string) => {
    const lib = EXLIB[id];
    setState(s => ({
      ...s,
      exerciseForm: {
        editingId: id, name: lib.name, muscle: lib.muscle, secondary: [...lib.secondary],
        equip: lib.equip.map(e => e.v), restBase: lib.restBase, repLo: lib.repLo, repHi: lib.repHi,
        compound: lib.compound, pattern: lib.pattern || '', cue: lib.cue, error: '',
        trackingMode: lib.trackingMode || 'reps'
      },
      libraryDetailId: null
    }));
  }, []);
  const closeExerciseForm = useCallback(() => setState(s => ({ ...s, exerciseForm: null })), []);
  const setExerciseFormField = useCallback((field: keyof ExerciseFormState, val: string | number | boolean) => {
    setState(s => (s.exerciseForm ? { ...s, exerciseForm: { ...s.exerciseForm, [field]: val, error: '' } } : s));
  }, []);
  const toggleFormMuscle = useCallback((muscle: Muscle) => {
    setState(s => {
      if (!s.exerciseForm) return s;
      const secondary = s.exerciseForm.secondary.filter(m => m !== muscle);
      return { ...s, exerciseForm: { ...s.exerciseForm, muscle, secondary, error: '' } };
    });
  }, []);
  const toggleFormSecondary = useCallback((muscle: Muscle) => {
    setState(s => {
      if (!s.exerciseForm || muscle === s.exerciseForm.muscle) return s;
      const has = s.exerciseForm.secondary.includes(muscle);
      const secondary = has ? s.exerciseForm.secondary.filter(m => m !== muscle) : [...s.exerciseForm.secondary, muscle];
      return { ...s, exerciseForm: { ...s.exerciseForm, secondary } };
    });
  }, []);
  const toggleFormEquip = useCallback((v: string) => {
    setState(s => {
      if (!s.exerciseForm) return s;
      const has = s.exerciseForm.equip.includes(v);
      const equip = has ? s.exerciseForm.equip.filter(x => x !== v) : [...s.exerciseForm.equip, v];
      return { ...s, exerciseForm: { ...s.exerciseForm, equip, error: '' } };
    });
  }, []);
  const saveExerciseForm = useCallback(() => {
    setState(s => {
      const f = s.exerciseForm;
      if (!f) return s;
      const name = f.name.trim();
      if (!name) return { ...s, exerciseForm: { ...f, error: 'Give this exercise a name.' } };
      if (!f.equip.length) return { ...s, exerciseForm: { ...f, error: 'Pick at least one equipment option.' } };
      const repLo = Math.max(1, Number(f.repLo) || (f.trackingMode === 'time' ? 20 : 10));
      const repHi = Math.max(repLo, Number(f.repHi) || repLo);
      let id = f.editingId;
      if (!id) {
        const base = slugify(name);
        let candidate = base, n = 2;
        while (EXLIB[candidate]) { candidate = base + '_' + n; n++; }
        id = candidate;
      }
      const def = {
        name, muscle: f.muscle, compound: f.compound, restBase: Number(f.restBase) || 90,
        pattern: f.pattern.trim() || id,
        equip: f.equip.map(v => { const c = EQUIP_CATALOG.find(e => e.v === v); return { v, label: c ? c.label : v }; }),
        repLo, repHi, cue: f.cue.trim() || 'Focus on a controlled tempo and full range of motion.',
        secondary: f.secondary, trackingMode: f.trackingMode
      };
      EXLIB[id] = def;
      return {
        ...s,
        customExercises: { ...s.customExercises, [id]: def },
        exerciseForm: null, libraryDetailId: null
      };
    });
  }, []);
  const deleteExercise = useCallback((id: string) => {
    delete EXLIB[id];
    setState(s => {
      const scrub = (days: AppState['program'], dayOrder: string[]) => {
        const copy: AppState['program'] = {};
        dayOrder.forEach(k => { copy[k] = { ...days[k], exercises: days[k].exercises.filter(ex => ex.id !== id) }; });
        return copy;
      };
      const program = scrub(s.program, s.dayOrder);
      const savedPrograms: AppState['savedPrograms'] = {};
      Object.keys(s.savedPrograms).forEach(pid => {
        const sp = s.savedPrograms[pid];
        savedPrograms[pid] = { ...sp, days: scrub(sp.days, sp.dayOrder) };
      });
      let workout = s.workout;
      if (workout && workout.dayExercises.some(ex => ex.id === id)) {
        const dayExercises = workout.dayExercises.filter(ex => ex.id !== id);
        workout = dayExercises.length ? { ...workout, dayExercises, exIndex: Math.min(workout.exIndex, dayExercises.length - 1) } : null;
      }
      const customExercises = { ...s.customExercises };
      delete customExercises[id];
      return {
        ...s, program, savedPrograms, workout, customExercises,
        confirmDeleteExId: null, libraryDetailId: null, exerciseForm: null
      };
    });
  }, []);
  const requestDeleteExercise = useCallback((id: string) => {
    if (state.confirmDeleteExId === id) {
      deleteExercise(id);
    } else {
      setState(s => ({ ...s, confirmDeleteExId: id }));
    }
  }, [state.confirmDeleteExId, deleteExercise]);

  // ---------- swap modal ----------
  const openSwap = useCallback((dayKey: string, exIndex: number, tab: 'equip' | 'replace', isAdd: boolean) => {
    setState(s => ({ ...s, swap: { dayKey, exIndex, tab, stagedEquipIdx: null, stagedExId: null, showAll: false, isAdd: !!isAdd, query: '' } }));
  }, []);
  const closeSwap = useCallback(() => setState(s => ({ ...s, swap: null })), []);
  const setSwapQuery = useCallback((q: string) => setState(s => (s.swap ? { ...s, swap: { ...s.swap, query: q } } : s)), []);
  const swapTab = useCallback((tab: 'equip' | 'replace') => setState(s => (s.swap ? { ...s, swap: { ...s.swap, tab, stagedEquipIdx: null, stagedExId: null } } : s)), []);
  const swapToggleAll = useCallback(() => setState(s => (s.swap ? { ...s, swap: { ...s.swap, showAll: !s.swap.showAll } } : s)), []);
  const swapStageEquip = useCallback((idx: number) => setState(s => (s.swap ? { ...s, swap: { ...s.swap, stagedEquipIdx: idx } } : s)), []);
  const swapStageEx = useCallback((id: string) => setState(s => (s.swap ? { ...s, swap: { ...s.swap, stagedExId: id } } : s)), []);

  // ---------- muscle drill-down quick "switch exercise" (can span multiple days) ----------
  const openMuscleSwap = useCallback((dayKey: string, exId: string) => {
    setState(s => {
      const dayKeys = s.dayOrder.filter(k => s.program[k] && s.program[k].exercises.some(e => e.id === exId));
      return { ...s, muscleSwap: { exId, dayKeys, selectedDayKeys: [dayKey], stagedExId: null, showAll: false, query: '' } };
    });
  }, []);
  const closeMuscleSwap = useCallback(() => setState(s => ({ ...s, muscleSwap: null })), []);
  const toggleMuscleSwapDay = useCallback((dayKey: string) => {
    setState(s => {
      if (!s.muscleSwap) return s;
      const has = s.muscleSwap.selectedDayKeys.includes(dayKey);
      if (has && s.muscleSwap.selectedDayKeys.length === 1) return s; // keep at least one day selected
      const selectedDayKeys = has ? s.muscleSwap.selectedDayKeys.filter(k => k !== dayKey) : [...s.muscleSwap.selectedDayKeys, dayKey];
      return { ...s, muscleSwap: { ...s.muscleSwap, selectedDayKeys } };
    });
  }, []);
  const muscleSwapToggleAll = useCallback(() => setState(s => (s.muscleSwap ? { ...s, muscleSwap: { ...s.muscleSwap, showAll: !s.muscleSwap.showAll } } : s)), []);
  const muscleSwapSetQuery = useCallback((q: string) => setState(s => (s.muscleSwap ? { ...s, muscleSwap: { ...s.muscleSwap, query: q } } : s)), []);
  const muscleSwapStageEx = useCallback((id: string) => setState(s => (s.muscleSwap ? { ...s, muscleSwap: { ...s.muscleSwap, stagedExId: id } } : s)), []);
  const muscleSwapConfirm = useCallback(() => {
    setState(s => {
      const ms = s.muscleSwap;
      if (!ms || !ms.stagedExId) return s;
      const lib = EXLIB[ms.stagedExId];
      const program = JSON.parse(JSON.stringify(s.program));
      ms.selectedDayKeys.forEach(dayKey => {
        const day = program[dayKey];
        if (!day) return;
        const oldEx = day.exercises.find((ex: ProgramExercise) => ex.id === ms.exId);
        const oldGroup = oldEx?.supersetGroup;
        day.exercises = day.exercises.map((ex: ProgramExercise) => (ex.id === ms.exId ? mkEx(ms.stagedExId as string, ex.sets, 0, { weight: 0, reps: lib.repHi, hitTop: true }) : ex));
        if (oldGroup) {
          const partner = day.exercises.find((e: ProgramExercise) => e.supersetGroup === oldGroup);
          if (partner) partner.supersetGroup = null;
        }
      });
      return { ...s, program, muscleSwap: null };
    });
  }, []);

  const swapConfirm = useCallback(() => {
    setState(s => {
      const swap = s.swap;
      if (!swap) return s;
      const inSession = !!s.workout && s.workout.dayKey === swap.dayKey;
      if (inSession && s.workout) {
        if (swap.isAdd) {
          if (!swap.stagedExId) return { ...s, swap: null };
          const lib = EXLIB[swap.stagedExId];
          const newEx = mkEx(swap.stagedExId, 3, 0, { weight: 0, reps: lib.repHi, hitTop: true });
          const dayExercises = [...s.workout.dayExercises, newEx];
          const newIdx = dayExercises.length - 1;
          const rec = recommendation(newEx, s.units, s.coachVoice, s.exerciseHistory[newEx.id], s.exerciseHistory);
          const sets: WorkoutSetRow[] = [];
          for (let i = 0; i < newEx.sets; i++) sets.push({ weight: rec.weight, reps: rec.reps, done: false });
          const exSets = { ...s.workout.exSets, [newIdx]: sets };
          const restTotal = restTotalFor(dayExercises, newIdx, s.restPacing, s.trainingType);
          return {
            ...s,
            workout: { ...s.workout, dayExercises, exIndex: newIdx, exSets, changesMade: s.workout.changesMade + 1, resting: false, restRemaining: 0, restEndAt: null, restTotal },
            swap: null
          };
        }
        const idx = swap.exIndex;
        const oldEx = s.workout.dayExercises[idx];
        let newEx = oldEx;
        if (swap.tab === 'equip' && swap.stagedEquipIdx != null) newEx = { ...oldEx, equipIdx: swap.stagedEquipIdx };
        else if (swap.tab === 'replace' && swap.stagedExId) {
          // a swapped-in exercise is a different exercise — the old superset link doesn't carry
          // over automatically (the user can re-link it if they want the new one paired too).
          newEx = mkEx(swap.stagedExId, oldEx.sets, 0, { weight: 0, reps: EXLIB[swap.stagedExId].repHi, hitTop: true });
        }
        let dayExercises = s.workout.dayExercises.map((ex, i) => (i === idx ? newEx : ex));
        if (swap.tab === 'replace' && oldEx.supersetGroup) {
          dayExercises = dayExercises.map(e => (e.supersetGroup === oldEx.supersetGroup ? { ...e, supersetGroup: null } : e));
        }
        const rec = recommendation(newEx, s.units, s.coachVoice, s.exerciseHistory[newEx.id], s.exerciseHistory);
        const sets: WorkoutSetRow[] = [];
        for (let i = 0; i < newEx.sets; i++) sets.push({ weight: rec.weight, reps: rec.reps, done: false });
        const exSets = { ...s.workout.exSets, [idx]: sets };
        const restTotal = restTotalFor(dayExercises, idx, s.restPacing, s.trainingType);
        return { ...s, workout: { ...s.workout, dayExercises, changesMade: s.workout.changesMade + 1, exSets, restTotal }, swap: null };
      }
      const program = JSON.parse(JSON.stringify(s.program));
      const day = program[swap.dayKey];
      if (swap.isAdd) {
        if (swap.stagedExId) {
          const lib = EXLIB[swap.stagedExId];
          day.exercises.push(mkEx(swap.stagedExId, 3, 0, { weight: 0, reps: lib.repHi, hitTop: true }));
        }
      } else if (swap.tab === 'equip' && swap.stagedEquipIdx != null) {
        day.exercises[swap.exIndex].equipIdx = swap.stagedEquipIdx;
      } else if (swap.tab === 'replace' && swap.stagedExId) {
        const lib = EXLIB[swap.stagedExId];
        const oldGroup = day.exercises[swap.exIndex].supersetGroup;
        day.exercises[swap.exIndex] = mkEx(swap.stagedExId, day.exercises[swap.exIndex].sets, 0, { weight: 0, reps: lib.repHi, hitTop: true });
        if (oldGroup) {
          const partner = day.exercises.find((e: ProgramExercise) => e.supersetGroup === oldGroup);
          if (partner) partner.supersetGroup = null;
        }
      }
      return { ...s, program, swap: null };
    });
  }, []);

  // removes an exercise from the active workout session's working copy only — like equip/replace,
  // the saved plan isn't touched until the end-of-workout "update your plan?" prompt is confirmed.
  const removeWorkoutExercise = useCallback((idx: number) => {
    setState(s => {
      if (!s.workout || s.workout.dayExercises.length <= 1) return s;
      const removedGroup = s.workout.dayExercises[idx].supersetGroup;
      let dayExercises = s.workout.dayExercises.filter((_, i) => i !== idx);
      if (removedGroup) {
        dayExercises = dayExercises.map(e => (e.supersetGroup === removedGroup ? { ...e, supersetGroup: null } : e));
      }
      const exSets: Record<number, WorkoutSetRow[]> = {};
      s.workout.dayExercises.forEach((_, i) => {
        if (i === idx) return;
        const newIdx = i < idx ? i : i - 1;
        if (s.workout!.exSets[i]) exSets[newIdx] = s.workout!.exSets[i];
      });
      let exIndex = s.workout.exIndex;
      if (exIndex === idx) exIndex = Math.max(0, idx - 1);
      else if (exIndex > idx) exIndex -= 1;
      // landing on an exercise that was never visited yet (so its sets were never lazily built)
      // would otherwise show an empty working-sets list — build its default sets now.
      if (!exSets[exIndex]) {
        const landedEx = dayExercises[exIndex];
        const rec = recommendation(landedEx, s.units, s.coachVoice, s.exerciseHistory[landedEx.id], s.exerciseHistory);
        const sets: WorkoutSetRow[] = [];
        for (let i = 0; i < landedEx.sets; i++) sets.push({ weight: rec.weight, reps: rec.reps, done: false });
        exSets[exIndex] = sets;
      }
      const restTotal = restTotalFor(dayExercises, exIndex, s.restPacing, s.trainingType);
      return { ...s, workout: { ...s.workout, dayExercises, exSets, exIndex, resting: false, restRemaining: 0, restEndAt: null, restTotal, changesMade: s.workout.changesMade + 1 } };
    });
  }, []);

  // Reorders the currently active exercise relative to its neighbor, mid-session — like the
  // add/remove/swap actions above, this only touches the session's working copy
  // (workout.dayExercises), counts toward changesMade, and only reaches the saved plan if the
  // user confirms the "update your plan?" prompt at workout completion (see completeWorkout()).
  const moveWorkoutExercise = useCallback((direction: 'up' | 'down') => {
    setState(s => {
      if (!s.workout) return s;
      const idx = s.workout.exIndex;
      const target = idx + (direction === 'up' ? -1 : 1);
      if (target < 0 || target >= s.workout.dayExercises.length) return s;
      const dayExercises = [...s.workout.dayExercises];
      [dayExercises[idx], dayExercises[target]] = [dayExercises[target], dayExercises[idx]];
      const exSets: Record<number, WorkoutSetRow[]> = { ...s.workout.exSets };
      const displaced = exSets[idx];
      if (exSets[target] !== undefined) exSets[idx] = exSets[target]; else delete exSets[idx];
      if (displaced !== undefined) exSets[target] = displaced; else delete exSets[target];
      return { ...s, workout: { ...s.workout, dayExercises, exSets, exIndex: target, changesMade: s.workout.changesMade + 1 } };
    });
  }, []);

  // ---------- day builder ----------
  // Links exercise `idx` with the exercise right after it as an adjacent-pair superset (shared
  // group id) — or unlinks both if they're already linked. Scoped to pairs, not arbitrary
  // N-exercise circuits, to keep the workout-flow state machine (one active exercise at a time)
  // tractable — see toggleSetDone below for how the pairing changes rest behavior mid-workout.
  // Links exercise idxA with idxB (any two slots in the day, not just adjacent ones — the workout-
  // flow logic in toggleSetDone/restTotalFor below only ever looks up a partner by matching
  // supersetGroup, never by position, so non-adjacent pairing already works with no further
  // changes needed there). Calling this again on the same pair unlinks both. Calling it when either
  // side is already linked to a *different* exercise re-links: the old pair is broken first, so an
  // exercise is never a member of more than one pair at a time.
  const toggleSuperset = useCallback((dayKey: string, idxA: number, idxB: number) => {
    setState(s => {
      const program = JSON.parse(JSON.stringify(s.program));
      const exercises = program[dayKey].exercises;
      const a = exercises[idxA], b = exercises[idxB];
      if (!a || !b) return s;
      if (a.supersetGroup && a.supersetGroup === b.supersetGroup) {
        a.supersetGroup = null; b.supersetGroup = null;
        return { ...s, program };
      }
      if (a.supersetGroup) {
        const oldPartner = exercises.find((e: ProgramExercise, i: number) => i !== idxA && e.supersetGroup === a.supersetGroup);
        if (oldPartner) oldPartner.supersetGroup = null;
      }
      if (b.supersetGroup) {
        const oldPartner = exercises.find((e: ProgramExercise, i: number) => i !== idxB && e.supersetGroup === b.supersetGroup);
        if (oldPartner) oldPartner.supersetGroup = null;
      }
      const gid = 'ss' + Date.now();
      a.supersetGroup = gid; b.supersetGroup = gid;
      return { ...s, program };
    });
  }, []);
  const removeExercise = useCallback((dayKey: string, idx: number) => {
    setState(s => {
      const program = JSON.parse(JSON.stringify(s.program));
      const removed = program[dayKey].exercises[idx];
      program[dayKey].exercises.splice(idx, 1);
      // clear a dangling link on the removed exercise's former partner, if any, so no group id
      // ever points at an exercise that no longer exists in the day.
      if (removed?.supersetGroup) {
        const partner = program[dayKey].exercises.find((e: ProgramExercise) => e.supersetGroup === removed.supersetGroup);
        if (partner) partner.supersetGroup = null;
      }
      return { ...s, program };
    });
  }, []);
  const changeSets = useCallback((dayKey: string, idx: number, delta: number) => {
    setState(s => {
      const program = JSON.parse(JSON.stringify(s.program));
      const ex = program[dayKey].exercises[idx];
      ex.sets = Math.max(1, Math.min(8, ex.sets + delta));
      return { ...s, program };
    });
  }, []);
  // Reordering doesn't touch supersetGroup at all — links are matched by group id, not position
  // (see toggleSuperset above), so a linked pair stays linked even if reordering makes them non-
  // adjacent; DayBuilderScreen's "linked elsewhere" label already handles showing that case.
  const moveExercise = useCallback((dayKey: string, idx: number, direction: 'up' | 'down') => {
    setState(s => {
      const target = idx + (direction === 'up' ? -1 : 1);
      const exercises = s.program[dayKey].exercises;
      if (target < 0 || target >= exercises.length) return s;
      const program = JSON.parse(JSON.stringify(s.program));
      const arr = program[dayKey].exercises;
      [arr[idx], arr[target]] = [arr[target], arr[idx]];
      return { ...s, program };
    });
  }, []);
  // Drag-to-reorder equivalent of moveExercise above (arbitrary from/to instead of a single-step
  // swap) — used by DayViewScreen's press-and-hold drag list, which recomputes the target index
  // continuously as the dragged row passes over its neighbors rather than one step at a time.
  const reorderExercise = useCallback((dayKey: string, fromIdx: number, toIdx: number) => {
    setState(s => {
      const exercises = s.program[dayKey].exercises;
      if (fromIdx === toIdx || fromIdx < 0 || fromIdx >= exercises.length || toIdx < 0 || toIdx >= exercises.length) return s;
      const program = JSON.parse(JSON.stringify(s.program));
      const arr = program[dayKey].exercises;
      const [moved] = arr.splice(fromIdx, 1);
      arr.splice(toIdx, 0, moved);
      return { ...s, program };
    });
  }, []);
  // Day View quick-edit modal's weight/reps steppers — writes a manualTarget override (see
  // ProgramExercise.manualTarget) rather than ex.last directly, since ex.last alone would be
  // silently outranked by cross-day exerciseHistory in effectiveLast() the moment this exercise
  // has been logged anywhere before (the overwhelmingly common case).
  const setExerciseTarget = useCallback((dayKey: string, idx: number, field: 'weight' | 'reps', val: number) => {
    setState(s => {
      const program = JSON.parse(JSON.stringify(s.program));
      const ex: ProgramExercise = program[dayKey].exercises[idx];
      const base = ex.manualTarget || effectiveLast(ex, s.exerciseHistory[ex.id]);
      ex.manualTarget = { weight: base.weight, reps: base.reps, [field]: Math.max(0, val) };
      return { ...s, program };
    });
  }, []);
  const bumpExerciseTarget = useCallback((dayKey: string, idx: number, field: 'weight' | 'reps', delta: number) => {
    setState(s => {
      const program = JSON.parse(JSON.stringify(s.program));
      const ex: ProgramExercise = program[dayKey].exercises[idx];
      const base = ex.manualTarget || effectiveLast(ex, s.exerciseHistory[ex.id]);
      ex.manualTarget = { weight: base.weight, reps: base.reps, [field]: Math.max(0, base[field] + delta) };
      return { ...s, program };
    });
  }, []);

  // ---------- workout ----------
  const buildWorkoutExercise = useCallback((exIndex: number) => {
    setState(s => {
      if (!s.workout) return s;
      const prevExSets = s.workout.exSets;
      let exSets = prevExSets;
      if (!exSets[exIndex]) {
        const ex = s.workout.dayExercises[exIndex];
        const rec = recommendation(ex, s.units, s.coachVoice, s.exerciseHistory[ex.id], s.exerciseHistory);
        const sets: WorkoutSetRow[] = [];
        for (let i = 0; i < ex.sets; i++) sets.push({ weight: rec.weight, reps: rec.reps, done: false });
        exSets = { ...prevExSets, [exIndex]: sets };
      }
      const restTotal = restTotalFor(s.workout.dayExercises, exIndex, s.restPacing, s.trainingType);
      return { ...s, workout: { ...s.workout, exIndex, exSets, resting: false, restRemaining: 0, restEndAt: null, restTotal }, confirmEndEarly: false };
    });
  }, []);

  const stopRest = useCallback(() => {
    if (restInterval.current) { window.clearInterval(restInterval.current); restInterval.current = null; }
    // Fire-and-forget: clears any lingering "Resting… Xs remaining" tray notification left over
    // from a rest period that was skipped/adjusted/exited rather than left to run out naturally
    // (the natural-completion path in restTick below replaces it with the "Rest complete" alert
    // instead of clearing it, so this only matters for early-exit paths).
    clearRestProgressNotification();
  }, []);

  // Shared by the 1s interval and the visibilitychange resync below, so a throttled/suspended
  // interval (backgrounded tab, minimized PWA) still resolves correctly the moment either one next
  // gets to run — remaining time is always derived from the absolute restEndAt, never decremented,
  // so there's nothing to drift or double-count between the two call sites.
  // Alerts fire *outside* the setState updater deliberately. An updater must be a pure function —
  // React (and StrictMode especially) may invoke it more than once per commit, which previously
  // meant the vibrate/sound/notification could double-fire or, on a bailed-out update, not fire at
  // all. State is read from stateRef here instead, and restDoneForRef makes completion idempotent
  // per rest period (keyed on that period's restEndAt) so the 1s interval and the visibilitychange
  // resync can both call this without ever alerting twice for the same rest.
  const restTick = useCallback(() => {
    const cur = stateRef.current;
    if (!cur.workout || !cur.workout.resting || cur.workout.restEndAt == null) return;
    const endAt = cur.workout.restEndAt;
    const remainingMs = endAt - Date.now();
    if (remainingMs <= 0) {
      if (restDoneForRef.current === endAt) return;
      restDoneForRef.current = endAt;
      if (restInterval.current) { window.clearInterval(restInterval.current); restInterval.current = null; }
      if (cur.restAlertVibrate) vibrateRestEnd();
      if (cur.restAlertSound) playRestEndSound();
      // Fire the notification whenever vibrate OR notify is on, not just notify: the default
      // restAlertVibrate:true setting should still reach a backgrounded phone (where
      // navigator.vibrate is a no-op) via the OS alerting on the notification — see alerts.ts.
      if (cur.restAlertVibrate || cur.restAlertNotify) notifyRestEnd(cur.restAlertVibrate);
      setState(s => (s.workout ? { ...s, workout: { ...s.workout, resting: false, restRemaining: 0, restEndAt: null } } : s));
      return;
    }
    // Best-effort live countdown in the tray while backgrounded — the in-app toast (RestToast)
    // already covers the foreground case with a true every-second update, so this only needs to
    // run when the document is actually hidden.
    if (cur.restAlertNotify && document.hidden) updateRestProgressNotification(Math.round(remainingMs / 1000));
    setState(s => (s.workout && s.workout.resting ? { ...s, workout: { ...s.workout, restRemaining: Math.round(remainingMs / 1000) } } : s));
  }, []);

  // Vibrate/WebAudio are both restricted to a visible document by the browser (vibrate no-ops
  // outright when hidden; WebAudio typically self-suspends) — resyncing on visibilitychange is
  // mainly what makes the Notification alert (the one channel that *can* reach a backgrounded app)
  // fire promptly rather than only whenever the throttled interval next happens to tick.
  useEffect(() => {
    const onVisibilityChange = () => { if (document.visibilityState === 'visible') restTick(); };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, [restTick]);

  const switchExercise = useCallback((exIndex: number) => {
    stopRest();
    buildWorkoutExercise(exIndex);
  }, [stopRest, buildWorkoutExercise]);

  const startWorkout = useCallback(() => {
    setState(s => {
      const dayKey = s.activeDayKey;
      if (!dayKey) return s;
      const program = JSON.parse(JSON.stringify(s.program));
      program[dayKey].skipped = false;
      program[dayKey].lastCompletedAt = null;
      const dayExercises: ProgramExercise[] = JSON.parse(JSON.stringify(program[dayKey].exercises));
      const ex0 = dayExercises[0];
      const rec0 = recommendation(ex0, s.units, s.coachVoice, s.exerciseHistory[ex0.id], s.exerciseHistory);
      const sets0: WorkoutSetRow[] = [];
      for (let i = 0; i < ex0.sets; i++) sets0.push({ weight: rec0.weight, reps: rec0.reps, done: false });
      return {
        ...s, program, screen: 'workout' as Screen,
        workout: {
          dayKey, exIndex: 0, exSets: { 0: sets0 }, dayExercises, changesMade: 0,
          resting: false, restRemaining: 0, restEndAt: null, restTotal: restTotalFor(dayExercises, 0, s.restPacing, s.trainingType), startedAt: Date.now()
        }
      };
    });
    startElapsedTimer();
  }, [startElapsedTimer]);

  // restSecOverride lets the caller (toggleSetDone) recompute rest against the RIR of the set that
  // was just completed — the stored workout.restTotal is the neutral (RIR-unknown) value set when
  // the exercise was built, so without this the logged effort of the finishing set wouldn't affect
  // its own rest. Falls back to the stored total for any other caller.
  const startRest = useCallback((restSecOverride?: number) => {
    stopRest();
    setState(s => {
      if (!s.workout) return s;
      // Contextual permission prompt: the first time a rest period actually starts with vibrate
      // or notify enabled (both default/commonly on), rather than requesting at cold app boot
      // where the ask has no context and is easy to reflexively deny.
      if ((s.restAlertVibrate || s.restAlertNotify)) requestNotifyPermissionIfNeeded();
      const total = restSecOverride ?? s.workout.restTotal;
      const restEndAt = Date.now() + total * 1000;
      return { ...s, workout: { ...s.workout, resting: true, restTotal: total, restRemaining: total, restEndAt } };
    });
    restInterval.current = window.setInterval(restTick, 1000);
  }, [stopRest, restTick]);

  const restAdjust = useCallback((delta: number) => {
    setState(s => {
      if (!s.workout) return s;
      const restRemaining = Math.max(0, s.workout.restRemaining + delta);
      const restEndAt = s.workout.restEndAt != null ? s.workout.restEndAt + delta * 1000 : null;
      return { ...s, workout: { ...s.workout, restRemaining, restTotal: Math.max(s.workout.restTotal, restRemaining), restEndAt } };
    });
  }, []);
  const restSkip = useCallback(() => {
    stopRest();
    setState(s => (s.workout ? { ...s, workout: { ...s.workout, resting: false, restRemaining: 0, restEndAt: null } } : s));
  }, [stopRest]);

  const setSetField = useCallback((i: number, field: 'weight' | 'reps', val: number) => {
    setState(s => {
      if (!s.workout) return s;
      const idx = s.workout.exIndex;
      const sets = s.workout.exSets[idx].map((row, k) => (k === i ? { ...row, [field]: val } : row));
      return { ...s, workout: { ...s.workout, exSets: { ...s.workout.exSets, [idx]: sets } } };
    });
  }, []);
  const setSetRir = useCallback((i: number, val: number) => {
    setState(s => {
      if (!s.workout) return s;
      const idx = s.workout.exIndex;
      const sets = s.workout.exSets[idx].map((row, k) => (k === i ? { ...row, rir: row.rir === val ? undefined : val } : row));
      return { ...s, workout: { ...s.workout, exSets: { ...s.workout.exSets, [idx]: sets } } };
    });
  }, []);
  const bumpSetField = useCallback((i: number, field: 'weight' | 'reps', delta: number) => {
    setState(s => {
      if (!s.workout) return s;
      const idx = s.workout.exIndex;
      const sets = s.workout.exSets[idx].map((row, k) => (k === i ? { ...row, [field]: Math.max(0, row[field] + delta) } : row));
      return { ...s, workout: { ...s.workout, exSets: { ...s.workout.exSets, [idx]: sets } } };
    });
  }, []);
  const toggleSetDone = useCallback((i: number) => {
    if (!state.workout) return;
    const idx = state.workout.exIndex;
    const nowDone = !state.workout.exSets[idx][i].done;
    const ex = state.workout.dayExercises[idx];
    setState(s => {
      if (!s.workout) return s;
      const idx2 = s.workout.exIndex;
      const sets = s.workout.exSets[idx2].map((r, k) => (k === i ? { ...r, done: nowDone } : r));
      return { ...s, workout: { ...s.workout, exSets: { ...s.workout.exSets, [idx2]: sets } } };
    });
    if (nowDone) {
      // linked superset partner: jump straight to it with no rest instead of resting, unless its
      // matching-index set is already done (i.e. this was the second half of the round) — then
      // fall through to a normal rest, shared across both exercises via restTotalFor().
      const partnerIdx = ex.supersetGroup
        ? state.workout.dayExercises.findIndex((e, k) => k !== idx && e.supersetGroup === ex.supersetGroup)
        : -1;
      if (partnerIdx !== -1) {
        const partnerSets = state.workout.exSets[partnerIdx];
        const partnerSetDone = !!(partnerSets && partnerSets[i] && partnerSets[i].done);
        if (!partnerSetDone) {
          switchExercise(partnerIdx);
          return;
        }
      }
      // Rest reflects the effort of the set just finished: a set logged at RIR 0 (failure) rests
      // longer than one left several reps short. Undefined rir (not logged) falls back to neutral.
      const completedRir = state.workout.exSets[idx][i].rir;
      const restSec = restTotalFor(state.workout.dayExercises, idx, state.restPacing, state.trainingType, completedRir);
      startRest(restSec);
    }
  }, [state.workout, state.restPacing, state.trainingType, startRest, switchExercise]);
  const addSet = useCallback(() => {
    setState(s => {
      if (!s.workout) return s;
      const idx = s.workout.exIndex;
      const cur = s.workout.exSets[idx];
      const last = cur[cur.length - 1];
      const sets = [...cur, { weight: last ? last.weight : 0, reps: last ? last.reps : 10, done: false }];
      return { ...s, workout: { ...s.workout, exSets: { ...s.workout.exSets, [idx]: sets } } };
    });
  }, []);
  const removeSet = useCallback((i: number) => {
    setState(s => {
      if (!s.workout) return s;
      const idx = s.workout.exIndex;
      const cur = s.workout.exSets[idx];
      if (cur.length <= 1) return s;
      const sets = cur.filter((_, k) => k !== i);
      return { ...s, workout: { ...s.workout, exSets: { ...s.workout.exSets, [idx]: sets } } };
    });
  }, []);

  const completeWorkout = useCallback(() => {
    setState(s => {
      if (!s.workout) return s;
      const dayKey = s.workout.dayKey;
      const dayLabel = s.program[dayKey].label;
      const summary: AppState['completeSummary'] = [];
      let totalVolume = 0;
      const exercisesDoneMask: boolean[] = [];
      const updatedDayExercises = s.workout.dayExercises.map((ex, idx) => {
        const lib = EXLIB[ex.id];
        const equip = lib.equip[ex.equipIdx];
        // only sets actually checked off count as "done" — an exercise that was merely
        // visited (e.g. navigated to, then the workout was ended early) doesn't count.
        const rawSets = s.workout!.exSets[idx];
        const completedRows = rawSets ? rawSets.filter(r => r.done) : [];
        const doneSets = completedRows.length ? completedRows : null;
        exercisesDoneMask[idx] = !!doneSets;
        let newEx = ex;
        let isPR = false;
        if (doneSets) {
          const topSet = doneSets[doneSets.length - 1];
          const hitTop = doneSets.every(r => r.reps >= lib.repHi);
          // a fresh real log always supersedes a manual weight/reps correction, wherever it was set.
          newEx = { ...ex, last: { weight: topSet.weight, reps: topSet.reps, hitTop, rir: topSet.rir }, lastSets: doneSets.map(r => ({ weight: r.weight, reps: r.reps, rir: r.rir })), sets: doneSets.length, manualTarget: null };
          doneSets.forEach(r => { totalVolume += (r.weight || 0) * r.reps; });
          const isBodyweight = equip.v === 'bodyweight' || equip.v === 'assisted';
          const isTime = lib.trackingMode === 'time';
          const prior = s.exerciseHistory[ex.id] || [];
          // a first-ever log has nothing to beat, so it's a PR by default — otherwise compare
          // against the best prior session the same way bestSetScore is used for the e1RM metric.
          if (prior.length === 0) {
            isPR = true;
          } else {
            const bestThisSession = Math.max(...doneSets.map(r => bestSetScore(r.weight, r.reps, isTime, isBodyweight)));
            const bestPrior = Math.max(...prior.map(p => bestSetScore(p.weight, p.reps, isTime, isBodyweight)));
            isPR = bestThisSession > bestPrior;
          }
        }
        summary!.push({
          name: lib.name,
          resultText: doneSets ? fmtWeight(doneSets[0].weight, s.units) + ' × ' + doneSets.map(r => r.reps).join('/') : ex.sets + ' sets planned',
          badgeText: doneSets ? (isPR ? '🏆 PR' : 'Logged') : 'Skipped',
          badgeBg: doneSets ? (isPR ? 'oklch(0.78 0.15 90 / 0.22)' : 'oklch(0.7 0.15 145 / 0.2)') : 'rgba(255,255,255,.08)',
          badgeColor: doneSets ? (isPR ? 'oklch(0.85 0.16 90)' : 'oklch(0.75 0.15 145)') : 'rgba(245,240,234,.5)',
          isPR
        });
        return newEx;
      });
      const now = new Date();
      const dateStr = now.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
      const durationMin = Math.max(1, Math.round((Date.now() - (s.workout.startedAt || Date.now())) / 60000));
      const avgRestSec = Math.round(s.workout.dayExercises.reduce((a, ex) => a + restForExercise(ex.id, s.restPacing), 0) / Math.max(1, s.workout.dayExercises.length));
      const historyEntry = {
        id: 'h' + now.getTime(), day: dayLabel, program: s.programName, date: dateStr, volumeKg: Math.round(totalVolume),
        durationMin, avgRestSec, weekNumber: s.weekNumber, status: 'completed' as const, exercises: summary!
      };
      const exerciseHistory = { ...s.exerciseHistory };
      const loggedIds = new Set<string>();
      s.workout.dayExercises.forEach((ex, idx) => {
        const doneSets = (s.workout!.exSets[idx] || []).filter(r => r.done);
        if (!doneSets.length) return;
        loggedIds.add(ex.id);
        const prior = exerciseHistory[ex.id] || [];
        const entry = { date: dateStr, weight: doneSets[0].weight, reps: doneSets[0].reps, day: dayLabel, sets: doneSets.map(r => ({ weight: r.weight, reps: r.reps, rir: r.rir })) };
        exerciseHistory[ex.id] = [...prior, entry].slice(-8);
      });
      const hasChanges = s.workout.changesMade > 0;
      const program = JSON.parse(JSON.stringify(s.program));
      program[dayKey].lastCompletedAt = now.toISOString();
      program[dayKey].exercisesDoneMask = exercisesDoneMask;
      // A manualTarget on some *other* day's slot for the same exercise is now stale (this session's
      // real log is fresher than any manual guess, on whichever day it was set) — clear it wherever
      // it appears, not just on the day just played, so effectiveLast() doesn't resurrect a months-
      // old correction the next time that other day is opened.
      if (loggedIds.size) {
        s.dayOrder.forEach(k => {
          const exercises = program[k]?.exercises;
          if (!exercises) return;
          exercises.forEach((ex: ProgramExercise) => { if (loggedIds.has(ex.id)) ex.manualTarget = null; });
        });
      }
      if (!hasChanges) program[dayKey].exercises = updatedDayExercises;

      let weekNumber = s.weekNumber, weekStartedAt = s.weekStartedAt;
      if (isWeekComplete(program, s.dayOrder, weekStartedAt)) {
        weekNumber += 1; weekStartedAt = now.toISOString();
        s.dayOrder.forEach(k => {
          const d = program[k];
          if (d && (d.kind || 'training') !== 'rest') { d.skipped = false; d.lastCompletedAt = null; }
        });
      }

      if (hasChanges) {
        return {
          ...s, program, screen: 'complete' as Screen, completeSummary: summary, workout: null,
          history: [historyEntry, ...s.history], exerciseHistory, weekNumber, weekStartedAt,
          pendingPlanUpdate: { dayKey, updatedDayExercises, changedCount: s.workout.changesMade }
        };
      }
      return {
        ...s, program, screen: 'complete' as Screen, completeSummary: summary, workout: null,
        history: [historyEntry, ...s.history], exerciseHistory, weekNumber, weekStartedAt, pendingPlanUpdate: null
      };
    });
    stopElapsedTimer();
  }, [stopElapsedTimer]);

  const applyPlanUpdate = useCallback(() => {
    setState(s => {
      if (!s.pendingPlanUpdate) return s;
      const program = JSON.parse(JSON.stringify(s.program));
      program[s.pendingPlanUpdate.dayKey].exercises = s.pendingPlanUpdate.updatedDayExercises;
      return { ...s, program, pendingPlanUpdate: null };
    });
  }, []);
  const discardPlanUpdate = useCallback(() => setState(s => ({ ...s, pendingPlanUpdate: null })), []);

  const advance = useCallback(() => {
    if (!state.workout) return;
    const next = nextIncompleteIndex(state.workout.dayExercises, state.workout.exSets, state.workout.exIndex);
    if (next != null) {
      switchExercise(next);
    } else {
      completeWorkout();
    }
  }, [state.workout, switchExercise, completeWorkout]);

  const exitWorkout = useCallback(() => setState(s => ({ ...s, screen: 'program' as Screen })), []);
  const resumeWorkout = useCallback(() => setState(s => ({ ...s, screen: 'workout' as Screen })), []);

  // Entry point for a tap on the "Rest complete" notification (see src/sw.ts). Lands on the active
  // program day's workout showing the exercise the user still owes work on: normally that's the one
  // they were just resting inside, but if the rest they finished was after the *last* set of that
  // exercise, the useful thing to show is the next incomplete exercise instead. Reads from stateRef
  // so it works identically whether it was triggered by a postMessage into a running app or by the
  // boot-time hash check on a cold start.
  const openRestCompleteExercise = useCallback(() => {
    const cur = stateRef.current;
    if (!cur.workout) return;
    lastActivityRef.current = Date.now();
    const sets = cur.workout.exSets[cur.workout.exIndex];
    const allDone = !!sets && sets.length > 0 && sets.every(r => r.done);
    const next = allDone ? nextIncompleteIndex(cur.workout.dayExercises, cur.workout.exSets, cur.workout.exIndex) : null;
    setState(s => ({ ...s, screen: 'workout' as Screen, idleWorkoutPrompt: false }));
    if (next != null) switchExercise(next);
  }, [switchExercise]);

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.data && e.data.type === 'open-rest-exercise') openRestCompleteExercise();
    };
    // Cold start: the worker had no live client to message, so it passed the intent in the URL.
    // Strip the hash straight away so a later reload doesn't re-trigger the jump.
    const consumeHash = () => {
      if (window.location.hash !== '#rest-exercise') return;
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
      openRestCompleteExercise();
    };
    navigator.serviceWorker?.addEventListener('message', onMessage);
    // hashchange as well as the mount-time check: openWindow() normally yields a fresh document
    // (mount covers it), but if it ever resolves to an already-open context the hash would change
    // same-document and never remount this effect.
    window.addEventListener('hashchange', consumeHash);
    consumeHash();
    return () => {
      navigator.serviceWorker?.removeEventListener('message', onMessage);
      window.removeEventListener('hashchange', consumeHash);
    };
  }, [openRestCompleteExercise]);
  // Idle-prompt resolutions: Continue brings the current exercise back to front; End Workout runs
  // the normal end-of-session flow (logs whatever's done, same as ending early). Both clear the flag
  // and reset the activity clock so the prompt can't immediately re-fire.
  const continueWorkoutFromIdle = useCallback(() => {
    lastActivityRef.current = Date.now();
    setState(s => ({ ...s, idleWorkoutPrompt: false, screen: 'workout' as Screen }));
  }, []);
  const endWorkoutFromIdle = useCallback(() => {
    lastActivityRef.current = Date.now();
    setState(s => ({ ...s, idleWorkoutPrompt: false }));
    completeWorkout();
  }, [completeWorkout]);
  const requestEndEarly = useCallback(() => {
    if (state.confirmEndEarly) {
      setState(s => ({ ...s, confirmEndEarly: false }));
      completeWorkout();
    } else {
      setState(s => ({ ...s, confirmEndEarly: true }));
    }
  }, [state.confirmEndEarly, completeWorkout]);

  // ---------- hardware/gesture back button navigates in-app instead of exiting ----------
  // Installed PWAs have no browser chrome, so the only way "back" reaches the OS (minimizing the
  // app) is when there's no history entry left for it to consume — which is always, since this is
  // a single-URL SPA that never otherwise touches history. Fix: keep exactly one extra history
  // entry pushed whenever the user is away from the "resting" state (program screen, no modal
  // open); consume it by closing whatever's topmost instead of letting the browser/OS handle it.
  // Deliberately a *binary* one-entry model rather than one push per modal/screen level — simpler
  // and far less prone to desync than tracking exact depth, at the cost of occasionally consuming
  // a back-press that does nothing visible (e.g. if a modal was already closed via its own ✕
  // button, leaving one stale entry) rather than closing two things at once. That trade favors
  // robustness: the failure mode is "press back once more than expected," never "back exits the
  // app early."
  const isAnyModalOpen = useCallback((s: AppState) => !!(
    s.showSettings || s.swap || s.muscleSwap || s.detail || s.quickEdit || s.muscleDrill || s.warmupDetailId ||
    s.libraryDetailId || s.exerciseForm || s.exerciseHistoryModalId || s.archiveDetailId ||
    s.newProgramWizard || s.weekReviewOpen || s.showBodyModal
  ), []);
  const closeTopmost = useCallback(() => {
    setState(s => {
      if (s.archiveDetailId) return { ...s, archiveDetailId: null };
      if (s.exerciseHistoryModalId) return { ...s, exerciseHistoryModalId: null };
      if (s.newProgramWizard) return { ...s, newProgramWizard: null };
      if (s.exerciseForm) return { ...s, exerciseForm: null };
      if (s.muscleSwap) return { ...s, muscleSwap: null };
      if (s.weekReviewOpen) return { ...s, weekReviewOpen: false };
      if (s.warmupDetailId) return { ...s, warmupDetailId: null };
      if (s.swap) return { ...s, swap: null };
      if (s.muscleDrill) return { ...s, muscleDrill: null };
      if (s.showBodyModal) return { ...s, showBodyModal: false };
      if (s.showSettings) return { ...s, showSettings: false };
      if (s.libraryDetailId) return { ...s, libraryDetailId: null };
      if (s.quickEdit) return { ...s, quickEdit: null };
      if (s.detail) return { ...s, detail: null };
      // nothing open — fall back to screen-level back.
      if (s.screen === 'dayBuilder') return { ...s, screen: 'dayView' as Screen };
      if (s.screen === 'dayView') return { ...s, screen: 'program' as Screen, activeDayKey: null };
      if (s.screen === 'workout') return { ...s, screen: 'program' as Screen };
      if (s.screen === 'complete' || s.screen === 'progress' || s.screen === 'exercises' || s.screen === 'achievements') return { ...s, screen: 'program' as Screen };
      return s; // already at rest — let the next back press through to the OS
    });
  }, []);
  const hasPushedNavEntry = useRef(false);
  useEffect(() => {
    const atRest = state.screen === 'program' && !isAnyModalOpen(state);
    if (!atRest && !hasPushedNavEntry.current) {
      window.history.pushState({ appNav: true }, '');
      hasPushedNavEntry.current = true;
    } else if (atRest) {
      hasPushedNavEntry.current = false;
    }
  }, [state, isAnyModalOpen]);
  useEffect(() => {
    const onPopState = () => {
      hasPushedNavEntry.current = false;
      closeTopmost();
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [closeTopmost]);

  return {
    state, setState,
    actions: {
      goProgram, goProgress, goExercises, goAchievements, markAchievementsSeen, openDay, openDayBuilder, closeDayBuilder,
      openExerciseHistory, closeExerciseHistory, openArchiveDetail, closeArchiveDetail,
      selectExerciseProgress, toggleProgressPicker, toggleCompareLift, toggleCompareLiftPicker, setProgressMetric,
      openWeekReview, closeWeekReview, selectReviewWeek, backToWeekList,
      setTrainingType, openSettings, closeSettings, setUnits, setRestPacing, setCoachVoice, setWarmupStyle,
      renameProgram, toggleSkipDay, dismissDeloadSuggestion,
      exportBackup, stageBackupImport, cancelBackupImport, confirmBackupImport,
      requestResetApp, cancelResetApp, resetApp,
      setRestAlertSound, setRestAlertVibrate, setRestAlertNotify, setRemindersEnabled, setReminderTime,
      setBodyWeightInput, logBodyWeight,
      switchProgram, newProgram, requestRemoveProgram, renameSavedProgram,
      openNewProgramWizard, closeNewProgramWizard, setWizardField, setWizardPrefill, selectWizardSplit,
      addWizardCustomDay, removeWizardCustomDay, setWizardCustomDayField, createProgramFromWizard,
      completeOnboarding,
      setBodyView, openBodyModal, closeBodyModal, openDetail, closeDetail, openQuickEdit, closeQuickEdit,
      openMuscleDrill, closeMuscleDrill, openWarmupDetail, closeWarmupDetail,
      openLibraryDetail, closeLibraryDetail, setExerciseSearchQuery, openAddExerciseForm, openEditExerciseForm, closeExerciseForm,
      setExerciseFormField, toggleFormMuscle, toggleFormSecondary, toggleFormEquip, saveExerciseForm,
      requestDeleteExercise, deleteExercise,
      openSwap, closeSwap, swapTab, swapToggleAll, swapStageEquip, swapStageEx, swapConfirm, removeWorkoutExercise, moveWorkoutExercise, setSwapQuery,
      openMuscleSwap, closeMuscleSwap, toggleMuscleSwapDay, muscleSwapToggleAll, muscleSwapStageEx, muscleSwapConfirm, muscleSwapSetQuery,
      removeExercise, changeSets, moveExercise, reorderExercise, setExerciseTarget, bumpExerciseTarget, toggleSuperset,
      startWorkout, switchExercise, setSetField, setSetRir, bumpSetField, toggleSetDone, addSet, removeSet,
      restAdjust, restSkip, advance, applyPlanUpdate, discardPlanUpdate,
      exitWorkout, resumeWorkout, requestEndEarly, completeWorkout, stopRest,
      continueWorkoutFromIdle, endWorkoutFromIdle
    }
  };
}

export type UseAppReturn = ReturnType<typeof useApp>;
export type Actions = UseAppReturn['actions'];
