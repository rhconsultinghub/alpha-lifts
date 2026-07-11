import { useCallback, useEffect, useRef, useState } from 'react';
import { EXLIB, EQUIP_CATALOG, MUSCLE_TARGETS } from '../data/exercises';
import { mkEx, slugify } from '../data/program';
import { createInitialState } from '../data/initialState';
import { SPLIT_PRESETS, buildProgramFromPreset, buildCustomProgram } from '../data/wizard';
import type {
  AppState, CoachVoice, ExerciseFormState, Muscle, ProgramExercise, RestPacing, Screen, TrainingType,
  Units, WarmupStyle, WorkoutSetRow, WizardCustomDay
} from '../data/types';
import {
  recommendation, restForExercise, dayMuscleRanks, isWeekComplete, fmtWeight,
  nextIncompleteIndex, defaultCompareLiftIds
} from './logic';

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

export function useApp() {
  const [state, setState] = useState<AppState>(loadInitial);
  const restInterval = useRef<number | null>(null);
  const elapsedInterval = useRef<number | null>(null);
  const [, forceTick] = useState(0);

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { /* storage full/unavailable */ }
  }, [state]);

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

  const openWeekReview = useCallback(() => setState(s => ({ ...s, weekReviewOpen: true, weekReviewSelected: null })), []);
  const closeWeekReview = useCallback(() => setState(s => ({ ...s, weekReviewOpen: false })), []);
  const selectReviewWeek = useCallback((w: number) => setState(s => ({ ...s, weekReviewSelected: w })), []);
  const backToWeekList = useCallback(() => setState(s => ({ ...s, weekReviewSelected: null })), []);

  // ---------- nav ----------
  const goProgram = useCallback(() => setState(s => ({ ...s, screen: 'program' as Screen, activeDayKey: null })), []);
  const goProgress = useCallback(() => setState(s => ({ ...s, screen: 'progress' as Screen })), []);
  const goExercises = useCallback(() => setState(s => ({ ...s, screen: 'exercises' as Screen })), []);

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
  const setUnits = useCallback((u: Units) => setState(s => ({ ...s, units: u })), []);
  const setRestPacing = useCallback((v: RestPacing) => setState(s => ({ ...s, restPacing: v })), []);
  const setCoachVoice = useCallback((v: CoachVoice) => setState(s => ({ ...s, coachVoice: v })), []);
  const setWarmupStyle = useCallback((v: WarmupStyle) => setState(s => ({ ...s, warmupStyle: v })), []);
  const renameProgram = useCallback((name: string) => setState(s => ({ ...s, programName: name })), []);

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

  // ---------- muscle drill ----------
  const openMuscleDrill = useCallback((name: string) => setState(s => ({ ...s, muscleDrill: name as AppState['muscleDrill'] })), []);
  const closeMuscleDrill = useCallback(() => setState(s => ({ ...s, muscleDrill: null })), []);

  // ---------- exercise library ----------
  const openLibraryDetail = useCallback((id: string) => setState(s => ({ ...s, libraryDetailId: id })), []);
  const closeLibraryDetail = useCallback(() => setState(s => ({ ...s, libraryDetailId: null })), []);

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
    setState(s => ({ ...s, swap: { dayKey, exIndex, tab, stagedEquipIdx: null, stagedExId: null, showAll: false, isAdd: !!isAdd } }));
  }, []);
  const closeSwap = useCallback(() => setState(s => ({ ...s, swap: null })), []);
  const swapTab = useCallback((tab: 'equip' | 'replace') => setState(s => (s.swap ? { ...s, swap: { ...s.swap, tab, stagedEquipIdx: null, stagedExId: null } } : s)), []);
  const swapToggleAll = useCallback(() => setState(s => (s.swap ? { ...s, swap: { ...s.swap, showAll: !s.swap.showAll } } : s)), []);
  const swapStageEquip = useCallback((idx: number) => setState(s => (s.swap ? { ...s, swap: { ...s.swap, stagedEquipIdx: idx } } : s)), []);
  const swapStageEx = useCallback((id: string) => setState(s => (s.swap ? { ...s, swap: { ...s.swap, stagedExId: id } } : s)), []);

  // ---------- muscle drill-down quick "switch exercise" (can span multiple days) ----------
  const openMuscleSwap = useCallback((dayKey: string, exId: string) => {
    setState(s => {
      const dayKeys = s.dayOrder.filter(k => s.program[k] && s.program[k].exercises.some(e => e.id === exId));
      return { ...s, muscleSwap: { exId, dayKeys, selectedDayKeys: [dayKey], stagedExId: null, showAll: false } };
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
        day.exercises = day.exercises.map((ex: ProgramExercise) => (ex.id === ms.exId ? mkEx(ms.stagedExId as string, ex.sets, 0, { weight: 0, reps: lib.repHi, hitTop: true }) : ex));
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
          const rec = recommendation(newEx, s.units, s.coachVoice);
          const sets: WorkoutSetRow[] = [];
          for (let i = 0; i < newEx.sets; i++) sets.push({ weight: rec.weight, reps: rec.reps, done: false });
          const exSets = { ...s.workout.exSets, [newIdx]: sets };
          const restTotal = restForExercise(newEx.id, s.restPacing);
          return {
            ...s,
            workout: { ...s.workout, dayExercises, exIndex: newIdx, exSets, changesMade: s.workout.changesMade + 1, resting: false, restRemaining: 0, restTotal },
            swap: null
          };
        }
        const idx = swap.exIndex;
        const oldEx = s.workout.dayExercises[idx];
        let newEx = oldEx;
        if (swap.tab === 'equip' && swap.stagedEquipIdx != null) newEx = { ...oldEx, equipIdx: swap.stagedEquipIdx };
        else if (swap.tab === 'replace' && swap.stagedExId) {
          newEx = mkEx(swap.stagedExId, oldEx.sets, 0, { weight: 0, reps: EXLIB[swap.stagedExId].repHi, hitTop: true });
        }
        const dayExercises = s.workout.dayExercises.map((ex, i) => (i === idx ? newEx : ex));
        const rec = recommendation(newEx, s.units, s.coachVoice);
        const sets: WorkoutSetRow[] = [];
        for (let i = 0; i < newEx.sets; i++) sets.push({ weight: rec.weight, reps: rec.reps, done: false });
        const exSets = { ...s.workout.exSets, [idx]: sets };
        const restTotal = restForExercise(newEx.id, s.restPacing);
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
        day.exercises[swap.exIndex] = mkEx(swap.stagedExId, day.exercises[swap.exIndex].sets, 0, { weight: 0, reps: lib.repHi, hitTop: true });
      }
      return { ...s, program, swap: null };
    });
  }, []);

  // removes an exercise from the active workout session's working copy only — like equip/replace,
  // the saved plan isn't touched until the end-of-workout "update your plan?" prompt is confirmed.
  const removeWorkoutExercise = useCallback((idx: number) => {
    setState(s => {
      if (!s.workout || s.workout.dayExercises.length <= 1) return s;
      const dayExercises = s.workout.dayExercises.filter((_, i) => i !== idx);
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
        const rec = recommendation(landedEx, s.units, s.coachVoice);
        const sets: WorkoutSetRow[] = [];
        for (let i = 0; i < landedEx.sets; i++) sets.push({ weight: rec.weight, reps: rec.reps, done: false });
        exSets[exIndex] = sets;
      }
      const restTotal = restForExercise(dayExercises[exIndex].id, s.restPacing);
      return { ...s, workout: { ...s.workout, dayExercises, exSets, exIndex, resting: false, restRemaining: 0, restTotal, changesMade: s.workout.changesMade + 1 } };
    });
  }, []);

  // ---------- day builder ----------
  const removeExercise = useCallback((dayKey: string, idx: number) => {
    setState(s => {
      const program = JSON.parse(JSON.stringify(s.program));
      program[dayKey].exercises.splice(idx, 1);
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

  // ---------- workout ----------
  const buildWorkoutExercise = useCallback((exIndex: number) => {
    setState(s => {
      if (!s.workout) return s;
      const prevExSets = s.workout.exSets;
      let exSets = prevExSets;
      if (!exSets[exIndex]) {
        const ex = s.workout.dayExercises[exIndex];
        const rec = recommendation(ex, s.units, s.coachVoice);
        const sets: WorkoutSetRow[] = [];
        for (let i = 0; i < ex.sets; i++) sets.push({ weight: rec.weight, reps: rec.reps, done: false });
        exSets = { ...prevExSets, [exIndex]: sets };
      }
      const restTotal = restForExercise(s.workout.dayExercises[exIndex].id, s.restPacing);
      return { ...s, workout: { ...s.workout, exIndex, exSets, resting: false, restRemaining: 0, restTotal }, confirmEndEarly: false };
    });
  }, []);

  const stopRest = useCallback(() => {
    if (restInterval.current) { window.clearInterval(restInterval.current); restInterval.current = null; }
  }, []);

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
      const rec0 = recommendation(ex0, s.units, s.coachVoice);
      const sets0: WorkoutSetRow[] = [];
      for (let i = 0; i < ex0.sets; i++) sets0.push({ weight: rec0.weight, reps: rec0.reps, done: false });
      return {
        ...s, program, screen: 'workout' as Screen,
        workout: {
          dayKey, exIndex: 0, exSets: { 0: sets0 }, dayExercises, changesMade: 0,
          resting: false, restRemaining: 0, restTotal: restForExercise(ex0.id, s.restPacing), startedAt: Date.now()
        }
      };
    });
    startElapsedTimer();
  }, [startElapsedTimer]);

  const startRest = useCallback(() => {
    stopRest();
    setState(s => (s.workout ? { ...s, workout: { ...s.workout, resting: true, restRemaining: s.workout.restTotal } } : s));
    restInterval.current = window.setInterval(() => {
      setState(s => {
        if (!s.workout || !s.workout.resting) return s;
        const r = s.workout.restRemaining - 1;
        if (r <= 0) {
          if (restInterval.current) { window.clearInterval(restInterval.current); restInterval.current = null; }
          return { ...s, workout: { ...s.workout, resting: false, restRemaining: 0 } };
        }
        return { ...s, workout: { ...s.workout, restRemaining: r } };
      });
    }, 1000);
  }, [stopRest]);

  const restAdjust = useCallback((delta: number) => {
    setState(s => {
      if (!s.workout) return s;
      const restRemaining = Math.max(0, s.workout.restRemaining + delta);
      return { ...s, workout: { ...s.workout, restRemaining, restTotal: Math.max(s.workout.restTotal, restRemaining) } };
    });
  }, []);
  const restSkip = useCallback(() => {
    stopRest();
    setState(s => (s.workout ? { ...s, workout: { ...s.workout, resting: false, restRemaining: 0 } } : s));
  }, [stopRest]);

  const setSetField = useCallback((i: number, field: 'weight' | 'reps', val: number) => {
    setState(s => {
      if (!s.workout) return s;
      const idx = s.workout.exIndex;
      const sets = s.workout.exSets[idx].map((row, k) => (k === i ? { ...row, [field]: val } : row));
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
    setState(s => {
      if (!s.workout) return s;
      const idx2 = s.workout.exIndex;
      const sets = s.workout.exSets[idx2].map((r, k) => (k === i ? { ...r, done: nowDone } : r));
      return { ...s, workout: { ...s.workout, exSets: { ...s.workout.exSets, [idx2]: sets } } };
    });
    if (nowDone) startRest();
  }, [state.workout, startRest]);
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
        // only sets actually checked off count as "done" — an exercise that was merely
        // visited (e.g. navigated to, then the workout was ended early) doesn't count.
        const rawSets = s.workout!.exSets[idx];
        const completedRows = rawSets ? rawSets.filter(r => r.done) : [];
        const doneSets = completedRows.length ? completedRows : null;
        exercisesDoneMask[idx] = !!doneSets;
        let newEx = ex;
        if (doneSets) {
          const topSet = doneSets[doneSets.length - 1];
          const hitTop = doneSets.every(r => r.reps >= lib.repHi);
          newEx = { ...ex, last: { weight: topSet.weight, reps: topSet.reps, hitTop }, lastSets: doneSets.map(r => ({ weight: r.weight, reps: r.reps })), sets: doneSets.length };
          doneSets.forEach(r => { totalVolume += (r.weight || 0) * r.reps; });
        }
        summary!.push({
          name: lib.name,
          resultText: doneSets ? fmtWeight(doneSets[0].weight, s.units) + ' × ' + doneSets.map(r => r.reps).join('/') : ex.sets + ' sets planned',
          badgeText: doneSets ? 'Logged' : 'Skipped',
          badgeBg: doneSets ? 'oklch(0.7 0.15 145 / 0.2)' : 'rgba(255,255,255,.08)',
          badgeColor: doneSets ? 'oklch(0.75 0.15 145)' : 'rgba(245,240,234,.5)'
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
      s.workout.dayExercises.forEach((ex, idx) => {
        const doneSets = (s.workout!.exSets[idx] || []).filter(r => r.done);
        if (!doneSets.length) return;
        const prior = exerciseHistory[ex.id] || [];
        const entry = { date: dateStr, weight: doneSets[0].weight, reps: doneSets[0].reps, day: dayLabel, sets: doneSets.map(r => ({ weight: r.weight, reps: r.reps })) };
        exerciseHistory[ex.id] = [...prior, entry].slice(-8);
      });
      const hasChanges = s.workout.changesMade > 0;
      const program = JSON.parse(JSON.stringify(s.program));
      program[dayKey].lastCompletedAt = now.toISOString();
      program[dayKey].exercisesDoneMask = exercisesDoneMask;
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
  const requestEndEarly = useCallback(() => {
    if (state.confirmEndEarly) {
      setState(s => ({ ...s, confirmEndEarly: false }));
      completeWorkout();
    } else {
      setState(s => ({ ...s, confirmEndEarly: true }));
    }
  }, [state.confirmEndEarly, completeWorkout]);

  return {
    state, setState,
    actions: {
      goProgram, goProgress, goExercises, openDay, openDayBuilder, closeDayBuilder,
      openExerciseHistory, closeExerciseHistory, openArchiveDetail, closeArchiveDetail,
      selectExerciseProgress, toggleProgressPicker, toggleCompareLift, toggleCompareLiftPicker,
      openWeekReview, closeWeekReview, selectReviewWeek, backToWeekList,
      setTrainingType, openSettings, closeSettings, setUnits, setRestPacing, setCoachVoice, setWarmupStyle,
      renameProgram, toggleSkipDay,
      switchProgram, newProgram, requestRemoveProgram, renameSavedProgram,
      openNewProgramWizard, closeNewProgramWizard, setWizardField, setWizardPrefill, selectWizardSplit,
      addWizardCustomDay, removeWizardCustomDay, setWizardCustomDayField, createProgramFromWizard,
      completeOnboarding,
      setBodyView, openBodyModal, closeBodyModal, openDetail, closeDetail,
      openMuscleDrill, closeMuscleDrill,
      openLibraryDetail, closeLibraryDetail, openAddExerciseForm, openEditExerciseForm, closeExerciseForm,
      setExerciseFormField, toggleFormMuscle, toggleFormSecondary, toggleFormEquip, saveExerciseForm,
      requestDeleteExercise, deleteExercise,
      openSwap, closeSwap, swapTab, swapToggleAll, swapStageEquip, swapStageEx, swapConfirm, removeWorkoutExercise,
      openMuscleSwap, closeMuscleSwap, toggleMuscleSwapDay, muscleSwapToggleAll, muscleSwapStageEx, muscleSwapConfirm,
      removeExercise, changeSets,
      startWorkout, switchExercise, setSetField, bumpSetField, toggleSetDone, addSet, removeSet,
      restAdjust, restSkip, advance, applyPlanUpdate, discardPlanUpdate,
      exitWorkout, resumeWorkout, requestEndEarly, completeWorkout, stopRest
    }
  };
}

export type UseAppReturn = ReturnType<typeof useApp>;
export type Actions = UseAppReturn['actions'];
