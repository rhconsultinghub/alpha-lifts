import { EXLIB, DAY_THEMES, MUSCLES, TRAINING_LABELS, TRAINING_TYPE_DESCS, EQUIP_CATALOG } from '../data/exercises';
import { SPLIT_PRESETS, DAY_TYPE_LABELS, WEEKDAYS } from '../data/wizard';
import { WARMUP_LIBRARY } from '../data/warmups';
import { ACHIEVEMENT_FAMILIES, CATEGORY_LABELS, TOTAL_POSSIBLE_POINTS, TOTAL_TIERS, type AchievementCategory } from '../data/achievements';
import type { AppState, HistoryEntry, Muscle, TrainingType } from '../data/types';
import { COACH_CONFIGURED } from './coach';
import { deloadPlan, activeDeloadPct, backstopFor, DELOAD_BACKSTOP_WEEKS } from './deload';
import type { Actions } from './useApp';
import { ACCENT, ACCENT_TEXT } from '../theme';
import {
  muscleBarsList, dayWarning, recommendation, estimateDayTime, formatDuration,
  warmupInfo, dayMuscleRanks, fmtWeight, weightStep, formatSetTime,
  volumeChartData, weeklyHeatmapData, exerciseProgressData, compareLiftsData, consistencyData,
  volumeDonutData, durationTrendData, warmupForDay, bodyWeightChartData, platesBreakdown, deloadSuggestion,
  effectiveLast, lifetimeVolumeKg, totalTrainingMinutes, completedWorkoutCount, lifetimeReps, lifetimeSets,
  equipVOf, variantHistory, measurementChartData, measurementUnitLabel, MEASUREMENT_TYPES,
  nutritionChartData, nutritionSummary
} from './logic';
import { weightFactoid, timeFactoid } from '../data/factoids';
import { PUSH_CONFIGURED, pushSupported } from './push';
import { SHARE_CONFIGURED, createPlanShareLink } from './share';
import { hapticsSupported } from '../native/haptics';
import { shareWorkoutCard } from '../data/shareCard';
import { seededFrac } from '../data/program';
import { createInitialState } from '../data/initialState';

// Empty-state stand-ins for the Progress tab's analytics when it is NOT the active screen.
// buildViewModel used to compute every chart (volume, heatmap, per-exercise progress across all
// ~151 lifts twice, consistency, donut, trends) on every render regardless of screen — thousands
// of allocations per keystroke while the user was nowhere near the Progress tab. ProgressScreen
// is the only consumer of these fields and only renders when isProgress, so off-screen they can
// be static empties. Built once from a blank AppState so the types match the real builders
// exactly, and cached — the stub itself must not become a per-render cost.
let progressStubsCache: {
  bodyWeightChart: ReturnType<typeof bodyWeightChartData>;
  measurementChart: ReturnType<typeof measurementChartData>;
  nutritionChart: ReturnType<typeof nutritionChartData>;
  volumeChart: ReturnType<typeof volumeChartData>;
  weeklyHeatmap: ReturnType<typeof weeklyHeatmapData>;
  exerciseProgress: ReturnType<typeof exerciseProgressData>;
  compareLifts: ReturnType<typeof compareLiftsData>;
  consistency: ReturnType<typeof consistencyData>;
  volumeDonut: ReturnType<typeof volumeDonutData>;
  durationTrend: ReturnType<typeof durationTrendData>;
} | null = null;
function progressStubs() {
  if (!progressStubsCache) {
    const e = createInitialState();
    const noop = () => {};
    progressStubsCache = {
      bodyWeightChart: bodyWeightChartData(e),
      measurementChart: measurementChartData(e, 'waist'),
      nutritionChart: nutritionChartData(e, 'protein'),
      volumeChart: volumeChartData(e),
      weeklyHeatmap: weeklyHeatmapData(e, muscleBarsList(e)),
      exerciseProgress: exerciseProgressData(e, noop, 'weight'),
      compareLifts: compareLiftsData(e, noop, 'weight'),
      consistency: consistencyData(e),
      volumeDonut: volumeDonutData(e),
      durationTrend: durationTrendData(e)
    };
  }
  return progressStubsCache;
}

// "a", "a and b", "a, b and c" — the deload banner can cite up to three fatigue signals at once,
// and joining them all with " and " reads as a run-on.
function joinReasons(xs: string[]): string {
  if (xs.length <= 1) return xs[0] || '';
  return xs.slice(0, -1).join(', ') + ' and ' + xs[xs.length - 1];
}

export interface ExerciseRowVM {
  id: string;
  name: string;
  muscle: string;
  pattern: string;
  equipLabel: string;
  setsText: string;
  targetText: string;
  openDetail: () => void;
  openQuickEdit: () => void;
  openSwap: () => void;
  reorderTo: (toIdx: number) => void;
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
  const onProgress = s.screen === 'progress';
  const bars = muscleBarsList(s);

  // ---------- who we're talking to ----------
  // First token only — the app addresses the user the way a training partner would, and a stored
  // "Ryan House" shouldn't produce "Hey Ryan House". Empty when no name is known (accounts
  // onboarded before userName existed whose program name didn't yield one, or a cleared Settings
  // field), which every greeting below has to read cleanly without.
  const firstName = (s.userName || '').trim().split(/\s+/)[0] || '';

  // ---------- auto deload weeks (see state/deload.ts) ----------
  // Derived fresh every render like the achievements block below — the plan is a pure function of
  // logged history (plus the backstop's week count), so there's no deload state to keep in sync
  // beyond the user's own choices (enabled/intensity/backstop, and any defer or skip).
  const dPlan = deloadPlan(s);
  const deloadPct = activeDeloadPct(s);

  // ---------- achievements ----------
  // Unlocked/progress state is always recomputed fresh from state.history/exerciseHistory/etc (see
  // data/achievements.ts) — nothing about "which achievements are unlocked" is ever stored, which
  // is what makes this retroactive: a user with months of existing history sees the badges they've
  // already earned the first time this ships, with no migration step. seenAchievementIds is the
  // only bit of achievement-related state that's actually persisted, and it only controls the
  // "NEW" badge, never unlock status itself.
  const achievementsVM = (() => {
    const fmt = (v: number, f: typeof ACHIEVEMENT_FAMILIES[number]) => (f.formatValue ? f.formatValue(v, s) : String(Math.round(v)));
    const items = ACHIEVEMENT_FAMILIES.map(f => {
      const current = f.metric(s);
      const thresholds = f.tiers.map(t => (typeof t.threshold === 'function' ? t.threshold(s) : t.threshold));
      // highest tier whose threshold is met; -1 if none reached yet.
      let reached = -1;
      for (let k = 0; k < thresholds.length; k++) if (current >= thresholds[k]) reached = k;
      const maxed = reached === f.tiers.length - 1;
      const unlocked = reached >= 0;
      const earnedPoints = f.tiers.slice(0, reached + 1).reduce((sum, t) => sum + t.points, 0);
      const familyPoints = f.tiers.reduce((sum, t) => sum + t.points, 0);
      const curTier = reached >= 0 ? f.tiers[reached] : null;
      const nextTier = maxed ? null : f.tiers[reached + 1];
      const nextThreshold = maxed ? thresholds[thresholds.length - 1] : thresholds[reached + 1];
      const prevThreshold = reached >= 0 ? thresholds[reached] : 0;
      // progress bar spans the current tier's floor -> next tier's threshold, so it visibly refills
      // each time a tier is cleared rather than creeping ever-slower toward one far target.
      const span = nextThreshold - prevThreshold;
      const progressPct = maxed ? 100 : Math.max(0, Math.min(100, Math.round(((current - prevThreshold) / (span || 1)) * 100)));
      // singularize the noun when the target is exactly 1 ("1 PR", not "1 PRs"); "in a row" is
      // invariant so it's left alone.
      const dispNoun = f.noun && nextThreshold === 1 && f.noun !== 'in a row' ? f.noun.replace(/s$/, '') : f.noun;
      const nounSuffix = dispNoun ? ' ' + dispNoun : '';
      const progressLabel = maxed
        ? `All ${f.tiers.length} tiers complete`
        : `${fmt(Math.min(current, nextThreshold), f)} / ${fmt(nextThreshold, f)}${nounSuffix}`;
      // NEW badge tracks the *current* tier: seen ids are `${familyId}:${tierIndex}` so unlocking a
      // fresh tier re-lights it even though earlier tiers of the same family were already seen.
      const seenId = `${f.id}:${reached}`;
      return {
        id: f.id, title: f.title, category: f.category, icon: f.icon,
        unlocked, maxed,
        tierName: curTier ? curTier.name : f.tiers[0].name,
        tierText: unlocked ? `Tier ${reached + 1} / ${f.tiers.length}` : `0 / ${f.tiers.length}`,
        nextName: nextTier ? nextTier.name : '',
        description: maxed
          ? `Maxed out — ${fmt(nextThreshold, f)}${nounSuffix}.`
          : (unlocked ? `Next: ${nextTier!.name} at ${fmt(nextThreshold, f)}${nounSuffix}.` : `Reach ${fmt(nextThreshold, f)}${nounSuffix} to unlock.`),
        progressPct, progressLabel,
        earnedPoints, familyPoints, nextPoints: nextTier ? nextTier.points : 0,
        // points for the tier currently held (not the family total) — what a freshly-cleared badge
        // is worth on its own, used by the Complete screen's "+X" readout.
        tierPoints: curTier ? curTier.points : 0,
        reachedTiers: reached + 1, totalTiers: f.tiers.length,
        isNew: unlocked && !s.seenAchievementIds.includes(seenId)
      };
    });
    const categories = (Object.keys(CATEGORY_LABELS) as AchievementCategory[]).map(cat => ({
      key: cat, label: CATEGORY_LABELS[cat], items: items.filter(i => i.category === cat)
    }));
    // mark the current tier of every unlocked family as seen.
    const seenIds = items.filter(i => i.unlocked).map(i => `${i.id}:${i.reachedTiers - 1}`);
    return {
      categories,
      totalPoints: items.reduce((sum, i) => sum + i.earnedPoints, 0),
      totalPossiblePoints: TOTAL_POSSIBLE_POINTS,
      tiersEarned: items.reduce((sum, i) => sum + i.reachedTiers, 0),
      totalTiers: TOTAL_TIERS,
      unlockedCount: items.filter(i => i.unlocked).length,
      totalCount: items.length,
      // Surfaced on the workout Complete screen so clearing a tier actually lands in the moment,
      // rather than only being discoverable by going looking for it. Not marked seen there on
      // purpose — the Achievements tab should still flag them if the user skimmed past.
      newlyUnlocked: items.filter(i => i.isNew),
      markSeen: () => actions.markAchievementsSeen(seenIds)
    };
  })();

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
    // Raw (untrimmed) so the field behaves like a normal text input mid-typing; every consumer
    // trims for itself. Editable outside the ACCOUNT block on purpose — the name is local state,
    // not an account field, and a signed-out user should still be able to set it.
    userName: s.userName || '',
    setUserName: (v: string) => actions.setUserName(v),
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
    deload: {
      enabled: s.deloadEnabled,
      toggle: () => actions.setDeloadEnabled(!s.deloadEnabled),
      desc: 'Watches your training for signs you need a lighter week — lifts gone flat, sets ending at failure, session volume sliding — and proposes one when they show up, not on a fixed schedule. Weights drop; sets and reps stay the same. Nothing happens without showing up on the Program screen first.',
      // "Auto" is the default and follows the program's training type, since that's what actually
      // determines how fast fatigue accumulates — a pinned number is for someone who already knows
      // their own recovery. Options start at 6 rather than 3: anything shorter is a schedule
      // wearing a backstop's name, and would fire before the signals ever got a chance to.
      // Highlight against the *effective* backstop, not the raw stored number: a value pinned back
      // when this was a cadence (3/4/5) is clamped up by backstopFor(), and matching on the raw
      // field would leave those users looking at a picker with nothing selected.
      cadenceOptions: ([null, 6, 8, 10, 12] as const).map(v => {
        const selected = s.deloadCadenceWeeks === null ? v === null : v === backstopFor(s);
        return {
          label: v === null ? 'Auto' : v + ' wks',
          select: () => actions.setDeloadCadence(v),
          bg: selected ? ACCENT : 'rgba(255,255,255,.06)',
          color: selected ? '#0d0c0b' : 'rgba(245,240,234,.7)'
        };
      }),
      cadenceDesc: 'A safety net for when nothing trips: the longest you’ll go with no deload at all. Auto uses your training type — '
        + TRAINING_LABELS[s.trainingType] + ' caps at ' + DELOAD_BACKSTOP_WEEKS[s.trainingType] + ' weeks.',
      intensityOptions: ([50, 60, 70, 80] as const).map(v => ({
        label: v + '%',
        select: () => actions.setDeloadIntensity(v),
        bg: s.deloadIntensityPct === v ? ACCENT : 'rgba(255,255,255,.06)',
        color: s.deloadIntensityPct === v ? '#0d0c0b' : 'rgba(245,240,234,.7)'
      })),
      intensityDesc: 'What percentage of your usual working weight to lift during a deload week.',
      // No countdown here any more — there's nothing honest to count down to. What the user wants
      // to know in a normal week is what the app is currently seeing in their training, so that's
      // what this says, with the backstop mentioned only as the far edge.
      statusText: !s.deloadEnabled ? ''
        : dPlan.isActive ? 'Deload week in progress — targets at ' + Math.round(dPlan.pct * 100) + '%.'
        : dPlan.isDue ? 'A deload is recommended now — ' + joinReasons(dPlan.reasons) + '.'
        : dPlan.suppressed ? 'Holding off for now' + (dPlan.lastDeloadWeek ? ' after your week ' + dPlan.lastDeloadWeek + ' deload' : '') + ' — watching again from week ' + dPlan.watchingFromWeek + '.'
        : dPlan.fatigue.reasons.length ? 'Watching — ' + joinReasons(dPlan.fatigue.reasons) + ', not enough on its own to call a deload yet.'
        : 'Nothing flagging right now. Safety net at week ' + dPlan.backstopWeek + ' if nothing trips before then'
          + (dPlan.lastDeloadWeek ? '. Last deload was week ' + dPlan.lastDeloadWeek + '.' : '.'),
      backstopInUse: backstopFor(s),
      canStart: s.deloadEnabled && !dPlan.isActive,
      isActive: dPlan.isActive,
      start: actions.startDeloadNow,
      end: actions.endDeloadNow
    },
    restAlertSound: s.restAlertSound,
    restAlertVibrate: s.restAlertVibrate,
    restAlertNotify: s.restAlertNotify,
    // Some platforms don't expose the Vibration API at all (notably iOS, in every browser including
    // an installed PWA), where the Vibrate toggle would be a switch wired to nothing. Detect it and
    // say so rather than letting the setting quietly lie. The native shell always has haptics.
    vibrationSupported: hapticsSupported(),
    toggleRestAlertSound: () => actions.setRestAlertSound(!s.restAlertSound),
    toggleRestAlertVibrate: () => actions.setRestAlertVibrate(!s.restAlertVibrate),
    toggleRestAlertNotify: () => actions.setRestAlertNotify(!s.restAlertNotify),
    exportBackup: actions.exportBackup,
    // Set-by-set history CSV for spreadsheets/coaches — only useful once something is logged.
    exportHistoryCsv: actions.exportHistoryCsv,
    hasHistoryToExport: s.history.some(h => h.status === 'completed'),
    pendingBackupImport: !!s.pendingBackupImport,
    confirmBackupImport: actions.confirmBackupImport,
    cancelBackupImport: actions.cancelBackupImport,
    stageBackupImport: actions.stageBackupImport,
    // Workout-plan (program) import/export
    exportPlan: actions.exportPlan,
    // Share the active plan as a link (needs the Worker + a signed-in session; the token check
    // happens inside createPlanShareLink so the error message can say why).
    sharePlanAvailable: SHARE_CONFIGURED,
    createShareLink: () => createPlanShareLink(s),
    pendingPlanImport: !!s.pendingPlanImport,
    planImportName: s.pendingPlanImport?.name || '',
    confirmPlanImport: actions.confirmPlanImport,
    cancelPlanImport: actions.cancelPlanImport,
    stagePlanImport: actions.stagePlanImport,
    parsePlanText: actions.parsePlanText,
    // AI paste-to-parse is a Pro feature and needs the coach Worker configured.
    aiParseAvailable: COACH_CONFIGURED && s.coachEntitlement === 'entitled',
    confirmResetApp: s.confirmResetApp,
    requestResetApp: actions.requestResetApp,
    cancelResetApp: actions.cancelResetApp,
    resetApp: actions.resetApp,
    remindersEnabled: s.remindersEnabled,
    reminderTime: s.reminderTime,
    reminderPermissionDenied: typeof Notification !== 'undefined' && Notification.permission === 'denied',
    toggleReminders: () => actions.setRemindersEnabled(!s.remindersEnabled),
    // Cloud (Web Push) reminders — offered only when the Worker is configured; per-device.
    pushRemindersAvailable: PUSH_CONFIGURED && pushSupported(),
    pushRemindersEnabled: !!s.pushRemindersEnabled,
    togglePushReminders: () => { void actions.setPushReminders(!s.pushRemindersEnabled); },
    pushSetupNotice: s.pushSetupNotice || null,
    setReminderTime: (v: string) => actions.setReminderTime(v)
  };

  const newProgramWizard = (() => {
    const w = s.newProgramWizard;
    if (!w) return { open: false as const };
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
      open: true as const, name: w.name, setName: (v: string) => actions.setWizardField('name', v),
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

  // ---------- edit week (permanent day-structure editing) ----------
  // Same row shape the New Program wizard's custom-day editor uses (see wizardVM below) — the two
  // are deliberately the same control, one building a program and one editing the live plan.
  const editWeek = (() => {
    const rows = s.dayOrder.map((key, i) => {
      const day = s.program[key];
      const isRest = (day.kind || 'training') === 'rest';
      const exCount = (day.exercises || []).length;
      return {
        key,
        label: day.label,
        dow: day.dow,
        isRest,
        // Shown on a rest day that still has exercises parked on it, so it's clear they're kept
        // rather than lost and that flipping back restores the day.
        keptNote: isRest && exCount ? `${exCount} exercise${exCount === 1 ? '' : 's'} kept` : '',
        subtitle: isRest ? 'Rest day' : `${exCount} exercise${exCount === 1 ? '' : 's'}`,
        trainingBg: !isRest ? ACCENT : 'rgba(255,255,255,.06)',
        trainingColor: !isRest ? '#0d0c0b' : 'rgba(245,240,234,.6)',
        restBg: isRest ? ACCENT : 'rgba(255,255,255,.06)',
        restColor: isRest ? '#0d0c0b' : 'rgba(245,240,234,.6)',
        setTraining: () => actions.setDayKind(key, 'training'),
        setRest: () => actions.setDayKind(key, 'rest'),
        setLabel: (v: string) => actions.renameDay(key, v),
        canMoveUp: i > 0,
        canMoveDown: i < s.dayOrder.length - 1,
        moveUp: () => actions.moveProgramDay(key, 'up'),
        moveDown: () => actions.moveProgramDay(key, 'down'),
        // The last remaining day can't go, and neither can the one a workout is live on.
        canRemove: s.dayOrder.length > 1 && !(s.workout && s.workout.dayKey === key),
        remove: () => actions.requestRemoveProgramDay(key)
      };
    });
    const pending = s.confirmRemoveDayKey ? s.program[s.confirmRemoveDayKey] : null;
    return {
      open: !!s.editWeekOpen,
      close: actions.closeEditWeek,
      rows,
      addDay: actions.addProgramDay,
      // One row per weekday and no more — see addProgramDay for why an 8th day can't be given a
      // sane `dow`.
      canAddDay: s.dayOrder.length < WEEKDAYS.length,
      note: 'Weekdays follow the order below — reorder a day and its weekday moves with it.',
      fullNote: 'A plan covers one week, so seven days is the maximum. Make a day a rest day instead of adding another.',
      confirmRemove: pending
        ? {
            show: true,
            label: pending.label,
            exCount: (pending.exercises || []).length,
            confirm: actions.confirmRemoveProgramDay,
            cancel: actions.cancelRemoveProgramDay
          }
        : { show: false }
    };
  })();

  // ---------- day view ----------
  // Named builder + inferred return type (was `let currentDay: any` assigned in an if-block —
  // the single biggest source of the `as any` casts components used to need).
  const buildCurrentDay = () => {
    if (!s.activeDayKey) return null;
    const dayKey = s.activeDayKey;
    const day = s.program[dayKey];
    const w = dayWarning(s, dayKey, bars);
    const ranks = dayMuscleRanks(s, dayKey);
    let balanceTip: { show: boolean; text?: string; ctaLabel?: string; swap?: () => void } = { show: false };
    const daySums: Record<string, number[]> = {};
    day.exercises.forEach((ex, i) => { const m = EXLIB[ex.id].muscle; (daySums[m] = daySums[m] || []).push(i); });
    const dominantEntry = Object.entries(daySums).find(([, idxs]) => idxs.length >= 2);
    if (dominantEntry) {
      const [domMuscle, idxs] = dominantEntry;
      const theme = day.theme || DAY_THEMES[dayKey] || [];
      const underBar = bars.filter(b => b.status === 'under' && b.name !== domMuscle && theme.includes(b.name as Muscle)).sort((a, b) => (a.sets - a.mev) - (b.sets - b.mev))[0];
      if (underBar) {
        const exA = day.exercises[idxs[0]], exB = day.exercises[idxs[1]];
        balanceTip = {
          show: true,
          text: EXLIB[exB.id].name + ' targets ' + domMuscle + ' just like ' + EXLIB[exA.id].name + '. ' + underBar.name + ' is below its ' + underBar.rangeText + ' set range — consider swapping it in instead.',
          ctaLabel: 'Swap for ' + underBar.name,
          swap: () => actions.openSwap(dayKey, idxs[1], 'replace', false)
        };
      }
    }

    return {
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
        const r = recommendation(ex, s.units, s.coachVoice, s.exerciseHistory[ex.id], s.exerciseHistory, deloadPct, s.trainingType);
        const isTime = lib.trackingMode === 'time';
        return {
          id: ex.id, name: lib.name, muscle: lib.muscle, pattern: lib.pattern, equipLabel: equip.label,
          setsText: ex.sets + ' × ' + (isTime ? formatSetTime(lib.repLo) + '-' + formatSetTime(lib.repHi) : lib.repLo + '-' + lib.repHi),
          targetText: r.weight > 0 ? fmtWeight(r.weight, s.units) : isTime ? formatSetTime(r.reps) : r.reps + ' reps',
          openDetail: () => actions.openDetail(dayKey, i),
          openQuickEdit: () => actions.openQuickEdit(dayKey, i),
          openSwap: () => actions.openSwap(dayKey, i, 'equip', false),
          reorderTo: (toIdx: number) => actions.reorderExercise(dayKey, i, toIdx),
          supersetBadge: !!ex.supersetGroup
        } as ExerciseRowVM;
      })
    };
  };
  const currentDay = buildCurrentDay();

  // ---------- day builder ----------
  const buildBuilderExercises = () => {
    if (!s.activeDayKey) return [];
    const dayKey = s.activeDayKey;
    const day = s.program[dayKey];
    return day.exercises.map((ex, i) => {
      const lib = EXLIB[ex.id];
      const equip = lib.equip[ex.equipIdx];
      const prev = day.exercises[i - 1];
      const next = day.exercises[i + 1];
      const isLinkedToPrev = !!(ex.supersetGroup && prev && ex.supersetGroup === prev.supersetGroup);
      const isLinkedToNext = !!(ex.supersetGroup && next && ex.supersetGroup === next.supersetGroup);
      // linked to something other than the immediate neighbor shown by the Prev/Next pills — call
      // it out by name so re-linking via those pills doesn't silently steal the exercise away from
      // a pairing the user can't otherwise see from this row.
      const elsewherePartner = (ex.supersetGroup && !isLinkedToPrev && !isLinkedToNext)
        ? day.exercises.find((e, k) => k !== i && e.supersetGroup === ex.supersetGroup)
        : null;
      return {
        id: ex.id, name: lib.name, muscle: lib.muscle, equipLabel: equip.label, sets: ex.sets,
        repText: lib.trackingMode === 'time' ? formatSetTime(lib.repLo) + '-' + formatSetTime(lib.repHi) + ' hold' : lib.repLo + '-' + lib.repHi + ' reps',
        decSets: () => actions.changeSets(dayKey, i, -1),
        incSets: () => actions.changeSets(dayKey, i, 1),
        // Tap-twice: first ✕ arms the confirm (removePending flips the button to "Confirm?"),
        // second executes. Permanent plan edit — see requestRemoveBuilderExercise.
        remove: () => actions.requestRemoveBuilderExercise(dayKey, i),
        removePending: s.confirmRemoveBuilderIdx === i,
        canMoveUp: i > 0,
        moveUp: () => actions.moveExercise(dayKey, i, 'up'),
        canMoveDown: i < day.exercises.length - 1,
        moveDown: () => actions.moveExercise(dayKey, i, 'down'),
        openDetail: () => actions.openDetail(dayKey, i),
        openEquip: () => actions.openSwap(dayKey, i, 'equip', false),
        openReplace: () => actions.openSwap(dayKey, i, 'replace', false),
        canLinkPrev: !!prev,
        isLinkedToPrev,
        toggleLinkPrev: () => actions.toggleSuperset(dayKey, i - 1, i),
        canLinkNext: !!next,
        isLinkedToNext,
        toggleLinkNext: () => actions.toggleSuperset(dayKey, i, i + 1),
        linkedElsewhereName: elsewherePartner ? EXLIB[elsewherePartner.id].name : null
      };
    });
  };
  const builderExercises = buildBuilderExercises();

  // ---------- workout ----------
  const buildWorkout = () => {
    if (!s.workout) return null;
    const dayKey = s.workout.dayKey;
    const dayExercises = s.workout.dayExercises;
    const exIndex = s.workout.exIndex;
    const ex = dayExercises[exIndex];
    const lib = EXLIB[ex.id];
    const equip = lib.equip[ex.equipIdx];
    // Scope "last time" set breakdown to the tool this slot is set to, matching effectiveLast()/
    // recommendation() — a barbell session isn't the reference for a dumbbell slot.
    const exHistory = variantHistory(s.exerciseHistory[ex.id], equipVOf(ex));
    const rec = recommendation(ex, s.units, s.coachVoice, exHistory, s.exerciseHistory, deloadPct, s.trainingType);
    const currentSets = s.workout.exSets[exIndex] || [];
    // Warm-ups ramp to the heaviest set the user is actually about to do this session (their edited
    // working weight if they've changed it, otherwise today's recommendation) — not last session's.
    const workingWeight = currentSets.length ? Math.max(...currentSets.map(r => r.weight)) : rec.weight;
    const warmupRaw = warmupInfo(ex, s.warmupStyle, workingWeight);
    const warmupAdded = currentSets.some(r => r.warmup);
    const warmup = warmupRaw ? {
      show: true, note: warmupRaw.note,
      setsText: warmupRaw.sets.map(ws => fmtWeight(ws.weight, s.units) + ' × ' + ws.reps).join('  ·  '),
      // One-tap: turn the advisory ramp into loggable rows above the working sets (once).
      added: warmupAdded,
      logSets: () => actions.addWarmupSets(warmupRaw.sets)
    } : { show: false, added: false, logSets: () => {} };
    const allDone = currentSets.length > 0 && currentSets.every(r => r.done);
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
    // Circuit banner: every OTHER member of this exercise's group, in day order. One partner
    // reads "Paired with X"; more read "Circuit with X + Y".
    const supersetMemberNames = ex.supersetGroup
      ? dayExercises.filter((e2, i2) => i2 !== exIndex && e2.supersetGroup === ex.supersetGroup).map(e2 => EXLIB[e2.id].name)
      : [];
    const supersetPartnerName = supersetMemberNames.length ? supersetMemberNames.join(' + ') : null;
    const supersetIsCircuit = supersetMemberNames.length > 1;

    return {
      progressText: 'Exercise ' + (exIndex + 1) + ' of ' + dayExercises.length,
      // Raw timestamp — the live elapsed clock is derived in the component via useElapsedText,
      // so ticking it re-renders only that leaf instead of rebuilding this whole view model.
      startedAt: s.workout.startedAt || null,
      navList, workoutAllDone, supersetPartnerName, supersetIsCircuit,
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
      removeExercise: () => actions.requestRemoveWorkoutExercise(exIndex),
      canMoveUp: exIndex > 0,
      moveUp: () => actions.moveWorkoutExercise('up'),
      canMoveDown: exIndex < dayExercises.length - 1,
      moveDown: () => actions.moveWorkoutExercise('down'),
      resting: s.workout.resting,
      // Raw countdown inputs — RestToast/WorkoutScreen derive the live "1:27" via useRestClock.
      restEndAt: s.workout.restEndAt ?? null,
      restTotal: s.workout.restTotal,
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
      sets: (() => {
        // same cross-day preference as effectiveLast()/recommendation() above: the most recent
        // logged session for this exercise, regardless of which program day it was done on, beats
        // this slot's own (possibly stale) lastSets.
        const latestHistoryEntry = exHistory && exHistory.length ? exHistory[exHistory.length - 1] : null;
        // Never-logged exercise: the final `ex.last` fallback below is placeholder data (weight 0)
        // for a fresh program slot, so showing it as "Last time: 0 lb × 6" invents a session that
        // never happened. Suppress the per-set last-time line entirely in that case, matching the
        // first-time messaging recommendation() now shows instead of a progressive-overload prompt.
        const neverLogged = !ex.manualTarget && !latestHistoryEntry && !(ex.lastSets && ex.lastSets.length);
        const lastSetsArr = neverLogged ? [] : (latestHistoryEntry && latestHistoryEntry.sets && latestHistoryEntry.sets.length)
          ? latestHistoryEntry.sets
          : (ex.lastSets && ex.lastSets.length) ? ex.lastSets : (ex.last ? Array(ex.sets).fill({ weight: ex.last.weight, reps: ex.last.reps }) : []);
        let warmupNum = 0, workingNum = 0;
        return currentSets.map((row, i) => {
        const isTime = lib.trackingMode === 'time';
        const isWarmup = row.warmup === true;
        const label = isWarmup ? 'Warm-up ' + (++warmupNum) : 'Set ' + (++workingNum);
        const step = weightStep(s.units);
        const dispWeight = s.units === 'lb' ? Math.round((row.weight * 2.20462) / 5) * 5 : Math.round(row.weight * 2) / 2;
        const plates = equip.v === 'barbell' ? platesBreakdown(dispWeight, s.units) : null;
        const platesText = plates ? plates.join(' + ') + ' per side' : '';
        // "Last time" is a working-set reference — meaningless on a warm-up row. Indexed by the
        // WORKING-set ordinal (not the raw row index), since warm-up rows sit above and would
        // otherwise shift every working set onto the wrong prior set.
        const lastRow = isWarmup ? undefined : lastSetsArr[workingNum - 1] || lastSetsArr[lastSetsArr.length - 1];
        const setType = isWarmup ? undefined : row.setType;
        return {
          num: i + 1,
          label,
          isWarmup,
          isTime,
          // Drop/AMRAP badge pill: tap cycles Normal → Drop → AMRAP → Normal. Hidden on warm-ups
          // and time-tracked exercises (an AMRAP plank is just a max hold; drops don't apply).
          setTypeLabel: setType === 'drop' ? 'DROP' : setType === 'amrap' ? 'AMRAP' : 'SET TYPE',
          setTypeActive: setType != null,
          canCycleType: !isWarmup && !isTime,
          cycleType: () => actions.cycleSetType(i),
          targetText: isWarmup
            ? 'ramp — doesn’t count toward stats'
            : setType === 'amrap'
            ? 'as many reps as possible'
            : setType === 'drop'
            ? 'drop the weight, no rest before this set'
            : isTime ? formatSetTime(lib.repLo) + '-' + formatSetTime(lib.repHi) : lib.repLo + '-' + lib.repHi + ' reps',
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
          // Warm-up rows carry the same blue tint as the warm-up card so they read as the ramp,
          // not more working sets.
          cardBg: row.done ? 'oklch(0.7 0.15 145 / 0.07)' : isWarmup ? 'oklch(0.7 0.13 230 / 0.07)' : 'rgba(255,255,255,.045)',
          cardBorder: row.done ? 'oklch(0.7 0.15 145 / 0.35)' : isWarmup ? 'oklch(0.7 0.13 230 / 0.3)' : 'rgba(255,255,255,.06)',
          platesText,
          rirOptions: [0, 1, 2, 3, 4].map(v => ({
            v, label: v === 4 ? '4+' : String(v), sel: row.rir === v,
            bg: row.rir === v ? ACCENT : 'rgba(255,255,255,.07)',
            color: row.rir === v ? '#0d0c0b' : 'rgba(245,240,234,.55)',
            select: () => actions.setSetRir(i, v)
          }))
        };
        });
      })()
    };
  };
  const workout = buildWorkout();

  // ---------- detail overlay ----------
  const buildDetail = () => {
    if (!s.detail) return { open: false as const };
    const dayKey = s.detail.dayKey;
    const inSession = s.workout && s.workout.dayKey === dayKey;
    const ex = inSession ? s.workout!.dayExercises[s.detail.exIndex] : s.program[dayKey].exercises[s.detail.exIndex];
    if (!ex) return { open: false as const };
    const lib = EXLIB[ex.id];
    const equip = lib.equip[ex.equipIdx];
    return {
      open: true as const, id: ex.id, name: lib.name, muscle: lib.muscle, pattern: lib.pattern, equipLabel: equip.label, cue: lib.cue,
      videoId: lib.videoId,
      secondaryText: lib.secondary.length ? lib.secondary.join(', ') : 'None',
      close: actions.closeDetail,
      openSwap: () => { actions.closeDetail(); actions.openSwap(dayKey, s.detail!.exIndex, 'equip', false); }
    };
  };
  const detail = buildDetail();

  // ---------- Day View quick-edit modal (weight/reps/sets/equip) ----------
  // Program-plan-only (not usable mid-workout, where the same fields are already editable per-set
  // via the working-set steppers on WorkoutScreen) — so this always reads/writes s.program
  // directly, unlike `detail` above which also has an in-session variant.
  const buildQuickEdit = () => {
    if (!s.quickEdit) return { open: false as const };
    const { dayKey, exIndex } = s.quickEdit;
    const ex = s.program[dayKey]?.exercises[exIndex];
    if (!ex) return { open: false as const };
    {
      const lib = EXLIB[ex.id];
      const equip = lib.equip[ex.equipIdx];
      const isTime = lib.trackingMode === 'time';
      const isBodyweight = equip.v === 'bodyweight' || equip.v === 'assisted';
      const last = effectiveLast(ex, s.exerciseHistory[ex.id]);
      const step = weightStep(s.units);
      const dispWeight = s.units === 'lb' ? Math.round((last.weight * 2.20462) / 5) * 5 : Math.round(last.weight * 2) / 2;
      const plates = equip.v === 'barbell' ? platesBreakdown(dispWeight, s.units) : null;
      return {
        open: true as const, id: ex.id, name: lib.name, muscle: lib.muscle, equipLabel: equip.label,
        sets: ex.sets, isTime, isBodyweight,
        decSets: () => actions.changeSets(dayKey, exIndex, -1),
        incSets: () => actions.changeSets(dayKey, exIndex, 1),
        weight: dispWeight, reps: last.reps, timeText: formatSetTime(last.reps),
        unitsLabel: s.units.toUpperCase(),
        decWeight: () => actions.bumpExerciseTarget(dayKey, exIndex, 'weight', -step),
        incWeight: () => actions.bumpExerciseTarget(dayKey, exIndex, 'weight', step),
        setWeight: (v: number) => actions.setExerciseTarget(dayKey, exIndex, 'weight', s.units === 'lb' ? v / 2.20462 : v),
        decReps: () => actions.bumpExerciseTarget(dayKey, exIndex, 'reps', isTime ? -5 : -1),
        incReps: () => actions.bumpExerciseTarget(dayKey, exIndex, 'reps', isTime ? 5 : 1),
        setReps: (v: number) => actions.setExerciseTarget(dayKey, exIndex, 'reps', v),
        platesText: plates ? plates.join(' + ') + ' per side' : '',
        openEquip: () => { actions.closeQuickEdit(); actions.openSwap(dayKey, exIndex, 'equip', false); },
        openInfo: () => { actions.closeQuickEdit(); actions.openDetail(dayKey, exIndex); },
        close: actions.closeQuickEdit
      };
    }
  };
  const quickEdit = buildQuickEdit();

  // ---------- swap modal ----------
  const buildSwap = () => {
    if (!s.swap) return { open: false as const };
    const dayKey = s.swap.dayKey;
    const inSession = !!s.workout && s.workout.dayKey === dayKey && !s.swap.isAdd;
    const exercisesArr = inSession ? s.workout!.dayExercises : s.program[dayKey].exercises;
    const isAdd = s.swap.isAdd;
    const currentEx = isAdd ? null : exercisesArr[s.swap.exIndex];
    const currentLib = currentEx ? EXLIB[currentEx.id] : null;
    const tab = isAdd ? 'replace' : s.swap.tab;
    const theme = s.program[dayKey]?.theme || DAY_THEMES[dayKey] || (MUSCLES);

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
    // search matches by exercise name or muscle (e.g. typing "row" finds every row variant,
    // typing "chest" finds every chest exercise) — filters within the existing variant/same-
    // muscle/other-muscle groupings rather than replacing them.
    const swapQuery = (s.swap.query || '').trim().toLowerCase();
    const matchesSwapQuery = (id: string) => {
      if (!swapQuery) return true;
      const lib = EXLIB[id];
      return lib.name.toLowerCase().includes(swapQuery) || lib.muscle.toLowerCase().includes(swapQuery);
    };
    // a search query overrides the day-theme restriction entirely — typing "squat" on a Chest day
    // should still find Squat, since the whole point of a search box is to reach exercises the
    // default theme-scoped browse view deliberately hides. No query = same theme-scoped behavior
    // as before.
    const allIds = Object.keys(EXLIB).filter(id => id !== excludeId && matchesSwapQuery(id) && (swapQuery ? true : theme.includes(EXLIB[id].muscle)));
    const variantIds = isAdd ? [] : allIds.filter(id => EXLIB[id].pattern === excludePattern);
    const variantOptions = variantIds.map(mkOpt);
    const nonVariantIds = allIds.filter(id => !variantIds.includes(id));
    const replaceSame = isAdd ? [] : nonVariantIds.filter(id => EXLIB[id].muscle === excludeMuscle).map(mkOpt);
    const replaceOther = nonVariantIds.filter(id => isAdd || EXLIB[id].muscle !== excludeMuscle).map(mkOpt);

    const confirmDisabled = isAdd ? !staged : (tab === 'equip' ? s.swap.stagedEquipIdx == null : !staged);

    return {
      open: true as const,
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
      showAll: isAdd || s.swap.showAll || !!swapQuery,
      showAllLabel: s.swap.showAll ? 'Hide other muscle groups' : 'Show all muscle groups',
      toggleAll: actions.swapToggleAll,
      query: s.swap.query || '',
      setQuery: (v: string) => actions.setSwapQuery(v),
      noMatches: !!swapQuery && !variantOptions.length && !replaceSame.length && !replaceOther.length,
      confirmDisabled, confirm: actions.swapConfirm,
      confirmBg: confirmDisabled ? 'rgba(255,255,255,.15)' : ACCENT,
      confirmLabel: isAdd ? 'Add to Day' : (tab === 'equip' ? 'Confirm Equipment Change' : 'Confirm Exercise Swap')
    };
  };
  const swap = buildSwap();

  // ---------- muscle drill-down quick "switch exercise" (can span multiple days) ----------
  const buildMuscleSwap = () => {
    if (!s.muscleSwap) return { open: false as const };
    const ms = s.muscleSwap;
    const currentLib = EXLIB[ms.exId];
    // union of every applicable day's theme, so the replacement list stays valid no matter which
    // of the affected days end up selected.
    const theme = new Set<Muscle>();
    ms.dayKeys.forEach(k => (s.program[k]?.theme || DAY_THEMES[k] || (MUSCLES)).forEach(m => theme.add(m)));

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
    const muscleSwapQuery = (ms.query || '').trim().toLowerCase();
    const matchesMuscleSwapQuery = (id: string) => {
      if (!muscleSwapQuery) return true;
      const lib = EXLIB[id];
      return lib.name.toLowerCase().includes(muscleSwapQuery) || lib.muscle.toLowerCase().includes(muscleSwapQuery);
    };
    // same override as SwapModal above: an active search query bypasses the day-theme restriction.
    const allIds = Object.keys(EXLIB).filter(id => id !== ms.exId && matchesMuscleSwapQuery(id) && (muscleSwapQuery ? true : theme.has(EXLIB[id].muscle)));
    const variantIds = allIds.filter(id => EXLIB[id].pattern === currentLib.pattern);
    const variantOptions = variantIds.map(mkOpt);
    const nonVariantIds = allIds.filter(id => !variantIds.includes(id));
    const sameMuscleOptions = nonVariantIds.filter(id => EXLIB[id].muscle === currentLib.muscle).map(mkOpt);
    const otherMuscleOptions = nonVariantIds.filter(id => EXLIB[id].muscle !== currentLib.muscle).map(mkOpt);

    return {
      open: true as const,
      title: 'Switch Exercise',
      exName: currentLib.name,
      close: actions.closeMuscleSwap, backdrop: actions.closeMuscleSwap,
      dayOptions,
      hasVariants: variantOptions.length > 0,
      variantOptions,
      sameMuscleOptions, otherMuscleOptions,
      query: ms.query || '',
      setQuery: (v: string) => actions.muscleSwapSetQuery(v),
      noMatches: !!muscleSwapQuery && !variantOptions.length && !sameMuscleOptions.length && !otherMuscleOptions.length,
      showAll: ms.showAll || !!muscleSwapQuery,
      showAllLabel: ms.showAll ? 'Hide other muscle groups' : 'Show all muscle groups',
      toggleAll: actions.muscleSwapToggleAll,
      confirmDisabled: !staged,
      confirm: actions.muscleSwapConfirm,
      confirmBg: !staged ? 'rgba(255,255,255,.15)' : ACCENT,
      confirmLabel: 'Confirm Exercise Swap'
    };
  };
  const muscleSwap = buildMuscleSwap();

  // ---------- muscle drill ----------
  const muscleDrill = (() => {
    const name = s.muscleDrill;
    if (!name) return { open: false as const };
    const bar = bars.find(b => b.name === name);
    if (!bar) return { open: false as const };
    const rows: { day: string; name: string; sets: number; equip: string; switchExercise: () => void }[] = [];
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
      rec = name + ' is in its target range — no changes needed.';
    }
    const statusLabel = bar.status === 'over' ? 'above range' : bar.status === 'under' ? 'below range' : 'in range';
    return {
      open: true as const, name, color: bar.color, rows, alsoTargets, rec,
      setsText: String(Math.round(bar.sets * 10) / 10), rangeText: bar.rangeText, aim: bar.aim, statusLabel,
    };
  })();

  // ---------- warm-up detail ----------
  const warmupDetail = (() => {
    const id = s.warmupDetailId;
    if (!id) return { open: false as const };
    const move = WARMUP_LIBRARY.find(m => m.id === id);
    if (!move) return { open: false as const };
    return {
      open: true as const, name: move.name, cue: move.cue, howTo: move.howTo, videoId: move.videoId,
      close: actions.closeWarmupDetail
    };
  })();

  const planPrompt = s.pendingPlanUpdate ? {
    show: true,
    text: s.pendingPlanUpdate.changedCount + (s.pendingPlanUpdate.changedCount === 1 ? ' change was' : ' changes were') + ' made to this workout’s exercises (added, removed, reordered, or swapped). Update your plan to use them going forward, or keep this as a one-time change?',
    apply: actions.applyPlanUpdate, discard: actions.discardPlanUpdate
  } : { show: false };

  const completeSubtitle = (() => {
    const label = currentDay ? currentDay.label : (s.activeDayKey ? s.program[s.activeDayKey]?.label : '');
    return label + (firstName ? ` — nice work, ${firstName}.` : ' — nice work.');
  })();

  // Home-screen greeting. Rotates by calendar day rather than per render: a line that changes on
  // every repaint reads as noise, and one fixed line goes stale within a week. Every variant is
  // written to still make sense with no name, since firstName is legitimately empty for accounts
  // that never stored one.
  const homeGreeting = (() => {
    const hour = new Date().getHours();
    const partOfDay = hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening';
    const who = firstName ? `, ${firstName}` : '';
    const lines = [
      `Hey${who} — let’s get to training!`,
      `Good ${partOfDay}${who}. Time to put the work in.`,
      `Let’s go${who} — today’s session is waiting.`,
      `Back at it${who}. Let’s make it count.`
    ];
    return lines[Math.floor(Date.now() / 86400000) % lines.length];
  })();

  // One line above Day View's Start Workout button.
  const startWorkoutHint = firstName ? `Ready when you are, ${firstName}.` : 'Ready when you are.';

  // ---------- fun factoids ----------
  // Cumulative "by the numbers" card on the Progress tab. Day-seeded so the object each comparison
  // picks rotates once a day rather than churning on every repaint — same idiom as homeGreeting.
  const funStats = (() => {
    const daySeed = Math.floor(Date.now() / 86400000);
    const volKg = lifetimeVolumeKg(s);
    const mins = totalTrainingMinutes(s);
    const weight = weightFactoid(volKg, daySeed);
    const time = timeFactoid(mins, daySeed);
    const workouts = completedWorkoutCount(s);
    const reps = lifetimeReps(s);
    const sets = lifetimeSets(s);
    // fmtWeight doesn't group thousands; these lifetime totals get big, so add separators to the
    // leading number ("88185 lb" → "88,185 lb") for the subtitle only.
    const grouped = (t: string) => t.replace(/\d+/, m => Number(m).toLocaleString('en-US'));
    return {
      // Below the smallest object in both tables (a brand-new account) — show a starter line rather
      // than a broken "0.2 house cats".
      hasData: !!(weight || time),
      weight: weight ? { emoji: weight.emoji, text: `You've lifted the equivalent of ${weight.text}`, value: grouped(fmtWeight(volKg, s.units)) } : null,
      time: time ? { emoji: time.emoji, text: `That's ${time.text} of training time`, value: formatDuration(mins * 60) } : null,
      // Plain celebrated totals — a big rep number is satisfying on its own, no object needed.
      totals: `${workouts.toLocaleString('en-US')} workout${workouts === 1 ? '' : 's'} · ${reps.toLocaleString('en-US')} reps · ${sets.toLocaleString('en-US')} sets`,
      starter: 'Log a few workouts and your fun stats start stacking up.'
    };
  })();

  // Per-session factoid on the Complete screen, from the session just appended to history. Seeded by
  // the session id (via seededFrac) so it's fixed for that session rather than re-rolled on every
  // re-render. Falls back volume → time → nothing, so a light bodyweight day omits the line instead
  // of printing something silly.
  const sessionFactoid = (() => {
    const last = s.history[0];
    if (!last || last.status !== 'completed') return null;
    const seed = Math.floor(seededFrac(last.id) * 1000);
    const weight = weightFactoid(last.volumeKg || 0, seed);
    if (weight) return { emoji: weight.emoji, text: `This session moved the equivalent of ${weight.text}.` };
    const time = timeFactoid(last.durationMin || 0, seed);
    if (time) return { emoji: time.emoji, text: `That's about ${time.text} under the bar.` };
    return null;
  })();

  const showResume = !!s.workout && s.screen !== 'workout' && s.screen !== 'complete';
  const resumeText = s.workout ? ('Resume ' + s.program[s.workout.dayKey].label + ' — Exercise ' + (s.workout.exIndex + 1) + ' of ' + s.program[s.workout.dayKey].exercises.length) : '';
  // Raw timestamp for ResumePill/IdleWorkoutToast — the live text derives via useElapsedText.
  const workoutStartedAt = s.workout ? s.workout.startedAt || null : null;

  const confirmRemoveExercise = (() => {
    const idx = s.confirmRemoveExIndex;
    if (idx == null || !s.workout) return { show: false, name: '', loggedSets: 0 };
    const target = s.workout.dayExercises[idx];
    const sets = s.workout.exSets[idx] || [];
    return {
      show: true,
      name: target ? (EXLIB[target.id]?.name || 'this exercise') : 'this exercise',
      loggedSets: sets.filter(r => r.done).length,
      confirm: actions.confirmRemoveWorkoutExercise,
      cancel: actions.cancelRemoveWorkoutExercise
    };
  })();

  // ---------- AI coach ----------
  // Starter prompts for the empty state. The first is program-aware when there's a program to
  // be aware of — a generic list on someone's first launch is less useful than one that names
  // their own training day.
  const firstTrainingDay = s.dayOrder.map(k => s.program[k]).find(d => d && d.kind !== 'rest');
  const coachSuggestions = [
    // No " day" suffix here — preset labels are already "Push Day" / "Leg Day", so appending
    // one produced "How's my Push Day day looking?". Custom labels may not contain "Day", but
    // "How's my Chest looking?" still reads fine, whereas the duplicate never does.
    firstTrainingDay ? `How's my ${firstTrainingDay.label} looking?` : 'How should I structure my first week?',
    'How do I know if my bench press form is right?',
    'How much rest do I need between sets?',
    'What does RIR mean and how do I use it?'
  ];

  const coachVM = {
    configured: COACH_CONFIGURED,
    // Coach is a gated premium feature: when the Worker reports this device isn't entitled, the
    // tab shows a locked/upsell screen instead of the chat. 'unknown' (not yet probed / offline)
    // renders as the chat, since the real send is gated server-side anyway.
    locked: s.coachEntitlement === 'locked',
    refreshEntitlement: actions.refreshCoachEntitlement,
    messages: s.coachMessages.map(m => ({
      id: m.id,
      text: m.content,
      isUser: m.role === 'user',
      isError: !!m.isError,
      // Confirm-and-apply cards for any app changes the coach proposed on this turn. `applicable`
      // is false for a proposal that couldn't be resolved (unknown day/exercise) — the card shows
      // its error instead of an Apply button.
      proposals: (m.proposals || []).map((p, i) => ({
        summary: p.summary,
        error: p.error,
        status: p.status,
        applicable: !p.error && !!p.payload,
        apply: () => actions.applyCoachProposal(m.id, i),
        dismiss: () => actions.dismissCoachProposal(m.id, i)
      })),
      // Drives the "Apply all (N)" shortcut on a turn that proposed several changes. Counts only
      // what's still actionable, so it disappears as cards are resolved individually.
      pendingApplicableCount: (m.proposals || []).filter(p => p.status === 'pending' && !p.error && !!p.payload).length,
      applyAll: () => actions.applyAllCoachProposals(m.id)
    })),
    isEmpty: s.coachMessages.length === 0,
    input: s.coachInput,
    pending: s.coachPending,
    // The send button is dead while a request is in flight or the box is empty; useApp's
    // sendCoachMessage re-checks both, since the Enter key bypasses the button entirely.
    canSend: s.coachInput.trim().length > 0 && !s.coachPending,
    suggestions: coachSuggestions,
    hasMessages: s.coachMessages.length > 0,
    setInput: actions.setCoachInput,
    send: actions.sendCoachMessage,
    clear: actions.clearCoachChat,
    useSuggestion: (text: string) => { actions.setCoachInput(text); }
  };

  const idlePrompt = {
    show: !!s.workout && s.idleWorkoutPrompt,
    exerciseName: s.workout ? (EXLIB[s.workout.dayExercises[s.workout.exIndex]?.id]?.name || '') : '',
    startedAt: workoutStartedAt,
    continueWorkout: actions.continueWorkoutFromIdle,
    endWorkout: actions.endWorkoutFromIdle
  };

  return {
    needsOnboarding: !s.onboarded,
    // Guided onboarding needs just these three: the resolved-choice completion action, plus the
    // current units and their setter (units is picked as one of the first onboarding steps).
    onboarding: {
      finish: actions.finishOnboarding,
      units: s.units,
      setUnits: actions.setUnits
    },
    // First-run app tutorial overlay (shown after the opt-out path, re-openable from Settings).
    showTutorial: !!s.showTutorial,
    dismissTutorial: actions.dismissTutorial,
    openTutorial: actions.openTutorial,
    isProgram: s.screen === 'program',
    isDayView: s.screen === 'dayView',
    isDayBuilder: s.screen === 'dayBuilder',
    isWorkout: s.screen === 'workout',
    isComplete: s.screen === 'complete',
    isProgress: s.screen === 'progress',
    isExercises: s.screen === 'exercises',
    isAchievements: s.screen === 'achievements',
    isCoach: s.screen === 'coach',
    showTabs: ['program', 'progress', 'exercises', 'achievements', 'coach'].includes(s.screen),
    tabProgramColor: s.screen === 'program' ? '#f5f0ea' : 'rgba(245,240,234,.35)',
    tabProgressColor: s.screen === 'progress' ? '#f5f0ea' : 'rgba(245,240,234,.35)',
    tabExercisesColor: s.screen === 'exercises' ? '#f5f0ea' : 'rgba(245,240,234,.35)',
    tabAchievementsColor: s.screen === 'achievements' ? '#f5f0ea' : 'rgba(245,240,234,.35)',
    tabCoachColor: s.screen === 'coach' ? '#f5f0ea' : 'rgba(245,240,234,.35)',
    coach: coachVM,
    achievements: achievementsVM,
    idlePrompt,
    confirmRemoveExercise,
    goProgram: actions.goProgram, goProgress: actions.goProgress, goExercises: actions.goExercises, goAchievements: actions.goAchievements, goCoach: actions.goCoach,
    trainingTypes,
    muscleBars: bars.map(m => ({ ...m, drill: () => actions.openMuscleDrill(m.name) })),
    muscleBalanceCollapsed: s.muscleBalanceCollapsed !== false,
    toggleMuscleBalance: actions.toggleMuscleBalance,
    muscleBalanceSummary: (() => {
      const under = bars.filter(m => m.status === 'under').length;
      const over = bars.filter(m => m.status === 'over').length;
      if (under) return `${under} muscle${under === 1 ? '' : 's'} below range`;
      if (over) return `${over} muscle${over === 1 ? '' : 's'} above range`;
      return 'All muscles on target';
    })(),
    programDays, newProgramWizard,
    deload: (() => {
      const raw = deloadSuggestion(s);
      // The reactive "you look plateaued" banner. Suppressed entirely once scheduled deloads are
      // on: that feature already watches the same plateau signal (fatigueRead() folds
      // deloadSuggestion in) and acts on it, so leaving this up too would mean two banners telling
      // the user the same thing, one of which they can't act on.
      return {
        ...raw,
        show: raw.show && !s.deloadEnabled && s.deloadDismissedWeek !== s.weekNumber,
        dismiss: actions.dismissDeloadSuggestion
      };
    })(),
    // The proactive counterpart. Exactly one of `mode` is rendered by ProgramScreen: 'active' while
    // a deload week is running, 'due' when one is proposed and awaiting a choice, 'none' the rest
    // of the time (the vast majority of weeks — this banner is not a fixture).
    deloadWeek: {
      mode: dPlan.isActive ? 'active' as const : dPlan.isDue ? 'due' as const : 'none' as const,
      pctText: Math.round(dPlan.pct * 100) + '%',
      byTrigger: dPlan.trigger === 'fatigue',
      title: dPlan.isActive
        ? 'Deload week ' + (dPlan.activeWeek ?? s.weekNumber)
        : dPlan.trigger === 'fatigue' ? 'Your training says deload' : 'Time for a deload',
      // The trigger case leads with the evidence rather than a week count — it's the whole point of
      // the change, and "your bench has gone flat" is a reason a lifter can actually check against
      // their own sense of how the block is going.
      text: dPlan.isActive
        ? 'Targets are cut to ' + Math.round(dPlan.pct * 100) + '% of your working weights this week. Keep the sets and reps, drop the load — this is how the next block goes up.'
        : dPlan.trigger === 'fatigue'
          ? joinReasons(dPlan.reasons).replace(/^./, c => c.toUpperCase()) + '. A lighter week at ' + Math.round(dPlan.pct * 100) + '% now beats a stalled month.'
          : 'Nothing’s flagged, but you’ve trained ' + dPlan.weeksSinceLast + ' weeks straight without a deload. Ready for a lighter one at ' + Math.round(dPlan.pct * 100) + '%?',
      start: actions.startDeloadNow,
      end: actions.endDeloadNow,
      defer: actions.deferDeload,
      skip: actions.skipDeload
    },
    currentDay, builderExercises,
    openDayBuilder: actions.openDayBuilder, closeDayBuilder: actions.closeDayBuilder,
    startWorkout: actions.startWorkout, exitWorkout: actions.exitWorkout,
    openAddExercise: () => actions.openSwap(s.activeDayKey || '', -1, 'replace', true),
    workout, detail, quickEdit, swap, muscleSwap, settings, openSettings: actions.openSettings,
    confirmEndEarly: s.confirmEndEarly,
    openBodyModal: actions.openBodyModal, closeBodyModal: actions.closeBodyModal, showBodyModal: s.showBodyModal,
    setBodyView: actions.setBodyView, bodyView: s.bodyView,
    muscleDrill, closeMuscleDrill: actions.closeMuscleDrill,
    warmupDetail,
    planPrompt,
    completeSubtitle,
    // Complete-screen share card: rendered from the just-written history head + the summary rows.
    shareWorkout: () => {
      const h = s.history[0];
      return shareWorkoutCard({
        dayLabel: h?.day || 'Workout',
        dateText: h?.date || '',
        userName: s.userName || undefined,
        volumeText: fmtWeight(h?.volumeKg || 0, s.units),
        durationText: (h?.durationMin || 0) + ' min',
        prCount: (s.completeSummary || []).filter(c => c.isPR).length,
        exercises: (s.completeSummary || []).filter(c => c.badgeText !== 'Skipped').map(c => ({ name: c.name, resultText: c.resultText, isPR: c.isPR }))
      });
    },
    editWeek, openEditWeek: actions.openEditWeek,
    funStats, sessionFactoid,
    firstName, homeGreeting, startWorkoutHint,
    showResume, resumeText, workoutStartedAt, resumeWorkout: actions.resumeWorkout,
    currentUnitsLabel, currentPlanLabel: TRAINING_LABELS[s.trainingType], programName: s.programName,
    renameProgram: (name: string) => actions.renameProgram(name),
    weekNumber: s.weekNumber,
    openWeekReview: actions.openWeekReview,
    completeSummary: s.completeSummary || [],

    // ---------- exercise library ----------
    openAddExerciseForm: actions.openAddExerciseForm,
    exerciseSearchQuery: s.exerciseSearchQuery || '',
    setExerciseSearchQuery: actions.setExerciseSearchQuery,
    // Equipment filter chips: "All" plus one per catalog entry that at least one exercise
    // actually offers — an empty chip (e.g. no kettlebell exercises in the library yet) would
    // only ever produce a "no matches" screen.
    exerciseEquipChips: (() => {
      if (s.screen !== 'exercises') return [];
      const offered = new Set(Object.values(EXLIB).flatMap(lib => lib.equip.map(e => e.v)));
      const active = s.exerciseEquipFilter || null;
      return [
        { v: null as string | null, label: 'All', isActive: active === null, select: () => actions.setExerciseEquipFilter(null) },
        ...EQUIP_CATALOG.filter(o => offered.has(o.v)).map(o => ({
          v: o.v as string | null, label: o.label, isActive: active === o.v,
          select: () => actions.setExerciseEquipFilter(active === o.v ? null : o.v)
        }))
      ];
    })(),
    exerciseLibraryGroups: (() => {
      // Only ExercisesScreen consumes this, and it only renders on the exercises tab — skip the
      // 12-pass walk over the whole library on every other screen's renders.
      if (s.screen !== 'exercises') return [];
      const query = (s.exerciseSearchQuery || '').trim().toLowerCase();
      const equipFilter = s.exerciseEquipFilter || null;
      const matches = (id: string) => {
        const lib = EXLIB[id];
        if (equipFilter && !lib.equip.some(e => e.v === equipFilter)) return false;
        if (!query) return true;
        // name, muscle, or equipment label — typing "dumbbell" finds every dumbbell exercise.
        return lib.name.toLowerCase().includes(query) || lib.muscle.toLowerCase().includes(query)
          || lib.equip.some(e => e.label.toLowerCase().includes(query));
      };
      return (MUSCLES).map(muscle => {
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
      if (!id || !EXLIB[id]) return { open: false as const };
      const lib = EXLIB[id];
      const isCustom = id in s.customExercises;
      return {
        open: true as const, id, name: lib.name, muscle: lib.muscle, pattern: lib.pattern,
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
      if (!f) return { open: false as const };
      const muscleOptions = (MUSCLES).map(m => {
        const sel = m === f.muscle;
        return { label: m, select: () => actions.toggleFormMuscle(m), bg: sel ? ACCENT : 'rgba(255,255,255,.06)', color: sel ? '#0d0c0b' : 'rgba(245,240,234,.7)', border: sel ? ACCENT : 'rgba(255,255,255,.12)' };
      });
      const secondaryOptions = (MUSCLES).filter(m => m !== f.muscle).map(m => {
        const sel = f.secondary.includes(m);
        return { label: m, toggle: () => actions.toggleFormSecondary(m), bg: sel ? 'oklch(0.65 0.19 35 / 0.2)' : 'rgba(255,255,255,.06)', color: sel ? '#f5f0ea' : 'rgba(245,240,234,.6)', border: sel ? 'oklch(0.65 0.19 35 / 0.6)' : 'rgba(255,255,255,.12)' };
      });
      const equipOptions = EQUIP_CATALOG.map(e => {
        const sel = f.equip.includes(e.v);
        return { label: e.label, toggle: () => actions.toggleFormEquip(e.v), bg: sel ? 'oklch(0.65 0.19 35 / 0.2)' : 'rgba(255,255,255,.06)', color: sel ? '#f5f0ea' : 'rgba(245,240,234,.6)', border: sel ? 'oklch(0.65 0.19 35 / 0.6)' : 'rgba(255,255,255,.12)' };
      });
      return {
        open: true as const,
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
      if (!id || !EXLIB[id]) return { open: false as const };
      const isTime = EXLIB[id].trackingMode === 'time';
      const entries = (s.exerciseHistory[id] || []).slice().reverse();
      return {
        open: true as const, name: EXLIB[id].name,
        entries: entries.map(e => {
          const sets = e.sets && e.sets.length ? e.sets : [{ weight: e.weight, reps: e.reps }];
          const equipLabel = e.equip ? (EXLIB[id].equip.find(o => o.v === e.equip)?.label || '') : '';
          return {
            date: e.date, day: e.day || '', equipLabel,
            sets: sets.map((st, i) => ({ num: i + 1, text: (isTime ? formatSetTime(st.reps) : fmtWeight(st.weight, s.units) + ' × ' + st.reps + ' reps') + (st.rir != null ? ' · RIR ' + st.rir : '') }))
          };
        }),
        empty: entries.length === 0,
        close: actions.closeExerciseHistory
      };
    })(),

    // ---------- Progress tab ----------
    // Heavy analytics only when the Progress tab is the active screen (ProgressScreen is their
    // sole consumer); static empty stubs otherwise — see progressStubs() above.
    bodyWeight: {
      ...(onProgress ? bodyWeightChartData(s) : progressStubs().bodyWeightChart),
      inputValue: s.bodyWeightInput,
      setInput: (v: string) => actions.setBodyWeightInput(v),
      log: actions.logBodyWeight,
      unitsLabel: currentUnitsLabel
    },
    nutrition: (() => {
      const metric = s.selectedNutritionMetric === 'calories' ? 'calories' as const : 'protein' as const;
      const summary = onProgress ? nutritionSummary(s) : { daysLogged: 0, avgCalories: null, avgProteinG: null, window: 7 };
      return {
        ...(onProgress ? nutritionChartData(s, metric) : progressStubs().nutritionChart),
        metric,
        metricChips: (['protein', 'calories'] as const).map(m => ({
          key: m, label: m === 'protein' ? 'Protein' : 'Calories', isActive: m === metric,
          select: () => actions.selectNutritionMetric(m)
        })),
        caloriesInput: s.nutritionCaloriesInput || '',
        proteinInput: s.nutritionProteinInput || '',
        setCaloriesInput: actions.setNutritionCaloriesInput,
        setProteinInput: actions.setNutritionProteinInput,
        log: actions.logNutrition,
        summaryText: summary.daysLogged > 0
          ? `Last 7 days: ${summary.daysLogged} logged` +
            (summary.avgCalories != null ? ` · ~${summary.avgCalories} kcal/day` : '') +
            (summary.avgProteinG != null ? ` · ~${summary.avgProteinG} g protein/day` : '')
          : ''
      };
    })(),
    measurements: (() => {
      const type = s.selectedMeasurementType || 'waist';
      return {
        ...(onProgress ? measurementChartData(s, type) : progressStubs().measurementChart),
        typeChips: MEASUREMENT_TYPES.map(t => ({
          key: t.key, label: t.label, isActive: t.key === type,
          select: () => actions.selectMeasurementType(t.key)
        })),
        inputValue: s.measurementInput || '',
        setInput: (v: string) => actions.setMeasurementInput(v),
        log: actions.logMeasurement,
        unitLabel: measurementUnitLabel(s.units),
        typeLabel: MEASUREMENT_TYPES.find(t => t.key === type)?.label || 'Waist'
      };
    })(),
    volumeChart: onProgress ? volumeChartData(s) : progressStubs().volumeChart,
    weeklyHeatmap: onProgress ? weeklyHeatmapData(s, bars) : progressStubs().weeklyHeatmap,
    exerciseProgress: onProgress
      ? exerciseProgressData(s, actions.selectExerciseProgress, s.progressMetric)
      : progressStubs().exerciseProgress,
    progressPickerOpen: !!s.progressPickerOpen,
    toggleProgressPicker: actions.toggleProgressPicker,
    progressMetric: s.progressMetric,
    progressMetricWeightBg: s.progressMetric === 'weight' ? ACCENT : 'rgba(255,255,255,.06)',
    progressMetricWeightColor: s.progressMetric === 'weight' ? '#0d0c0b' : 'rgba(245,240,234,.7)',
    progressMetricE1rmBg: s.progressMetric === 'e1rm' ? ACCENT : 'rgba(255,255,255,.06)',
    progressMetricE1rmColor: s.progressMetric === 'e1rm' ? '#0d0c0b' : 'rgba(245,240,234,.7)',
    setProgressMetricWeight: () => actions.setProgressMetric('weight'),
    setProgressMetricE1rm: () => actions.setProgressMetric('e1rm'),
    compareLifts: onProgress
      ? compareLiftsData(s, actions.toggleCompareLift, s.progressMetric)
      : progressStubs().compareLifts,
    compareLiftPickerOpen: !!s.compareLiftPickerOpen,
    toggleCompareLiftPicker: actions.toggleCompareLiftPicker,
    consistency: onProgress ? consistencyData(s) : progressStubs().consistency,
    volumeDonut: onProgress ? volumeDonutData(s) : progressStubs().volumeDonut,
    durationTrend: onProgress ? durationTrendData(s) : progressStubs().durationTrend,
    sessionArchive: onProgress ? s.history.slice(0, 20).map(h => sessionRowVM(h, s, actions)) : [],
    weekReview: (() => {
      // Only walk history while the modal is actually open — its `open` flag is all the closed
      // state needs.
      if (!s.weekReviewOpen) {
        return {
          open: false, selected: null as number | null, weeks: [] as { num: number; label: string; isCurrent: boolean; sessionCount: number; select: () => void }[],
          sessions: [] as ReturnType<typeof sessionRowVM>[], selectedLabel: '',
          back: actions.backToWeekList, close: actions.closeWeekReview
        };
      }
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
      if (!entry) return { open: false as const };
      return {
        open: true as const, day: entry.day, date: entry.date, weekLabel: 'Week ' + (entry.weekNumber || 1),
        isSkipped: entry.status === 'skipped',
        volume: fmtWeight(entry.volumeKg, s.units), durationText: (entry.durationMin || 0) + ' min',
        exercises: entry.exercises || [],
        close: actions.closeArchiveDetail
      };
    })()
  };
}

export type ViewModel = ReturnType<typeof buildViewModel>;
