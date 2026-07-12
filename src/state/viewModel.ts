import { EXLIB, DAY_THEMES, MUSCLE_TARGETS, TRAINING_LABELS, TRAINING_TYPE_DESCS, EQUIP_CATALOG } from '../data/exercises';
import { SPLIT_PRESETS, DAY_TYPE_LABELS } from '../data/wizard';
import { WARMUP_LIBRARY } from '../data/warmups';
import type { AppState, HistoryEntry, Muscle, TrainingType } from '../data/types';
import type { Actions } from './useApp';
import {
  muscleBarsList, dayWarning, recommendation, estimateDayTime, formatDuration,
  warmupInfo, dayMuscleRanks, formatElapsed, fmtWeight, weightStep, formatSetTime,
  volumeChartData, weeklyHeatmapData, exerciseProgressData, compareLiftsData, consistencyData,
  volumeDonutData, durationTrendData, warmupForDay, bodyWeightChartData, platesBreakdown, deloadSuggestion
} from './logic';

const ACCENT = 'oklch(0.65 0.19 35)';
const ACCENT_TEXT = 'oklch(0.72 0.17 35)';

export interface ExerciseRowVM {
  id: string;
  name: string;
  muscle: string;
  pattern: string;
  equipLabel: string;
  setsText: string;
  targetText: string;
  openDetail: () => void;
  openSwap: () => void;
  supersetBadge: boolean;
}

function sessionRowVM(h: HistoryEntry, s: AppState, actions: Actions) {
  return {
    id: h.id, day: h.day, date: h.date, volume: fmtWeight(h.volumeKg, s.units),
    weekLabel: 'Week ' + (h.weekNumber || 1),
    statusText: h.status === 'skipped' ? 'Skipped' : 'Completed',
    statusBg: h.status === 'skipped' ? 'rgba(255,255,255,.08)' : 'oklch(0.7 0.15 145 / 0.15)',
    statusColor: h.status === 'skipped' ? 'rgba(245,240,234,.5)' : 'oklch(0.75 0.15 145)',
    showVolume: h.status !== 'skipped',
    open: () => actions.openArchiveDetail(h.id)
  };
}

export function buildViewModel(state: AppState, actions: Actions) {
  const s = state;
  const bars = muscleBarsList(s);

  const trainingTypes = (Object.keys(TRAINING_LABELS) as TrainingType[]).map(k => ({
    key: k,
    label: TRAINING_LABELS[k],
    desc: TRAINING_TYPE_DESCS[k],
    select: () => actions.setTrainingType(k),
    rowBg: k === s.trainingType ? 'oklch(0.65 0.19 35 / 0.12)' : 'rgba(255,255,255,.03)',
    rowBorder: k === s.trainingType ? 'oklch(0.65 0.19 35 / 0.5)' : 'rgba(255,255,255,.08)',
    dot: k === s.trainingType ? '●' : '○',
    dotColor: k === s.trainingType ? ACCENT_TEXT : 'rgba(245,240,234,.3)'
  }));

  const otherPrograms = Object.keys(s.savedPrograms).map(id => ({
    id, name: s.savedPrograms[id].name,
    count: (s.savedPrograms[id].dayOrder || Object.keys(s.savedPrograms[id].days)).filter(k => (s.savedPrograms[id].days[k].kind || 'training') === 'training').length,
    isActive: false, showSwitch: true, showDelete: true, switchTo: () => actions.switchProgram(id),
    deleteLabel: s.confirmDeleteProgId === id ? 'Confirm?' : 'Remove',
    deleteColor: s.confirmDeleteProgId === id ? ACCENT_TEXT : 'rgba(245,240,234,.4)',
    remove: () => actions.requestRemoveProgram(id),
    rename: (name: string) => actions.renameSavedProgram(id, name)
  }));
  const programsList = [
    { id: s.activeProgramId, name: s.programName, count: s.dayOrder.filter(k => (s.program[k].kind || 'training') === 'training').length, isActive: true, showSwitch: false, showDelete: false, deleteLabel: '', deleteColor: '', remove: () => {}, switchTo: () => {}, rename: (name: string) => actions.renameProgram(name) },
    ...otherPrograms
  ];

  const settings = {
    open: s.showSettings,
    close: actions.closeSettings,
    unitsKgBg: s.units === 'kg' ? ACCENT : 'rgba(255,255,255,.06)',
    unitsKgColor: s.units === 'kg' ? '#0d0c0b' : 'rgba(245,240,234,.6)',
    unitsLbBg: s.units === 'lb' ? ACCENT : 'rgba(255,255,255,.06)',
    unitsLbColor: s.units === 'lb' ? '#0d0c0b' : 'rgba(245,240,234,.6)',
    setKg: () => actions.setUnits('kg'),
    setLb: () => actions.setUnits('lb'),
    trainingTypes, programsList,
    newProgram: actions.newProgram, openWizard: actions.openNewProgramWizard,
    restPacingOptions: (['Relaxed', 'Standard', 'Aggressive'] as const).map(v => ({
      label: v, select: () => actions.setRestPacing(v),
      bg: s.restPacing === v ? ACCENT : 'rgba(255,255,255,.06)', color: s.restPacing === v ? '#0d0c0b' : 'rgba(245,240,234,.7)'
    })),
    restPacingDesc: 'Rescales rest timers across every exercise — Relaxed gives more recovery, Aggressive keeps sessions tight.',
    coachVoiceOptions: (['Direct', 'Encouraging', 'Hype'] as const).map(v => ({
      label: v, select: () => actions.setCoachVoice(v),
      bg: s.coachVoice === v ? ACCENT : 'rgba(255,255,255,.06)', color: s.coachVoice === v ? '#0d0c0b' : 'rgba(245,240,234,.7)'
    })),
    coachVoiceDesc: 'Changes the tone of recommendation and completion copy throughout the app.',
    warmupStyleOptions: (['Minimal', 'Standard', 'Cautious'] as const).map(v => ({
      label: v, select: () => actions.setWarmupStyle(v),
      bg: s.warmupStyle === v ? ACCENT : 'rgba(255,255,255,.06)', color: s.warmupStyle === v ? '#0d0c0b' : 'rgba(245,240,234,.7)'
    })),
    warmupStyleDesc: 'Minimal skips warm-up suggestions entirely; Cautious adds an extra ramp-up set on heavy lifts.',
    restAlertSound: s.restAlertSound,
    restAlertVibrate: s.restAlertVibrate,
    toggleRestAlertSound: () => actions.setRestAlertSound(!s.restAlertSound),
    toggleRestAlertVibrate: () => actions.setRestAlertVibrate(!s.restAlertVibrate),
    exportBackup: actions.exportBackup,
    pendingBackupImport: !!s.pendingBackupImport,
    confirmBackupImport: actions.confirmBackupImport,
    cancelBackupImport: actions.cancelBackupImport,
    stageBackupImport: actions.stageBackupImport,
    remindersEnabled: s.remindersEnabled,
    reminderTime: s.reminderTime,
    reminderPermissionDenied: typeof Notification !== 'undefined' && Notification.permission === 'denied',
    toggleReminders: () => actions.setRemindersEnabled(!s.remindersEnabled),
    setReminderTime: (v: string) => actions.setReminderTime(v)
  };

  const newProgramWizard = (() => {
    const w = s.newProgramWizard;
    if (!w) return { open: false };
    const planOptions = (Object.keys(TRAINING_LABELS) as TrainingType[]).map(k => {
      const sel = k === w.trainingType;
      return { label: TRAINING_LABELS[k], select: () => actions.setWizardField('trainingType', k), bg: sel ? ACCENT : 'rgba(255,255,255,.06)', color: sel ? '#0d0c0b' : 'rgba(245,240,234,.7)', border: sel ? ACCENT : 'rgba(255,255,255,.12)' };
    });
    const splitOptions = SPLIT_PRESETS.map(p => {
      const sel = w.splitId === p.id;
      return {
        id: p.id, label: p.label, desc: p.desc,
        select: () => actions.selectWizardSplit(p.id),
        bg: sel ? 'oklch(0.65 0.19 35 / 0.12)' : 'rgba(255,255,255,.03)',
        border: sel ? 'oklch(0.65 0.19 35 / 0.6)' : 'rgba(255,255,255,.08)',
        dot: sel ? '●' : '○', dotColor: sel ? ACCENT_TEXT : 'rgba(245,240,234,.3)',
        preview: p.days.map(d => (DAY_TYPE_LABELS[d.type] || d.type).replace(' Day', '')).join(' · ')
      };
    });
    const customSel = w.splitId === 'custom';
    splitOptions.push({
      id: 'custom', label: 'Custom', desc: 'Build your own — add, remove, and rename days freely.',
      select: () => actions.selectWizardSplit('custom'),
      bg: customSel ? 'oklch(0.65 0.19 35 / 0.12)' : 'rgba(255,255,255,.03)',
      border: customSel ? 'oklch(0.65 0.19 35 / 0.6)' : 'rgba(255,255,255,.08)',
      dot: customSel ? '●' : '○', dotColor: customSel ? ACCENT_TEXT : 'rgba(245,240,234,.3)',
      preview: ''
    });
    const customDays = (w.customDays || []).map((d, i) => ({
      i, label: d.label, setLabel: (v: string) => actions.setWizardCustomDayField(i, 'label', v),
      kind: d.kind,
      trainingBg: d.kind === 'training' ? ACCENT : 'rgba(255,255,255,.06)',
      trainingColor: d.kind === 'training' ? '#0d0c0b' : 'rgba(245,240,234,.6)',
      restBg: d.kind === 'rest' ? ACCENT : 'rgba(255,255,255,.06)',
      restColor: d.kind === 'rest' ? '#0d0c0b' : 'rgba(245,240,234,.6)',
      setTraining: () => actions.setWizardCustomDayField(i, 'kind', 'training'),
      setRest: () => actions.setWizardCustomDayField(i, 'kind', 'rest'),
      remove: () => actions.removeWizardCustomDay(i),
      canRemove: w.customDays.length > 1
    }));
    return {
      open: true, name: w.name, setName: (v: string) => actions.setWizardField('name', v),
      planOptions, splitOptions, isCustom: customSel, customDays,
      addDay: actions.addWizardCustomDay,
      showPrefill: !customSel,
      prefillRecommended: w.prefill === 'recommended',
      setPrefillRecommended: () => actions.setWizardPrefill('recommended'),
      setPrefillScratch: () => actions.setWizardPrefill('scratch'),
      prefillRecommendedBg: w.prefill === 'recommended' ? ACCENT : 'rgba(255,255,255,.06)',
      prefillRecommendedColor: w.prefill === 'recommended' ? '#0d0c0b' : 'rgba(245,240,234,.7)',
      prefillScratchBg: w.prefill === 'scratch' ? ACCENT : 'rgba(255,255,255,.06)',
      prefillScratchColor: w.prefill === 'scratch' ? '#0d0c0b' : 'rgba(245,240,234,.7)',
      close: actions.closeNewProgramWizard,
      create: s.onboarded ? actions.createProgramFromWizard : actions.completeOnboarding
    };
  })();

  const currentUnitsLabel = s.units.toUpperCase();

  const programDays = s.dayOrder.map(key => {
    const day = s.program[key];
    if ((day.kind || 'training') === 'rest') {
      return {
        key, label: day.label || 'Rest Day', dow: day.dow, count: 0, estTime: '',
        subtitle: day.dow, chevron: '', isRest: true, rowOpacity: 1,
        dotColor: 'rgba(245,240,234,.25)', badgeText: 'Rest', badgeBg: 'rgba(255,255,255,.06)', badgeColor: 'rgba(245,240,234,.4)',
        open: () => {}
      };
    }
    const w = dayWarning(s, key, bars);
    const isCompleted = !day.skipped && !!day.lastCompletedAt;
    return {
      key, label: day.label, dow: day.dow, count: day.exercises.length, isRest: false,
      estTime: formatDuration(estimateDayTime(s, key, s.restPacing, s.warmupStyle)),
      subtitle: day.dow + ' · ' + day.exercises.length + ' exercises · ' + formatDuration(estimateDayTime(s, key, s.restPacing, s.warmupStyle)),
      chevron: '›',
      rowOpacity: day.skipped ? 0.5 : 1,
      dotColor: day.skipped ? 'rgba(245,240,234,.3)' : isCompleted ? 'oklch(0.7 0.15 145)' : (w.level === 'over' ? ACCENT_TEXT : w.level === 'under' ? 'oklch(0.72 0.13 230)' : 'oklch(0.7 0.15 145)'),
      badgeText: day.skipped ? 'Skipped' : isCompleted ? '✓ Completed' : (w.level === 'over' ? 'Over' : w.level === 'under' ? 'Under' : 'On Track'),
      badgeBg: day.skipped ? 'rgba(255,255,255,.08)' : isCompleted ? 'oklch(0.7 0.15 145 / 0.22)' : (w.level === 'over' ? 'oklch(0.65 0.19 35 / 0.18)' : w.level === 'under' ? 'oklch(0.65 0.15 230 / 0.18)' : 'oklch(0.7 0.15 145 / 0.15)'),
      badgeColor: day.skipped ? 'rgba(245,240,234,.5)' : isCompleted ? 'oklch(0.8 0.16 145)' : (w.level === 'over' ? 'oklch(0.78 0.15 35)' : w.level === 'under' ? 'oklch(0.78 0.13 230)' : 'oklch(0.75 0.15 145)'),
      open: () => actions.openDay(key)
    };
  });

  // ---------- day view ----------
  let currentDay: any = null;
  if (s.activeDayKey) {
    const dayKey = s.activeDayKey;
    const day = s.program[dayKey];
    const w = dayWarning(s, dayKey, bars);
    const ranks = dayMuscleRanks(s, dayKey);
    let balanceTip: any = { show: false };
    const daySums: Record<string, number[]> = {};
    day.exercises.forEach((ex, i) => { const m = EXLIB[ex.id].muscle; (daySums[m] = daySums[m] || []).push(i); });
    const dominantEntry = Object.entries(daySums).find(([, idxs]) => idxs.length >= 2);
    if (dominantEntry) {
      const [domMuscle, idxs] = dominantEntry;
      const theme = day.theme || DAY_THEMES[dayKey] || [];
      const underBar = bars.filter(b => b.status === 'under' && b.name !== domMuscle && theme.includes(b.name as Muscle)).sort((a, b) => a.pct - b.pct)[0];
      if (underBar) {
        const exA = day.exercises[idxs[0]], exB = day.exercises[idxs[1]];
        balanceTip = {
          show: true,
          text: EXLIB[exB.id].name + ' targets ' + domMuscle + ' just like ' + EXLIB[exA.id].name + '. ' + underBar.name + ' is under target (' + underBar.pct + '%) — consider swapping it in instead.',
          ctaLabel: 'Swap for ' + underBar.name,
          swap: () => actions.openSwap(dayKey, idxs[1], 'replace', false)
        };
      }
    }

    currentDay = {
      label: day.label, dow: day.dow, skipped: day.skipped, balanceTip,
      skipLabel: day.skipped ? 'Skipped ✓' : 'Skip this week',
      skipColor: day.skipped ? ACCENT_TEXT : 'rgba(245,240,234,.6)',
      toggleSkip: () => actions.toggleSkipDay(dayKey),
      diagramRanks: ranks,
      muscleBars: w.bars, hasWarning: w.level !== 'good', warningColor: w.color, warningText: w.text,
      warmups: warmupForDay(s, dayKey).map(wu => ({ ...wu, open: () => actions.openWarmupDetail(wu.id) })),
      exercises: day.exercises.map((ex, i) => {
        const lib = EXLIB[ex.id];
        const equip = lib.equip[ex.equipIdx];
        const r = recommendation(ex, s.units, s.coachVoice);
        const isTime = lib.trackingMode === 'time';
        return {
          id: ex.id, name: lib.name, muscle: lib.muscle, pattern: lib.pattern, equipLabel: equip.label,
          setsText: ex.sets + ' × ' + (isTime ? formatSetTime(lib.repLo) + '-' + formatSetTime(lib.repHi) : lib.repLo + '-' + lib.repHi),
          targetText: r.weight > 0 ? fmtWeight(r.weight, s.units) : isTime ? formatSetTime(r.reps) : r.reps + ' reps',
          openDetail: () => actions.openDetail(dayKey, i),
          openSwap: () => actions.openSwap(dayKey, i, 'equip', false),
          supersetBadge: !!ex.supersetGroup
        } as ExerciseRowVM;
      })
    };
  }

  // ---------- day builder ----------
  let builderExercises: any[] = [];
  if (s.activeDayKey) {
    const dayKey = s.activeDayKey;
    const day = s.program[dayKey];
    builderExercises = day.exercises.map((ex, i) => {
      const lib = EXLIB[ex.id];
      const equip = lib.equip[ex.equipIdx];
      const next = day.exercises[i + 1];
      const isLinkedToNext = !!(ex.supersetGroup && next && ex.supersetGroup === next.supersetGroup);
      return {
        id: ex.id, name: lib.name, muscle: lib.muscle, equipLabel: equip.label, sets: ex.sets,
        repText: lib.trackingMode === 'time' ? formatSetTime(lib.repLo) + '-' + formatSetTime(lib.repHi) + ' hold' : lib.repLo + '-' + lib.repHi + ' reps',
        decSets: () => actions.changeSets(dayKey, i, -1),
        incSets: () => actions.changeSets(dayKey, i, 1),
        remove: () => actions.removeExercise(dayKey, i),
        openDetail: () => actions.openDetail(dayKey, i),
        openEquip: () => actions.openSwap(dayKey, i, 'equip', false),
        openReplace: () => actions.openSwap(dayKey, i, 'replace', false),
        canLinkNext: !!next,
        isLinkedToNext,
        toggleLinkNext: () => actions.toggleSuperset(dayKey, i)
      };
    });
  }

  // ---------- workout ----------
  let workout: any = null;
  if (s.workout) {
    const dayKey = s.workout.dayKey;
    const dayExercises = s.workout.dayExercises;
    const exIndex = s.workout.exIndex;
    const ex = dayExercises[exIndex];
    const lib = EXLIB[ex.id];
    const equip = lib.equip[ex.equipIdx];
    const rec = recommendation(ex, s.units, s.coachVoice);
    const warmupRaw = warmupInfo(ex, s.warmupStyle);
    const warmup = warmupRaw ? {
      show: true, note: warmupRaw.note,
      setsText: warmupRaw.sets.map(ws => fmtWeight(ws.weight, s.units) + ' × ' + ws.reps).join('  ·  ')
    } : { show: false };
    const currentSets = s.workout.exSets[exIndex] || [];
    const allDone = currentSets.length > 0 && currentSets.every(r => r.done);
    const mm = Math.floor(s.workout.restRemaining / 60);
    const ss = String(s.workout.restRemaining % 60).padStart(2, '0');
    const navList = dayExercises.map((e2, i) => {
      const l2 = EXLIB[e2.id];
      const es = s.workout!.exSets[i];
      const doneCount = es ? es.filter(r => r.done).length : 0;
      const total = es ? es.length : e2.sets;
      const complete = !!es && es.every(r => r.done);
      const linked = !!(ex.supersetGroup && e2.supersetGroup === ex.supersetGroup);
      return {
        id: e2.id, name: l2.name, pattern: l2.pattern, go: () => actions.switchExercise(i),
        statusText: complete ? '✓' : (es ? doneCount + '/' + total : total + ' sets'),
        bg: i === exIndex ? ACCENT : (complete ? 'oklch(0.7 0.15 145 / 0.12)' : 'rgba(255,255,255,.05)'),
        color: i === exIndex ? '#0d0c0b' : (complete ? 'oklch(0.75 0.15 145)' : 'rgba(245,240,234,.7)'),
        border: linked ? 'oklch(0.7 0.13 230)' : i === exIndex ? ACCENT : (complete ? 'oklch(0.7 0.15 145 / 0.4)' : 'rgba(255,255,255,.1)')
      };
    });
    const workoutAllDone = dayExercises.every((_e, i) => s.workout!.exSets[i] && s.workout!.exSets[i].every(r => r.done));
    const supersetPartner = ex.supersetGroup ? dayExercises.find((e2, i2) => i2 !== exIndex && e2.supersetGroup === ex.supersetGroup) : null;
    const supersetPartnerName = supersetPartner ? EXLIB[supersetPartner.id].name : null;

    workout = {
      progressText: 'Exercise ' + (exIndex + 1) + ' of ' + dayExercises.length,
      elapsedText: formatElapsed(Date.now() - (s.workout.startedAt || Date.now())),
      navList, workoutAllDone, supersetPartnerName,
      completeWorkout: actions.completeWorkout,
      endEarly: actions.requestEndEarly,
      endEarlyLabel: s.confirmEndEarly ? 'Tap again to confirm ending' : 'End Workout Early',
      id: ex.id, exName: lib.name, muscle: lib.muscle, pattern: lib.pattern, equipLabel: equip.label,
      recTitle: rec.title, recNote: rec.note,
      viewHistory: () => actions.openExerciseHistory(ex.id),
      openDetail: () => actions.openDetail(dayKey, exIndex),
      openSwap: () => actions.openSwap(dayKey, exIndex, 'equip', false),
      openAddExercise: () => actions.openSwap(dayKey, -1, 'replace', true),
      canRemoveExercise: dayExercises.length > 1,
      removeExercise: () => actions.removeWorkoutExercise(exIndex),
      resting: s.workout.resting,
      restText: mm + ':' + ss,
      restPct: s.workout.restTotal > 0 ? Math.round((s.workout.restRemaining / s.workout.restTotal) * 100) : 0,
      restMinus: () => actions.restAdjust(-15),
      restPlus: () => actions.restAdjust(15),
      restSkip: actions.restSkip,
      canAdvance: allDone && !s.workout.resting && !workoutAllDone,
      advanceLabel: 'Next Exercise',
      advance: actions.advance,
      canRemoveSet: currentSets.length > 1,
      addSet: actions.addSet,
      warmup, unitsLabel: currentUnitsLabel,
      isTime: lib.trackingMode === 'time',
      sets: currentSets.map((row, i) => {
        const isTime = lib.trackingMode === 'time';
        const step = weightStep(s.units);
        const dispWeight = s.units === 'lb' ? Math.round((row.weight * 2.20462) / 5) * 5 : Math.round(row.weight * 2) / 2;
        const plates = equip.v === 'barbell' ? platesBreakdown(dispWeight, s.units) : null;
        const platesText = plates ? plates.join(' + ') + ' per side' : '';
        const lastSetsArr = (ex.lastSets && ex.lastSets.length) ? ex.lastSets : (ex.last ? Array(ex.sets).fill({ weight: ex.last.weight, reps: ex.last.reps }) : []);
        const lastRow = lastSetsArr[i] || lastSetsArr[lastSetsArr.length - 1];
        return {
          num: i + 1,
          isTime,
          targetText: isTime ? formatSetTime(lib.repLo) + '-' + formatSetTime(lib.repHi) : lib.repLo + '-' + lib.repHi + ' reps',
          hasLast: !!lastRow,
          lastText: lastRow ? (isTime ? formatSetTime(lastRow.reps) : fmtWeight(lastRow.weight, s.units) + ' × ' + lastRow.reps) : '',
          viewHistory: () => actions.openExerciseHistory(ex.id),
          weight: dispWeight, reps: row.reps, timeText: formatSetTime(row.reps),
          decWeight: () => actions.bumpSetField(i, 'weight', -step),
          incWeight: () => actions.bumpSetField(i, 'weight', step),
          setWeight: (v: number) => actions.setSetField(i, 'weight', s.units === 'lb' ? v / 2.20462 : v),
          decReps: () => actions.bumpSetField(i, 'reps', isTime ? -5 : -1),
          incReps: () => actions.bumpSetField(i, 'reps', isTime ? 5 : 1),
          setReps: (v: number) => actions.setSetField(i, 'reps', v),
          toggleDone: () => actions.toggleSetDone(i),
          remove: () => actions.removeSet(i),
          done: row.done,
          doneBg: row.done ? 'oklch(0.7 0.15 145)' : 'rgba(255,255,255,.08)',
          doneColor: row.done ? '#0d0c0b' : 'rgba(245,240,234,.4)',
          cardBg: row.done ? 'oklch(0.7 0.15 145 / 0.07)' : 'rgba(255,255,255,.045)',
          cardBorder: row.done ? 'oklch(0.7 0.15 145 / 0.35)' : 'rgba(255,255,255,.06)',
          platesText,
          rirOptions: [0, 1, 2, 3, 4].map(v => ({
            v, label: v === 4 ? '4+' : String(v), sel: row.rir === v,
            bg: row.rir === v ? ACCENT : 'rgba(255,255,255,.07)',
            color: row.rir === v ? '#0d0c0b' : 'rgba(245,240,234,.55)',
            select: () => actions.setSetRir(i, v)
          }))
        };
      })
    };
  }

  // ---------- detail overlay ----------
  let detail: any = { open: false };
  if (s.detail) {
    const dayKey = s.detail.dayKey;
    const inSession = s.workout && s.workout.dayKey === dayKey;
    const ex = inSession ? s.workout!.dayExercises[s.detail.exIndex] : s.program[dayKey].exercises[s.detail.exIndex];
    if (ex) {
      const lib = EXLIB[ex.id];
      const equip = lib.equip[ex.equipIdx];
      detail = {
        open: true, id: ex.id, name: lib.name, muscle: lib.muscle, pattern: lib.pattern, equipLabel: equip.label, cue: lib.cue,
        videoId: lib.videoId,
        secondaryText: lib.secondary.length ? lib.secondary.join(', ') : 'None',
        close: actions.closeDetail,
        openSwap: () => { actions.closeDetail(); actions.openSwap(dayKey, s.detail!.exIndex, 'equip', false); }
      };
    }
  }

  // ---------- swap modal ----------
  let swap: any = { open: false };
  if (s.swap) {
    const dayKey = s.swap.dayKey;
    const inSession = !!s.workout && s.workout.dayKey === dayKey && !s.swap.isAdd;
    const exercisesArr = inSession ? s.workout!.dayExercises : s.program[dayKey].exercises;
    const isAdd = s.swap.isAdd;
    const currentEx = isAdd ? null : exercisesArr[s.swap.exIndex];
    const currentLib = currentEx ? EXLIB[currentEx.id] : null;
    const tab = isAdd ? 'replace' : s.swap.tab;
    const theme = s.program[dayKey]?.theme || DAY_THEMES[dayKey] || (Object.keys(MUSCLE_TARGETS) as Muscle[]);

    const equipOptions = currentLib ? currentLib.equip.map((o, idx) => {
      const staged = s.swap!.stagedEquipIdx != null ? s.swap!.stagedEquipIdx : currentEx!.equipIdx;
      const sel = idx === staged;
      return { label: o.label, check: sel ? '●' : '', bg: sel ? 'oklch(0.65 0.19 35 / 0.15)' : 'rgba(255,255,255,.04)', border: sel ? 'oklch(0.65 0.19 35 / 0.6)' : 'rgba(255,255,255,.08)', stage: () => actions.swapStageEquip(idx) };
    }) : [];

    const excludeId = isAdd ? null : currentEx!.id;
    const excludeMuscle = isAdd ? null : currentLib!.muscle;
    const excludePattern = isAdd ? null : currentLib!.pattern;
    const staged = s.swap.stagedExId;
    const mkOpt = (id: string) => {
      const lib = EXLIB[id];
      const sel = id === staged;
      return { label: lib.name, muscle: lib.muscle, check: sel ? '●' : '', bg: sel ? 'oklch(0.65 0.19 35 / 0.15)' : 'rgba(255,255,255,.04)', border: sel ? 'oklch(0.65 0.19 35 / 0.6)' : 'rgba(255,255,255,.08)', stage: () => actions.swapStageEx(id) };
    };
    const allIds = Object.keys(EXLIB).filter(id => id !== excludeId && theme.includes(EXLIB[id].muscle));
    const variantIds = isAdd ? [] : allIds.filter(id => EXLIB[id].pattern === excludePattern);
    const variantOptions = variantIds.map(mkOpt);
    const nonVariantIds = allIds.filter(id => !variantIds.includes(id));
    const replaceSame = isAdd ? [] : nonVariantIds.filter(id => EXLIB[id].muscle === excludeMuscle).map(mkOpt);
    const replaceOther = nonVariantIds.filter(id => isAdd || EXLIB[id].muscle !== excludeMuscle).map(mkOpt);

    const confirmDisabled = isAdd ? !staged : (tab === 'equip' ? s.swap.stagedEquipIdx == null : !staged);

    swap = {
      open: true,
      title: isAdd ? 'Add Exercise' : (tab === 'equip' ? 'Change Equipment' : 'Replace Exercise'),
      exName: currentLib ? currentLib.name : '',
      close: actions.closeSwap, backdrop: actions.closeSwap,
      tabEquip: () => actions.swapTab('equip'), tabReplace: () => actions.swapTab('replace'),
      equipTabBg: tab === 'equip' ? ACCENT : 'rgba(255,255,255,.06)',
      equipTabColor: tab === 'equip' ? '#0d0c0b' : 'rgba(245,240,234,.6)',
      replaceTabBg: tab === 'replace' ? ACCENT : 'rgba(255,255,255,.06)',
      replaceTabColor: tab === 'replace' ? '#0d0c0b' : 'rgba(245,240,234,.6)',
      showEquip: !isAdd && tab === 'equip',
      showReplace: isAdd || tab === 'replace',
      equipOptions,
      hasVariants: variantOptions.length > 0,
      variantOptions,
      sameMuscleOptions: replaceSame,
      otherMuscleOptions: replaceOther,
      showAll: isAdd || s.swap.showAll,
      showAllLabel: s.swap.showAll ? 'Hide other muscle groups' : 'Show all muscle groups',
      toggleAll: actions.swapToggleAll,
      confirmDisabled, confirm: actions.swapConfirm,
      confirmBg: confirmDisabled ? 'rgba(255,255,255,.15)' : ACCENT,
      confirmLabel: isAdd ? 'Add to Day' : (tab === 'equip' ? 'Confirm Equipment Change' : 'Confirm Exercise Swap')
    };
  }

  // ---------- muscle drill-down quick "switch exercise" (can span multiple days) ----------
  let muscleSwap: any = { open: false };
  if (s.muscleSwap) {
    const ms = s.muscleSwap;
    const currentLib = EXLIB[ms.exId];
    // union of every applicable day's theme, so the replacement list stays valid no matter which
    // of the affected days end up selected.
    const theme = new Set<Muscle>();
    ms.dayKeys.forEach(k => (s.program[k]?.theme || DAY_THEMES[k] || (Object.keys(MUSCLE_TARGETS) as Muscle[])).forEach(m => theme.add(m)));

    const dayOptions = ms.dayKeys.map(k => {
      const day = s.program[k];
      const sel = ms.selectedDayKeys.includes(k);
      return {
        key: k, label: day ? day.label : k, sel,
        bg: sel ? 'oklch(0.65 0.19 35 / 0.15)' : 'rgba(255,255,255,.04)', border: sel ? 'oklch(0.65 0.19 35 / 0.6)' : 'rgba(255,255,255,.08)',
        check: sel ? '●' : '', toggle: () => actions.toggleMuscleSwapDay(k)
      };
    });

    const staged = ms.stagedExId;
    const mkOpt = (id: string) => {
      const lib = EXLIB[id];
      const sel = id === staged;
      return { label: lib.name, muscle: lib.muscle, check: sel ? '●' : '', bg: sel ? 'oklch(0.65 0.19 35 / 0.15)' : 'rgba(255,255,255,.04)', border: sel ? 'oklch(0.65 0.19 35 / 0.6)' : 'rgba(255,255,255,.08)', stage: () => actions.muscleSwapStageEx(id) };
    };
    const allIds = Object.keys(EXLIB).filter(id => id !== ms.exId && theme.has(EXLIB[id].muscle));
    const variantIds = allIds.filter(id => EXLIB[id].pattern === currentLib.pattern);
    const variantOptions = variantIds.map(mkOpt);
    const nonVariantIds = allIds.filter(id => !variantIds.includes(id));
    const sameMuscleOptions = nonVariantIds.filter(id => EXLIB[id].muscle === currentLib.muscle).map(mkOpt);
    const otherMuscleOptions = nonVariantIds.filter(id => EXLIB[id].muscle !== currentLib.muscle).map(mkOpt);

    muscleSwap = {
      open: true,
      title: 'Switch Exercise',
      exName: currentLib.name,
      close: actions.closeMuscleSwap, backdrop: actions.closeMuscleSwap,
      dayOptions,
      hasVariants: variantOptions.length > 0,
      variantOptions,
      sameMuscleOptions, otherMuscleOptions,
      showAll: ms.showAll,
      showAllLabel: ms.showAll ? 'Hide other muscle groups' : 'Show all muscle groups',
      toggleAll: actions.muscleSwapToggleAll,
      confirmDisabled: !staged,
      confirm: actions.muscleSwapConfirm,
      confirmBg: !staged ? 'rgba(255,255,255,.15)' : ACCENT,
      confirmLabel: 'Confirm Exercise Swap'
    };
  }

  // ---------- muscle drill ----------
  const muscleDrill = (() => {
    const name = s.muscleDrill;
    if (!name) return { open: false };
    const bar = bars.find(b => b.name === name);
    if (!bar) return { open: false };
    const rows: any[] = [];
    const secondaryCounts: Record<string, number> = {};
    s.dayOrder.forEach(k => {
      s.program[k].exercises.forEach(ex => {
        const lib = EXLIB[ex.id];
        if (lib.muscle === name) {
          rows.push({
            day: s.program[k].label, name: lib.name, sets: ex.sets, equip: lib.equip[ex.equipIdx].label,
            switchExercise: () => actions.openMuscleSwap(k, ex.id)
          });
          lib.secondary.forEach(m => { secondaryCounts[m] = (secondaryCounts[m] || 0) + 1; });
        }
      });
    });
    const alsoTargets = Object.keys(secondaryCounts).sort((a, b) => secondaryCounts[b] - secondaryCounts[a]);
    let rec: string;
    if (bar.status === 'over') {
      const top = [...rows].sort((a, b) => b.sets - a.sets)[0];
      rec = top ? 'Consider trimming a set or two from ' + top.name + ' (' + top.day + '), or swapping it toward an under-trained muscle in that day’s theme.' : 'Consider trimming overall volume for ' + name + '.';
    } else if (bar.status === 'under') {
      rec = 'Add a set to an existing ' + name + ' exercise, or add a dedicated ' + name + ' exercise on a day that already trains it.';
    } else {
      rec = name + ' is on target — no changes needed.';
    }
    return { open: true, name, pctText: bar.pctText, color: bar.color, rows, alsoTargets, rec };
  })();

  // ---------- warm-up detail ----------
  const warmupDetail = (() => {
    const id = s.warmupDetailId;
    if (!id) return { open: false };
    const move = WARMUP_LIBRARY.find(m => m.id === id);
    if (!move) return { open: false };
    return {
      open: true, name: move.name, cue: move.cue, howTo: move.howTo, videoId: move.videoId,
      close: actions.closeWarmupDetail
    };
  })();

  const planPrompt = s.pendingPlanUpdate ? {
    show: true,
    text: s.pendingPlanUpdate.changedCount + (s.pendingPlanUpdate.changedCount === 1 ? ' change was' : ' changes were') + ' made to this workout’s exercises (added, removed, or swapped). Update your plan to use them going forward, or keep this as a one-time change?',
    apply: actions.applyPlanUpdate, discard: actions.discardPlanUpdate
  } : { show: false };

  const completeSubtitle = (() => {
    const label = currentDay ? currentDay.label : (s.activeDayKey ? s.program[s.activeDayKey]?.label : '');
    return label + ' — nice work.';
  })();

  const showResume = !!s.workout && s.screen !== 'workout' && s.screen !== 'complete';
  const resumeText = s.workout ? ('Resume ' + s.program[s.workout.dayKey].label + ' — Exercise ' + (s.workout.exIndex + 1) + ' of ' + s.program[s.workout.dayKey].exercises.length) : '';
  const resumeElapsedText = s.workout ? formatElapsed(Date.now() - (s.workout.startedAt || Date.now())) : '';

  return {
    needsOnboarding: !s.onboarded,
    isProgram: s.screen === 'program',
    isDayView: s.screen === 'dayView',
    isDayBuilder: s.screen === 'dayBuilder',
    isWorkout: s.screen === 'workout',
    isComplete: s.screen === 'complete',
    isProgress: s.screen === 'progress',
    isExercises: s.screen === 'exercises',
    showTabs: ['program', 'progress', 'exercises'].includes(s.screen),
    tabProgramColor: s.screen === 'program' ? '#f5f0ea' : 'rgba(245,240,234,.35)',
    tabProgressColor: s.screen === 'progress' ? '#f5f0ea' : 'rgba(245,240,234,.35)',
    tabExercisesColor: s.screen === 'exercises' ? '#f5f0ea' : 'rgba(245,240,234,.35)',
    goProgram: actions.goProgram, goProgress: actions.goProgress, goExercises: actions.goExercises,
    trainingTypes,
    muscleBars: bars.map(m => ({ ...m, drill: () => actions.openMuscleDrill(m.name) })),
    programDays, newProgramWizard,
    deload: (() => {
      const raw = deloadSuggestion(s);
      return { ...raw, show: raw.show && s.deloadDismissedWeek !== s.weekNumber, dismiss: actions.dismissDeloadSuggestion };
    })(),
    currentDay, builderExercises,
    openDayBuilder: actions.openDayBuilder, closeDayBuilder: actions.closeDayBuilder,
    startWorkout: actions.startWorkout, exitWorkout: actions.exitWorkout,
    openAddExercise: () => actions.openSwap(s.activeDayKey || '', -1, 'replace', true),
    workout, detail, swap, muscleSwap, settings, openSettings: actions.openSettings,
    confirmEndEarly: s.confirmEndEarly,
    openBodyModal: actions.openBodyModal, closeBodyModal: actions.closeBodyModal, showBodyModal: s.showBodyModal,
    setBodyView: actions.setBodyView, bodyView: s.bodyView,
    muscleDrill, closeMuscleDrill: actions.closeMuscleDrill,
    warmupDetail,
    planPrompt,
    completeSubtitle,
    showResume, resumeText, resumeElapsedText, resumeWorkout: actions.resumeWorkout,
    currentUnitsLabel, currentPlanLabel: TRAINING_LABELS[s.trainingType], programName: s.programName,
    renameProgram: (name: string) => actions.renameProgram(name),
    weekNumber: s.weekNumber,
    openWeekReview: actions.openWeekReview,
    completeSummary: s.completeSummary || [],

    // ---------- exercise library ----------
    openAddExerciseForm: actions.openAddExerciseForm,
    exerciseSearchQuery: s.exerciseSearchQuery || '',
    setExerciseSearchQuery: actions.setExerciseSearchQuery,
    exerciseLibraryGroups: (() => {
      const query = (s.exerciseSearchQuery || '').trim().toLowerCase();
      const matches = (id: string) => {
        if (!query) return true;
        const lib = EXLIB[id];
        return lib.name.toLowerCase().includes(query) || lib.muscle.toLowerCase().includes(query);
      };
      return (Object.keys(MUSCLE_TARGETS) as Muscle[]).map(muscle => {
        const ids = Object.keys(EXLIB).filter(id => EXLIB[id].muscle === muscle && matches(id)).sort((a, b) => EXLIB[a].name.localeCompare(EXLIB[b].name));
        return {
          muscle, muscleUpper: muscle.toUpperCase(),
          items: ids.map(id => ({
            id, name: EXLIB[id].name, pattern: EXLIB[id].pattern,
            equipSummary: EXLIB[id].equip.map(e => e.label).join(' · '),
            isCustom: id in s.customExercises,
            openDetail: () => actions.openLibraryDetail(id)
          }))
        };
      }).filter(g => g.items.length);
    })(),
    libraryDetail: (() => {
      const id = s.libraryDetailId;
      if (!id || !EXLIB[id]) return { open: false };
      const lib = EXLIB[id];
      const isCustom = id in s.customExercises;
      return {
        open: true, id, name: lib.name, muscle: lib.muscle, pattern: lib.pattern,
        videoId: lib.videoId,
        secondaryText: lib.secondary.length ? lib.secondary.join(', ') : 'None',
        equipChips: lib.equip,
        restText: lib.restBase + 's',
        repText: lib.trackingMode === 'time' ? formatSetTime(lib.repLo) + '-' + formatSetTime(lib.repHi) + ' hold' : lib.repLo + '-' + lib.repHi + ' reps',
        typeText: lib.compound ? 'Compound' : 'Isolation',
        cue: lib.cue,
        isCustom,
        close: actions.closeLibraryDetail,
        edit: () => actions.openEditExerciseForm(id),
        delete: () => actions.requestDeleteExercise(id),
        deleteLabel: s.confirmDeleteExId === id ? 'Confirm Delete?' : 'Delete',
        deleteColor: s.confirmDeleteExId === id ? ACCENT_TEXT : 'rgba(245,240,234,.4)'
      };
    })(),
    exerciseForm: (() => {
      const f = s.exerciseForm;
      if (!f) return { open: false };
      const muscleOptions = (Object.keys(MUSCLE_TARGETS) as Muscle[]).map(m => {
        const sel = m === f.muscle;
        return { label: m, select: () => actions.toggleFormMuscle(m), bg: sel ? ACCENT : 'rgba(255,255,255,.06)', color: sel ? '#0d0c0b' : 'rgba(245,240,234,.7)', border: sel ? ACCENT : 'rgba(255,255,255,.12)' };
      });
      const secondaryOptions = (Object.keys(MUSCLE_TARGETS) as Muscle[]).filter(m => m !== f.muscle).map(m => {
        const sel = f.secondary.includes(m);
        return { label: m, toggle: () => actions.toggleFormSecondary(m), bg: sel ? 'oklch(0.65 0.19 35 / 0.2)' : 'rgba(255,255,255,.06)', color: sel ? '#f5f0ea' : 'rgba(245,240,234,.6)', border: sel ? 'oklch(0.65 0.19 35 / 0.6)' : 'rgba(255,255,255,.12)' };
      });
      const equipOptions = EQUIP_CATALOG.map(e => {
        const sel = f.equip.includes(e.v);
        return { label: e.label, toggle: () => actions.toggleFormEquip(e.v), bg: sel ? 'oklch(0.65 0.19 35 / 0.2)' : 'rgba(255,255,255,.06)', color: sel ? '#f5f0ea' : 'rgba(245,240,234,.6)', border: sel ? 'oklch(0.65 0.19 35 / 0.6)' : 'rgba(255,255,255,.12)' };
      });
      return {
        open: true,
        title: f.editingId ? 'Edit Exercise' : 'Add Exercise',
        name: f.name, setName: (v: string) => actions.setExerciseFormField('name', v),
        muscleOptions, secondaryOptions, equipOptions,
        pattern: f.pattern, setPattern: (v: string) => actions.setExerciseFormField('pattern', v),
        compound: f.compound,
        compoundBg: f.compound ? ACCENT : 'rgba(255,255,255,.06)',
        compoundColor: f.compound ? '#0d0c0b' : 'rgba(245,240,234,.6)',
        isolationBg: !f.compound ? ACCENT : 'rgba(255,255,255,.06)',
        isolationColor: !f.compound ? '#0d0c0b' : 'rgba(245,240,234,.6)',
        setCompound: () => actions.setExerciseFormField('compound', true),
        setIsolation: () => actions.setExerciseFormField('compound', false),
        restBase: f.restBase, restText: f.restBase + 's',
        setRest: (v: number) => actions.setExerciseFormField('restBase', v),
        isTime: f.trackingMode === 'time',
        trackingRepsBg: f.trackingMode !== 'time' ? ACCENT : 'rgba(255,255,255,.06)',
        trackingRepsColor: f.trackingMode !== 'time' ? '#0d0c0b' : 'rgba(245,240,234,.6)',
        trackingTimeBg: f.trackingMode === 'time' ? ACCENT : 'rgba(255,255,255,.06)',
        trackingTimeColor: f.trackingMode === 'time' ? '#0d0c0b' : 'rgba(245,240,234,.6)',
        setTrackingReps: () => actions.setExerciseFormField('trackingMode', 'reps'),
        setTrackingTime: () => actions.setExerciseFormField('trackingMode', 'time'),
        rangeLabel: f.trackingMode === 'time' ? 'TIME RANGE (SECONDS)' : 'REP RANGE',
        rangeUnit: f.trackingMode === 'time' ? 'seconds' : 'reps',
        repLo: f.repLo, repHi: f.repHi,
        setRepLo: (v: string) => actions.setExerciseFormField('repLo', v),
        setRepHi: (v: string) => actions.setExerciseFormField('repHi', v),
        cue: f.cue, setCue: (v: string) => actions.setExerciseFormField('cue', v),
        error: f.error,
        showDelete: !!f.editingId && f.editingId in s.customExercises,
        deleteLabel: s.confirmDeleteExId === f.editingId ? 'Confirm Delete?' : 'Delete',
        deleteColor: s.confirmDeleteExId === f.editingId ? ACCENT_TEXT : 'rgba(245,240,234,.4)',
        delete: () => f.editingId && actions.requestDeleteExercise(f.editingId),
        close: actions.closeExerciseForm,
        save: actions.saveExerciseForm,
        saveLabel: f.editingId ? 'Save Changes' : 'Add to Library'
      };
    })(),

    // ---------- exercise history modal (grouped by session date + program day) ----------
    exerciseHistoryModal: (() => {
      const id = s.exerciseHistoryModalId;
      if (!id || !EXLIB[id]) return { open: false };
      const isTime = EXLIB[id].trackingMode === 'time';
      const entries = (s.exerciseHistory[id] || []).slice().reverse();
      return {
        open: true, name: EXLIB[id].name,
        entries: entries.map(e => {
          const sets = e.sets && e.sets.length ? e.sets : [{ weight: e.weight, reps: e.reps }];
          return {
            date: e.date, day: e.day || '',
            sets: sets.map((st, i) => ({ num: i + 1, text: (isTime ? formatSetTime(st.reps) : fmtWeight(st.weight, s.units) + ' × ' + st.reps + ' reps') + (st.rir != null ? ' · RIR ' + st.rir : '') }))
          };
        }),
        empty: entries.length === 0,
        close: actions.closeExerciseHistory
      };
    })(),

    // ---------- Progress tab ----------
    bodyWeight: {
      ...bodyWeightChartData(s),
      inputValue: s.bodyWeightInput,
      setInput: (v: string) => actions.setBodyWeightInput(v),
      log: actions.logBodyWeight,
      unitsLabel: currentUnitsLabel
    },
    volumeChart: volumeChartData(s),
    weeklyHeatmap: weeklyHeatmapData(s, bars),
    exerciseProgress: exerciseProgressData(s, actions.selectExerciseProgress, s.progressMetric),
    progressPickerOpen: !!s.progressPickerOpen,
    toggleProgressPicker: actions.toggleProgressPicker,
    progressMetric: s.progressMetric,
    progressMetricWeightBg: s.progressMetric === 'weight' ? ACCENT : 'rgba(255,255,255,.06)',
    progressMetricWeightColor: s.progressMetric === 'weight' ? '#0d0c0b' : 'rgba(245,240,234,.7)',
    progressMetricE1rmBg: s.progressMetric === 'e1rm' ? ACCENT : 'rgba(255,255,255,.06)',
    progressMetricE1rmColor: s.progressMetric === 'e1rm' ? '#0d0c0b' : 'rgba(245,240,234,.7)',
    setProgressMetricWeight: () => actions.setProgressMetric('weight'),
    setProgressMetricE1rm: () => actions.setProgressMetric('e1rm'),
    compareLifts: compareLiftsData(s, actions.toggleCompareLift, s.progressMetric),
    compareLiftPickerOpen: !!s.compareLiftPickerOpen,
    toggleCompareLiftPicker: actions.toggleCompareLiftPicker,
    consistency: consistencyData(s),
    volumeDonut: volumeDonutData(s),
    durationTrend: durationTrendData(s),
    sessionArchive: s.history.slice(0, 20).map(h => sessionRowVM(h, s, actions)),
    weekReview: (() => {
      const currentWeek = s.weekNumber;
      const weekNums = [...new Set(s.history.map(h => h.weekNumber || 1))];
      if (!weekNums.includes(currentWeek)) weekNums.push(currentWeek);
      weekNums.sort((a, b) => b - a);
      const weeks = weekNums.map(w => ({
        num: w, label: 'Week ' + w, isCurrent: w === currentWeek,
        sessionCount: s.history.filter(h => (h.weekNumber || 1) === w).length,
        select: () => actions.selectReviewWeek(w)
      }));
      const selected = s.weekReviewSelected;
      const sessions = selected != null ? s.history.filter(h => (h.weekNumber || 1) === selected).map(h => sessionRowVM(h, s, actions)) : [];
      return {
        open: !!s.weekReviewOpen, selected, weeks, sessions,
        selectedLabel: selected != null ? 'Week ' + selected : '',
        back: actions.backToWeekList, close: actions.closeWeekReview
      };
    })(),
    archiveDetail: (() => {
      const id = s.archiveDetailId;
      const entry = id ? s.history.find(h => h.id === id) : null;
      if (!entry) return { open: false };
      return {
        open: true, day: entry.day, date: entry.date, weekLabel: 'Week ' + (entry.weekNumber || 1),
        isSkipped: entry.status === 'skipped',
        volume: fmtWeight(entry.volumeKg, s.units), durationText: (entry.durationMin || 0) + ' min',
        exercises: entry.exercises || [],
        close: actions.closeArchiveDetail
      };
    })()
  };
}

export type ViewModel = ReturnType<typeof buildViewModel>;
