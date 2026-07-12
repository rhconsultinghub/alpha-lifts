import { EXLIB, MUSCLE_TARGETS, TRAINING_MULT, TRAINING_LABELS, incrementForEquip, KG_PER_LB_STEP } from '../data/exercises';
import { clamp, roundTo } from '../data/program';
import { WARMUP_LIBRARY, type WarmupMove } from '../data/warmups';
import type { AppState, ProgramDays, ProgramExercise, Muscle, Units, TrainingType, ExerciseHistoryEntry, HistoryEntry } from '../data/types';

export function fmtWeight(kg: number, units: Units): string {
  if (units === 'lb') return Math.round((kg * 2.20462) / 5) * 5 + ' lb';
  return Math.round(kg * 2) / 2 + ' kg';
}

export function weightStep(units: Units): number {
  return units === 'lb' ? KG_PER_LB_STEP : 2.5;
}

// Volume is expressed in "effective sets": each exercise's set count scaled by how its
// current working weight (or, for bodyweight moves, reps) compares to its original baseline.
// So adding sets OR pushing more weight both raise the muscle's tracked volume.
export function muscleVolumes(program: ProgramDays, dayOrder: string[]): Record<string, number> {
  const vols: Record<string, number> = {};
  dayOrder.forEach(k => {
    const day = program[k];
    if (!day) return;
    if ((day.kind || 'training') === 'rest') return;
    if (day.skipped) return;
    day.exercises.forEach((ex, i) => {
      // an exercise not reached/finished in the most recent attempt at this day (workout ended
      // early) contributes nothing this week, even though it's still part of the plan.
      if (day.exercisesDoneMask && day.exercisesDoneMask[i] === false) return;
      const lib = EXLIB[ex.id];
      const equip = lib.equip[ex.equipIdx];
      let mult = 1;
      if (ex.baseline) {
        if (equip.v === 'bodyweight' || equip.v === 'assisted') {
          mult = ex.baseline.reps > 0 ? clamp(ex.last.reps / ex.baseline.reps, 0.7, 1.6) : 1;
        } else if (ex.baseline.weight > 0) {
          mult = clamp(ex.last.weight / ex.baseline.weight, 0.7, 1.6);
        }
      }
      vols[lib.muscle] = (vols[lib.muscle] || 0) + ex.sets * mult;
    });
  });
  return vols;
}

export interface MuscleStatus {
  status: 'over' | 'under' | 'good';
  color: string;
}

export function muscleStatus(pct: number): MuscleStatus {
  if (pct >= 120) return { status: 'over', color: 'oklch(0.72 0.17 35)' };
  if (pct <= 70) return { status: 'under', color: 'oklch(0.72 0.13 230)' };
  return { status: 'good', color: 'oklch(0.7 0.15 145)' };
}

export interface MuscleBar {
  name: string;
  pct: number;
  pctText: string;
  pctClamped: number;
  color: string;
  status: 'over' | 'under' | 'good';
}

export function muscleBarsList(state: AppState): MuscleBar[] {
  const mult = TRAINING_MULT[state.trainingType];
  const vols = muscleVolumes(state.program, state.dayOrder);
  return Object.keys(MUSCLE_TARGETS).map(name => {
    const target = MUSCLE_TARGETS[name as Muscle] * mult;
    const vol = vols[name] || 0;
    const pct = target > 0 ? Math.round((vol / target) * 100) : 0;
    const st = muscleStatus(pct);
    return { name, pct, pctText: pct + '%', pctClamped: Math.min(100, pct), color: st.color, status: st.status };
  });
}

export interface DayWarning {
  level: 'over' | 'under' | 'good';
  color: string;
  text: string;
  bars: MuscleBar[];
}

export function dayWarning(state: AppState, dayKey: string, bars: MuscleBar[]): DayWarning {
  const day = state.program[dayKey];
  const musclesToday = [...new Set(day.exercises.map(ex => EXLIB[ex.id].muscle))];
  const rows = bars.filter(b => musclesToday.includes(b.name as Muscle));
  const overs = rows.filter(r => r.status === 'over').sort((a, b) => b.pct - a.pct);
  const unders = rows.filter(r => r.status === 'under').sort((a, b) => a.pct - b.pct);
  if (overs.length) {
    const o = overs[0];
    let text = o.name + ' is overtrained (' + o.pct + '%) toward its weekly target, counting all your program days.';
    if (unders.length) text += ' ' + unders[0].name + ' is under target (' + unders[0].pct + '%) — consider adding volume.';
    return { level: 'over', color: 'oklch(0.82 0.13 35)', text, bars: rows };
  }
  if (unders.length) {
    return {
      level: 'under', color: 'oklch(0.75 0.13 230)',
      text: unders.map(x => x.name).join(' & ') + ' running under your weekly ' + TRAINING_LABELS[state.trainingType] + ' target, even counting other program days. Consider adding sets.',
      bars: rows
    };
  }
  return { level: 'good', color: '', text: '', bars: rows };
}

export interface Recommendation {
  weight: number;
  reps: number;
  title: string;
  note: string;
}

export function formatSetTime(sec: number): string {
  if (sec >= 60) { const m = Math.floor(sec / 60), s = sec % 60; return m + ':' + String(s).padStart(2, '0'); }
  return sec + 's';
}

export type CoachVoice = 'Direct' | 'Encouraging' | 'Hype';
export type RestPacing = 'Relaxed' | 'Standard' | 'Aggressive';
export type WarmupStyle = 'Minimal' | 'Standard' | 'Cautious';

export function recommendation(ex: ProgramExercise, units: Units, voice: CoachVoice = 'Encouraging'): Recommendation {
  const lib = EXLIB[ex.id];
  const equip = lib.equip[ex.equipIdx];
  const w1 = fmtWeight(ex.last.weight, units);
  const isTime = lib.trackingMode === 'time';
  const unitWord = isTime ? '' : ' reps';
  const fmtVal = (v: number) => (isTime ? formatSetTime(v) : String(v) + unitWord);
  const v = voice.toLowerCase();
  const phrase = (direct: string, encouraging: string, hype: string) => (v === 'direct' ? direct : v === 'hype' ? hype : encouraging);
  if (equip.v === 'bodyweight' || equip.v === 'assisted') {
    const bump = isTime ? 5 : 1;
    const bumpWord = isTime ? bump + 's' : '1 rep';
    const val = ex.last.hitTop ? ex.last.reps + bump : ex.last.reps;
    return {
      weight: 0, reps: val,
      title: ex.last.hitTop
        ? phrase('+' + bumpWord + ' today', 'Push for +' + bumpWord + ' today', 'LET’S GO — +' + bumpWord + ' today! 🔥')
        : phrase('Match last time', 'Match last time', 'Hold the line — match it! 💪'),
      note: 'Last time: ' + fmtVal(ex.last.reps) + '. Aim for ' + fmtVal(val) + (isTime ? '.' : ' across your sets.')
    };
  }
  const inc = incrementForEquip(equip.v) ?? 2.5;
  if (ex.last.hitTop) {
    const w = ex.last.weight + inc;
    const incWord = fmtWeight(inc, units);
    return {
      weight: w, reps: lib.repHi,
      title: phrase('+' + incWord + ' today', 'Push for +' + incWord + ' today', 'PUSH IT — +' + incWord + ' today! 🔥'),
      note: 'Last time: ' + w1 + ' × ' + fmtVal(ex.last.reps) + ', all sets hit target. Try ' + fmtWeight(w, units) + '.'
    };
  }
  return {
    weight: ex.last.weight, reps: lib.repHi,
    title: phrase('Repeat weight, +1 rep', 'Match last time, add a rep', 'Almost there — +1 rep! 💪'),
    note: 'Last time: ' + w1 + ' × ' + fmtVal(ex.last.reps) + '. Repeat the weight and aim for ' + fmtVal(lib.repHi) + '.'
  };
}

const REST_PACING_MULT: Record<RestPacing, number> = { Relaxed: 1.3, Standard: 1, Aggressive: 0.7 };

export function restForExercise(exId: string, pacing: RestPacing = 'Standard'): number {
  return Math.round(EXLIB[exId].restBase * REST_PACING_MULT[pacing]);
}

export function estimateDayTime(state: AppState, dayKey: string, pacing: RestPacing = 'Standard', warmupStyle: WarmupStyle = 'Standard'): number {
  const day = state.program[dayKey];
  let sec = day.exercises.length * 30;
  day.exercises.forEach(ex => {
    const lib = EXLIB[ex.id];
    sec += ex.sets * (40 + restForExercise(ex.id, pacing));
    if (lib.compound && ex.last.weight >= 40 && warmupStyle !== 'Minimal') sec += 150;
  });
  return sec;
}

export function formatDuration(sec: number): string {
  const mins = Math.max(10, Math.round(sec / 60 / 5) * 5);
  return '~' + mins + ' min';
}

export interface WarmupInfo {
  note: string;
  sets: { weight: number; reps: number }[];
}

// whether a warm-up is called for: heavy-ish compound lift, gated by the Warm-Up Style setting.
export function warmupInfo(ex: ProgramExercise, style: WarmupStyle = 'Standard'): WarmupInfo | null {
  if (style === 'Minimal') return null;
  const lib = EXLIB[ex.id];
  const equip = lib.equip[ex.equipIdx];
  if (!lib.compound || equip.v === 'bodyweight' || equip.v === 'assisted') return null;
  const threshold = style === 'Cautious' ? 25 : 40;
  if (ex.last.weight < threshold) return null;
  const sets = style === 'Cautious'
    ? [{ weight: roundTo(ex.last.weight * 0.3, 2.5), reps: 10 }, { weight: roundTo(ex.last.weight * 0.5, 2.5), reps: 8 }, { weight: roundTo(ex.last.weight * 0.7, 2.5), reps: 5 }]
    : [{ weight: roundTo(ex.last.weight * 0.4, 2.5), reps: 8 }, { weight: roundTo(ex.last.weight * 0.65, 2.5), reps: 5 }];
  return { note: 'Heavy compound lift — warm up before your working sets.', sets };
}

// returns { muscle: 0..1 } — relative share of this day's set volume, for opacity-based highlighting.
export function dayMuscleRanks(state: AppState, dayKey: string): Record<string, number> {
  const day = state.program[dayKey];
  const sums: Record<string, number> = {};
  day.exercises.forEach(ex => { const m = EXLIB[ex.id].muscle; sums[m] = (sums[m] || 0) + ex.sets; });
  const max = Math.max(0, ...Object.values(sums));
  const ranks: Record<string, number> = {};
  Object.keys(sums).forEach(m => { ranks[m] = max > 0 ? sums[m] / max : 0; });
  return ranks;
}

// Picks a handful of simple warm-up moves that cover the muscles a training day targets most,
// using a greedy set-cover so a few moves address as many target muscles as possible.
export function warmupForDay(state: AppState, dayKey: string): { id: string; name: string; cue: string }[] {
  const day = state.program[dayKey];
  if (!day || (day.kind || 'training') === 'rest' || !day.exercises.length) return [];
  const ranks = dayMuscleRanks(state, dayKey);
  const targetMuscles = (Object.keys(ranks) as Muscle[]).sort((a, b) => ranks[b] - ranks[a]).slice(0, 4);
  if (!targetMuscles.length) return [];

  const remaining = new Set<Muscle>(targetMuscles);
  const picked: WarmupMove[] = [];
  while (remaining.size && picked.length < 4) {
    let best: WarmupMove | null = null;
    let bestScore = 0;
    for (const move of WARMUP_LIBRARY) {
      if (picked.includes(move)) continue;
      const score = move.muscles.filter(m => remaining.has(m)).length;
      if (score > bestScore) { bestScore = score; best = move; }
    }
    if (!best || bestScore === 0) break;
    picked.push(best);
    best.muscles.forEach(m => remaining.delete(m));
  }
  return picked.map(m => ({ id: m.id, name: m.name, cue: m.cue }));
}

// True once every training day (kind !== 'rest') has been completed or skipped on or after
// weekStartedAt — the trigger useApp.ts uses to roll into the next week immediately, rather than
// waiting for 7 calendar days to pass regardless of whether the user actually trained.
export function isWeekComplete(program: ProgramDays, dayOrder: string[], weekStartedAt: string): boolean {
  const trainingKeys = dayOrder.filter(k => program[k] && (program[k].kind || 'training') !== 'rest');
  if (!trainingKeys.length) return false;
  const startMs = new Date(weekStartedAt).getTime();
  return trainingKeys.every(k => {
    const day = program[k];
    if (day.skipped) return true;
    return !!day.lastCompletedAt && new Date(day.lastCompletedAt).getTime() >= startMs;
  });
}

export function formatElapsed(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSec / 3600), m = Math.floor((totalSec % 3600) / 60), sec = totalSec % 60;
  const mm = String(m).padStart(2, '0'), ss = String(sec).padStart(2, '0');
  return h > 0 ? h + ':' + mm + ':' + ss : mm + ':' + ss;
}

export function nextIncompleteIndex(exercisesArr: ProgramExercise[], exSets: Record<number, { done: boolean }[]>, fromIndex: number): number | null {
  const n = exercisesArr.length;
  for (let step = 1; step <= n; step++) {
    const i = (fromIndex + step) % n;
    const sets = exSets[i];
    if (!sets || !sets.every(r => r.done)) return i;
  }
  return null;
}

export function isWorkoutFullyDone(exercisesArr: ProgramExercise[], exSets: Record<number, { done: boolean }[]>): boolean {
  return exercisesArr.every((_e, i) => exSets[i] && exSets[i].every(r => r.done));
}

// ---------- Progress tab analytics ----------

export function volumeChartData(state: AppState) {
  const recent = state.history.slice(0, 6).reverse();
  const max = Math.max(1, ...recent.map(h => h.volumeKg));
  const avg = recent.length ? recent.reduce((a, h) => a + h.volumeKg, 0) / recent.length : 0;
  const bars = recent.map((h, i) => {
    const prev = i > 0 ? recent[i - 1].volumeKg : null;
    const deltaPct = prev ? Math.round(((h.volumeKg - prev) / prev) * 100) : null;
    return {
      pct: Math.max(6, Math.round((h.volumeKg / max) * 100)), day: h.day.replace(' Day', ''),
      deltaText: deltaPct == null ? '' : (deltaPct >= 0 ? '+' : '') + deltaPct + '%',
      deltaColor: deltaPct == null ? 'transparent' : deltaPct >= 0 ? 'oklch(0.7 0.15 145)' : 'oklch(0.72 0.17 35)'
    };
  });
  return { bars, avgText: fmtWeight(avg, state.units), avgLinePct: max > 0 ? Math.round((avg / max) * 100) : 0 };
}

// HistoryEntry.id is 'h' + Date.now() at creation — the only place in the persisted shape with a
// real, unambiguous timestamp (`date`/`day` are display-formatted strings, locale-dependent and
// not reliably parseable back into a Date).
function historyTimestamp(h: HistoryEntry): number {
  const n = Number(h.id.slice(1));
  return Number.isFinite(n) ? n : Date.now();
}

// Past weeks reflect what was actually logged (state.exerciseHistory), not a guess — a muscle/week
// with no completed sets shows 0%, it's never backfilled with synthetic variance. Only the "Now"
// column (current week) mirrors the live program's planned volume, same as the muscle balance bars
// elsewhere in the app.
export function weeklyHeatmapData(state: AppState, bars: MuscleBar[]) {
  const weeksN = 6;
  const muscles = Object.keys(MUSCLE_TARGETS);
  const basePct: Record<string, number> = {};
  bars.forEach(b => { basePct[b.name] = b.pct; });
  const mult = TRAINING_MULT[state.trainingType];

  // exerciseHistory entries only carry a display date/day string, not a timestamp — join back to
  // state.history (written in the same completeWorkout() action, so date+day always match) to
  // recover a real time for week-bucketing.
  const sessionTime = new Map<string, number>();
  state.history.forEach(h => {
    if (h.status === 'completed') sessionTime.set(h.date + '|' + h.day, historyTimestamp(h));
  });
  const now = Date.now();
  const weekSets: Record<string, number>[] = Array.from({ length: weeksN }, () => ({}));
  Object.entries(state.exerciseHistory).forEach(([exId, entries]) => {
    const lib = EXLIB[exId];
    if (!lib) return;
    entries.forEach(e => {
      const t = sessionTime.get(e.date + '|' + e.day);
      if (t == null) return;
      const weeksAgo = Math.floor((now - t) / (7 * 86400000));
      if (weeksAgo < 0 || weeksAgo >= weeksN) return;
      const setCount = e.sets && e.sets.length ? e.sets.length : 1;
      weekSets[weeksAgo][lib.muscle] = (weekSets[weeksAgo][lib.muscle] || 0) + setCount;
    });
  });

  const cols: { label: string; w: number }[] = [];
  for (let w = weeksN - 1; w >= 0; w--) cols.push({ label: w === 0 ? 'Now' : '-' + w + 'w', w });
  const rows = muscles.map(m => {
    const target = MUSCLE_TARGETS[m as Muscle] * mult;
    const cells = cols.map(c => {
      const pct = c.w === 0 ? (basePct[m] || 0) : (target > 0 ? Math.round(((weekSets[c.w][m] || 0) / target) * 100) : 0);
      const t = clamp(pct / 130, 0, 1);
      const bg = pct === 0 ? 'rgba(255,255,255,.04)' :
        pct < 60 ? 'oklch(0.55 0.12 230 / ' + (0.18 + t * 0.5) + ')' :
        pct <= 110 ? 'oklch(0.62 0.14 145 / ' + (0.22 + t * 0.55) + ')' :
        'oklch(0.62 0.18 35 / ' + (0.28 + t * 0.6) + ')';
      return { pct, bg };
    });
    return { muscle: m, cells };
  });
  return { cols, rows };
}

// every exercise in the library (including custom ones) is selectable here, not just ones in
// the active program — grouped by muscle for an expandable picker rather than one long chip row.
export function exerciseProgressData(state: AppState, selectId: (id: string) => void) {
  const allIds = Object.keys(EXLIB).sort((a, b) => EXLIB[a].name.localeCompare(EXLIB[b].name));
  if (!allIds.length) return { hasData: false, empty: true, pickerGroups: [], selectedName: '', deltaText: '' };
  const selectedId = allIds.includes(state.selectedProgressEx || '') ? (state.selectedProgressEx as string) : allIds[0];

  const byMuscle: Record<string, string[]> = {};
  allIds.forEach(id => { const m = EXLIB[id].muscle; (byMuscle[m] = byMuscle[m] || []).push(id); });
  const pickerGroups = Object.keys(byMuscle).sort().map(muscle => ({
    muscle,
    items: byMuscle[muscle].map(id => ({
      id, name: EXLIB[id].name,
      isSelected: id === selectedId,
      hasHistory: !!(state.exerciseHistory[id] || []).length,
      select: () => selectId(id)
    }))
  }));

  const isTime = EXLIB[selectedId].trackingMode === 'time';
  const selectedName = EXLIB[selectedId].name;
  const entries = state.exerciseHistory[selectedId] || [];
  if (!entries.length) return { hasData: false, empty: true, pickerGroups, selectedName, deltaText: '', isTime };
  const valueOf = (e: ExerciseHistoryEntry) => (isTime ? e.reps : e.weight);
  const maxW = Math.max(1, ...entries.map(valueOf));
  const minW = Math.min(...entries.map(valueOf));
  const range = Math.max(1, maxW - minW);
  const n = entries.length;
  const points = entries.map((e, i) => ({
    x: n > 1 ? Math.round((i / (n - 1)) * 260 + 10) : 140,
    y: Math.round(90 - ((valueOf(e) - minW) / range) * 70),
    date: e.date
  }));
  const linePoints = points.map(p => p.x + ',' + p.y).join(' ');
  const first = entries[0], latest = entries[entries.length - 1];
  const deltaVal = valueOf(latest) - valueOf(first);
  const deltaText = entries.length > 1
    ? (deltaVal >= 0 ? '+' : '-') + (isTime ? formatSetTime(Math.abs(deltaVal)) : fmtWeight(Math.abs(deltaVal), state.units)) + ' since ' + first.date
    : 'First logged ' + first.date;
  return { hasData: true, empty: false, pickerGroups, points, linePoints, selectedName, deltaText, isTime };
}

// The picker shows a sensible default (top exercises with history) until the user explicitly
// selects/deselects something. Shared with the toggle action so the very first click acts on the
// same list the user is looking at, instead of an empty underlying selection.
export function defaultCompareLiftIds(state: AppState): string[] {
  const allIds = Object.keys(EXLIB);
  const withHistory = allIds.filter(id => (state.exerciseHistory[id] || []).length > 1);
  return withHistory.slice(0, 3);
}

// every exercise in the library is selectable (not just ones with logged history) — grouped by
// muscle for an expandable picker, capped at 3 selected at once.
export function compareLiftsData(state: AppState, toggle: (id: string) => void) {
  const allIds = Object.keys(EXLIB).sort((a, b) => EXLIB[a].name.localeCompare(EXLIB[b].name));
  const colors = ['oklch(0.65 0.19 35)', 'oklch(0.7 0.13 230)', 'oklch(0.7 0.15 145)'];
  const selected = (state.compareLiftIds && state.compareLiftIds.length ? state.compareLiftIds : defaultCompareLiftIds(state)).filter(id => allIds.includes(id));

  const byMuscle: Record<string, string[]> = {};
  allIds.forEach(id => { const m = EXLIB[id].muscle; (byMuscle[m] = byMuscle[m] || []).push(id); });
  const pickerGroups = Object.keys(byMuscle).sort().map(muscle => ({
    muscle,
    items: byMuscle[muscle].map(id => {
      const idx = selected.indexOf(id);
      const isSelected = idx !== -1;
      return {
        id, name: EXLIB[id].name, isSelected,
        color: isSelected ? colors[idx % colors.length] : null,
        hasHistory: (state.exerciseHistory[id] || []).length > 1,
        toggle: () => toggle(id)
      };
    })
  }));

  const series = selected.map((id, i) => {
    const entries = state.exerciseHistory[id] || [];
    if (entries.length < 2) return null;
    const isTime = EXLIB[id].trackingMode === 'time';
    const valueOf = (e: ExerciseHistoryEntry) => (isTime ? e.reps : e.weight);
    const first = valueOf(entries[0]) || 1;
    const n = entries.length;
    const pts = entries.map((e, k) => ({ x: n > 1 ? Math.round((k / (n - 1)) * 260 + 10) : 140, pctChange: Math.round(((valueOf(e) - first) / first) * 100) }));
    return { id, name: EXLIB[id].name, color: colors[i % colors.length], pts };
  }).filter((sr): sr is NonNullable<typeof sr> => sr !== null);

  const allPct = series.flatMap(sr => sr.pts.map(p => p.pctChange));
  const maxAbs = Math.max(10, ...(allPct.length ? allPct.map(Math.abs) : [10]));
  const lines = series.map(sr => {
    const last = sr.pts[sr.pts.length - 1];
    return {
      ...sr,
      linePoints: sr.pts.map(p => p.x + ',' + Math.round(55 - (p.pctChange / maxAbs) * 45)).join(' '),
      deltaText: (last.pctChange >= 0 ? '+' : '') + last.pctChange + '%'
    };
  });
  const pendingNames = selected.filter(id => (state.exerciseHistory[id] || []).length < 2).map(id => EXLIB[id].name);
  return {
    pickerGroups, lines, hasData: lines.length > 0, selectedCount: selected.length,
    limitHit: !!state.compareLiftLimitHit, pendingNames
  };
}

// A real Mon-Sun calendar grid (like a GitHub-style contribution calendar) rather than a rolling
// N-day window — a rolling window doesn't align to week boundaries, so cells can't carry weekday
// headers and read as an arbitrary, unlabeled strip of numbers. Cell status is presence-only
// ("did a session happen this date") rather than trying to infer which real calendar date *should*
// have been a training day: since weeks now roll over on completion rather than a fixed calendar
// cadence (see isWeekComplete()), there's no reliable way to say a given weekday "should" have
// been rest vs. training, so a "missed" verdict tied to that guess would routinely be wrong.
const CONSISTENCY_WEEKS = 5;
const WEEKDAY_LABELS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

export function consistencyData(state: AppState) {
  const today = new Date();
  const todayKey = today.toDateString();
  const completedDateKeys = new Set(state.history.filter(h => h.status === 'completed').map(h => new Date(historyTimestamp(h)).toDateString()));
  const programStartD = state.startedAt ? new Date(state.startedAt) : null;
  const programStartKey = programStartD ? new Date(programStartD.getFullYear(), programStartD.getMonth(), programStartD.getDate()) : null;

  // grid spans CONSISTENCY_WEEKS full Mon-Sun weeks, ending with the week containing today.
  const todayMon0 = (today.getDay() + 6) % 7; // 0=Mon..6=Sun
  const gridEnd = new Date(today); gridEnd.setDate(gridEnd.getDate() + (6 - todayMon0));
  const gridStart = new Date(gridEnd); gridStart.setDate(gridStart.getDate() - (CONSISTENCY_WEEKS * 7 - 1));

  const cells: { date: string; dayNum: number; status: string; bg: string }[] = [];
  for (let i = 0; i < CONSISTENCY_WEEKS * 7; i++) {
    const d = new Date(gridStart); d.setDate(d.getDate() + i);
    const dateKey = d.toISOString().slice(0, 10);
    let status: string;
    if (d > today) status = 'future';
    else if (d.toDateString() === todayKey) status = 'today';
    else if (programStartKey && d < programStartKey) status = 'none';
    else status = completedDateKeys.has(d.toDateString()) ? 'done' : 'empty';
    cells.push({
      date: dateKey, dayNum: d.getDate(), status,
      bg: status === 'done' ? 'oklch(0.65 0.16 145)' : status === 'today' ? 'oklch(0.65 0.19 35 / 0.4)' : 'rgba(255,255,255,.05)'
    });
  }

  // streak = consecutive most-recent attempted days (from real history, newest-first) that were
  // completed rather than skipped — a calendar-day streak would break on every planned rest day,
  // which isn't a meaningful "you fell off" signal for a program that isn't 7-days-a-week.
  let streak = 0;
  for (const h of state.history) {
    if (h.status === 'completed') streak++; else break;
  }

  return { weekdayLabels: WEEKDAY_LABELS, cells, streak, completedCount: cells.filter(c => c.status === 'done').length };
}

const DONUT_PALETTE = ['oklch(0.65 0.19 35)', 'oklch(0.7 0.13 230)', 'oklch(0.7 0.15 145)', 'oklch(0.75 0.13 90)', 'oklch(0.68 0.15 300)', 'oklch(0.7 0.14 20)', 'oklch(0.72 0.12 260)', 'oklch(0.66 0.16 160)', 'oklch(0.7 0.12 0)', 'oklch(0.62 0.1 250)', 'oklch(0.72 0.16 60)'];

export function volumeDonutData(state: AppState) {
  const vols = muscleVolumes(state.program, state.dayOrder);
  const total = Object.values(vols).reduce((a, v) => a + v, 0) || 1;
  const entries = Object.keys(vols).filter(m => vols[m] > 0).sort((a, b) => vols[b] - vols[a]);
  let acc = 0;
  const segments = entries.map((m, i) => {
    const pct = (vols[m] / total) * 100;
    const start = acc; acc += pct;
    return { muscle: m, pct: Math.round(pct), color: DONUT_PALETTE[i % DONUT_PALETTE.length], start, end: acc };
  });
  const gradientCss = segments.length ? 'conic-gradient(' + segments.map(sg => sg.color + ' ' + sg.start + '% ' + sg.end + '%').join(', ') + ')' : 'rgba(255,255,255,.06)';
  return { gradientCss, segments, hasData: entries.length > 0 };
}

export function durationTrendData(state: AppState) {
  const recent = state.history.slice(0, 8).reverse();
  const maxDur = Math.max(1, ...recent.map(h => h.durationMin || 0));
  const maxRest = Math.max(1, ...recent.map(h => h.avgRestSec || 0));
  const n = recent.length;
  const bars = recent.map((h, i) => ({
    day: h.day.replace(' Day', ''),
    dateShort: h.date.replace(/^\w+,\s*/, ''),
    durPct: Math.max(6, Math.round(((h.durationMin || 0) / maxDur) * 100)),
    durText: (h.durationMin || 0) + 'm',
    x: n > 1 ? Math.round((i / (n - 1)) * 260 + 10) : 140,
    y: Math.round(70 - ((h.avgRestSec || 0) / maxRest) * 55)
  }));
  const restPoints = bars.map(b => b.x + ',' + b.y).join(' ');
  const avgDur = recent.length ? Math.round(recent.reduce((a, h) => a + (h.durationMin || 0), 0) / recent.length) : 0;
  const avgRest = recent.length ? Math.round(recent.reduce((a, h) => a + (h.avgRestSec || 0), 0) / recent.length) : 0;
  return {
    bars, restPoints, avgDurText: avgDur + ' min avg', avgRestText: avgRest + 's avg rest', hasData: recent.length > 0,
    restMaxLabel: maxRest + 's', restMinLabel: '0s', restDayLabels: bars.map(b => b.dateShort)
  };
}

export type { Units, TrainingType };
