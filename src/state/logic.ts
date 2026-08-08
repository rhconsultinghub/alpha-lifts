import { EXLIB, MUSCLE_VOLUME, MUSCLES, aimSets, TRAINING_LABELS, incrementForEquip, KG_PER_LB_STEP } from '../data/exercises';
import { clamp, roundTo } from '../data/program';
import { WARMUP_LIBRARY, type WarmupMove } from '../data/warmups';
import type { AppState, ProgramDays, ProgramExercise, Muscle, Units, TrainingType, ExerciseHistoryEntry, HistoryEntry, ExerciseLast, SetHistoryRow } from '../data/types';

export function fmtWeight(kg: number, units: Units): string {
  if (units === 'lb') return Math.round((kg * 2.20462) / 5) * 5 + ' lb';
  return Math.round(kg * 2) / 2 + ' kg';
}

// Fine-grained weight formatting (0.1 precision) for measurements where fmtWeight's 5-lb display
// grid erases the signal — bodyweight above all, where a real 2 lb change over a month rendered
// as "+0 lb" or "+5 lb". Lifting numbers stay on fmtWeight's plate-friendly grid.
export function fmtBodyWeight(kg: number, units: Units): string {
  if (units === 'lb') return Math.round(kg * 2.20462 * 10) / 10 + ' lb';
  return Math.round(kg * 10) / 10 + ' kg';
}

const LB_BAR = 45;
const KG_BAR = 20;
const LB_PLATES = [45, 35, 25, 10, 5, 2.5];
const KG_PLATES = [25, 20, 15, 10, 5, 2.5, 1.25];

// Standard-bar plate breakdown, worked entirely in display units (a bar loaded for a session
// tracked in lb uses a 45 lb bar + lb plates; tracked in kg uses a 20 kg bar + kg plates) — this
// matches how a gym actually loads a bar, rather than converting a kg-stored value into odd
// fractional lb plates or vice versa. Returns null when there's nothing to plate-load (at/under
// bar weight).
export function platesBreakdown(displayWeight: number, units: Units): number[] | null {
  const bar = units === 'lb' ? LB_BAR : KG_BAR;
  const plateSet = units === 'lb' ? LB_PLATES : KG_PLATES;
  let perSide = (displayWeight - bar) / 2;
  if (perSide < plateSet[plateSet.length - 1] - 0.01) return null;
  const result: number[] = [];
  for (const p of plateSet) {
    while (perSide >= p - 0.01) { result.push(p); perSide -= p; }
  }
  return result.length ? result : null;
}

export function weightStep(units: Units): number {
  return units === 'lb' ? KG_PER_LB_STEP : 2.5;
}

// How much of a "hard set" a logged set is worth, as a function of how close to failure it was
// (logged RIR) AND the training style — because "close enough to failure to count" is style-
// dependent. Endurance work is submaximal by design, so an RIR-4 set there is a normal working set
// (full credit); the same RIR-4 set on a Low Volume / High Effort plan largely misses the point
// (partial credit). A set with no logged RIR counts full — we never penalize users who don't log it.
const RIR_TOL: Record<TrainingType, number> = {
  hit: 1, strength: 3, progressive_overload: 3, general: 3, endurance: 5
};
export function setCredit(rir: number | undefined | null, trainingType: TrainingType): number {
  if (rir == null) return 1;
  const tol = RIR_TOL[trainingType];
  if (rir <= tol) return 1;
  return Math.max(0.5, 1 - 0.15 * (rir - tol));
}

// Weekly volume per muscle, counted in HARD SETS (the unit MUSCLE_VOLUME's landmarks are in). Each
// planned working set counts as one set toward its exercise's PRIMARY muscle (secondaries earn no
// bar credit — see MUSCLE_VOLUME's note), lightly weighted by setCredit() using that exercise's most
// recent logged RIR as a proxy for how hard it's actually taken. Deliberately NOT scaled by load or
// weight-vs-baseline: a hard set is a hard set regardless of whether load went up since some frozen
// baseline, which is how every external volume reference counts — and counting it any other way is
// what made the app disagree with them.
export function muscleVolumes(program: ProgramDays, dayOrder: string[], trainingType: TrainingType, exerciseHistory?: Record<string, ExerciseHistoryEntry[]>): Record<string, number> {
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
      const last = effectiveLast(ex, exerciseHistory && exerciseHistory[ex.id]);
      const credit = setCredit(last.rir, trainingType);
      vols[lib.muscle] = (vols[lib.muscle] || 0) + ex.sets * credit;
    });
  });
  return vols;
}

export interface MuscleStatus {
  status: 'over' | 'under' | 'good';
  color: string;
}

// Band-relative status: below MEV is under-dosed, above MAV is likely too much, anything inside the
// MEV-MAV range is a widely-accepted "good" weekly dose (no single-point target to miss narrowly).
export function muscleStatus(sets: number, mev: number, mav: number): MuscleStatus {
  if (sets > mav) return { status: 'over', color: 'oklch(0.72 0.17 35)' };
  if (sets < mev) return { status: 'under', color: 'oklch(0.72 0.13 230)' };
  return { status: 'good', color: 'oklch(0.7 0.15 145)' };
}

export interface MuscleBar {
  name: string;
  sets: number;         // RIR-adjusted counted hard sets this week
  mev: number;
  mav: number;
  aim: number;          // style's aim point within the band
  rangeText: string;    // e.g. "10–20"
  status: 'over' | 'under' | 'good';
  color: string;
  // bar geometry — a 0..MAV track (100% = MAV)
  fillPct: number;      // fill width = sets/MAV, clamped 0..100
  goodLoPct: number;    // where the MEV..MAV "good zone" starts on the track
  aimPct: number;       // aim marker position on the track
  // compact-row + legacy fields (kept so existing components keep working)
  pct: number;          // sets/aim ×100, rounded — used for heatmap comparability + sorting
  pctText: string;      // the compact number box now shows the set count, e.g. "14"
  pctClamped: number;   // = fillPct, the compact bar width
}

export function muscleBarsList(state: AppState): MuscleBar[] {
  const vols = muscleVolumes(state.program, state.dayOrder, state.trainingType, state.exerciseHistory);
  return MUSCLES.map(name => {
    const { mev, mav } = MUSCLE_VOLUME[name];
    const aim = aimSets(name, state.trainingType);
    const sets = vols[name] || 0;
    const st = muscleStatus(sets, mev, mav);
    const setsRounded = Math.round(sets * 10) / 10;
    return {
      name, sets, mev, mav, aim,
      rangeText: mev + '–' + mav,
      status: st.status, color: st.color,
      fillPct: Math.min(100, mav > 0 ? (sets / mav) * 100 : 0),
      goodLoPct: mav > 0 ? (mev / mav) * 100 : 0,
      aimPct: Math.min(100, mav > 0 ? (aim / mav) * 100 : 0),
      pct: aim > 0 ? Math.round((sets / aim) * 100) : 0,
      pctText: String(Math.round(setsRounded)),
      pctClamped: Math.min(100, mav > 0 ? (sets / mav) * 100 : 0),
    };
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
  // rank by how far outside the band each muscle sits, so the most extreme is called out first.
  const overs = rows.filter(r => r.status === 'over').sort((a, b) => (b.sets - b.mav) - (a.sets - a.mav));
  const unders = rows.filter(r => r.status === 'under').sort((a, b) => (a.sets - a.mev) - (b.sets - b.mev));
  if (overs.length) {
    const o = overs[0];
    let text = o.name + ' is above its ' + o.rangeText + ' set range (' + Math.round(o.sets) + ' sets/week, counting all your program days).';
    if (unders.length) text += ' ' + unders[0].name + ' is below its ' + unders[0].rangeText + ' range (' + Math.round(unders[0].sets) + ' sets) — consider adding volume there.';
    return { level: 'over', color: 'oklch(0.82 0.13 35)', text, bars: rows };
  }
  if (unders.length) {
    return {
      level: 'under', color: 'oklch(0.75 0.13 230)',
      text: unders.map(x => x.name).join(' & ') + ' running below the weekly set range for your ' + TRAINING_LABELS[state.trainingType] + ' plan, even counting other program days. Consider adding sets.',
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

// Epley formula — good enough for a relative trend line/PR check, not meant as a literal max-
// effort prediction. Only meaningful for weighted, rep-based sets (see bestSetScore).
export function estimatedOneRepMax(weight: number, reps: number): number {
  if (reps <= 0) return 0;
  return weight * (1 + reps / 30);
}

// Single comparable "how good was this set" number, shared by PR detection and the e1RM chart
// metric so both agree on what counts as an improvement. Time-tracked exercises (planks) compare
// on seconds held; bodyweight/assisted exercises (no meaningful external load) compare on reps;
// everything else compares on estimated 1RM so a heavier-lower-rep set can beat a lighter-higher-
// rep one, matching how lifters actually judge progress.
export function bestSetScore(weight: number, reps: number, isTime: boolean, isBodyweight: boolean): number {
  if (isTime || isBodyweight) return reps;
  return estimatedOneRepMax(weight, reps);
}

export function formatSetTime(sec: number): string {
  if (sec >= 60) { const m = Math.floor(sec / 60), s = sec % 60; return m + ':' + String(s).padStart(2, '0'); }
  return sec + 's';
}

export type CoachVoice = 'Direct' | 'Encouraging' | 'Hype';
export type RestPacing = 'Relaxed' | 'Standard' | 'Aggressive';
export type WarmupStyle = 'Minimal' | 'Standard' | 'Cautious';

// Prefers the most recent cross-day history for this exact exercise (state.exerciseHistory[exId],
// which accumulates from every program day the exercise appears on — see completeWorkout() in
// useApp.ts) over the program slot's own ex.last. Without this, "last time" and the weight/rep
// recommendation would only reflect whichever day-specific copy of the exercise you last opened,
// even when you did the same exercise on a *different* day more recently (e.g. an exercise that
// appears on both a Push and an Upper day tracks two independent ex.last fields, one per slot).
// The equipment variant a program slot is currently set to (EquipOption.v). Progress is tracked
// per variant, so this is the key that scopes an exercise's history down to "the tool you're using".
export function equipVOf(ex: ProgramExercise): string | undefined {
  return EXLIB[ex.id]?.equip[ex.equipIdx]?.v;
}
// The subset of an exercise's history logged on a given equipment variant.
export function variantHistory(entries: ExerciseHistoryEntry[] | undefined, equipV: string | undefined): ExerciseHistoryEntry[] | undefined {
  if (!entries) return entries;
  return entries.filter(e => e.equip === equipV);
}

export function effectiveLast(ex: ProgramExercise, history?: ExerciseHistoryEntry[]): ExerciseLast {
  // A manual correction from the Day View quick-edit modal outranks even cross-day history — it's
  // a deliberate, explicit statement of "start here next time," not just whatever happened to get
  // logged last. Cleared automatically once the exercise is logged again (completeWorkout).
  if (ex.manualTarget) return { weight: ex.manualTarget.weight, reps: ex.manualTarget.reps, hitTop: false };
  // Deload sessions are deliberately light, so they're not what "last time" means for the purposes
  // of picking the next target — progressing from a deload entry would build up from ~60% of the
  // real working weight. Fall back to the last *real* session; only if every entry on record is a
  // deload (i.e. the exercise has never been logged outside one) does a deload entry get used.
  // The `deload` flag is checked inline rather than via state/deload.ts's isDeloadEntry() because
  // that module imports deloadSuggestion() from this one — importing back would be circular.
  // Scope to the tool this slot is set to — a barbell session shouldn't be the "last time" for a
  // dumbbell slot of the same exercise (see equipVOf/variantHistory). Callers pass the exercise's
  // full per-id history; the filter here is what keeps each variant's progress separate.
  const scoped = variantHistory(history, equipVOf(ex));
  const real = scoped ? scoped.filter(e => e.deload !== true) : undefined;
  const usable = real && real.length ? real : scoped;
  if (usable && usable.length) {
    const lib = EXLIB[ex.id];
    const latest = usable[usable.length - 1];
    const all: SetHistoryRow[] = latest.sets && latest.sets.length ? latest.sets : [{ weight: latest.weight, reps: latest.reps }];
    // Progression reads only the straight working sets: a trailing drop set at reduced weight
    // must not become "last time's weight", and a short drop/AMRAP rep count must not gate
    // hitTop. (Mirrors the same filter at write time in completeWorkout.)
    const core = all.filter(r => r.setType == null);
    const sets = core.length ? core : all;
    const topSet = sets[sets.length - 1];
    const hitTop = sets.every(r => r.reps >= lib.repHi);
    return { weight: topSet.weight, reps: topSet.reps, hitTop, rir: topSet.rir };
  }
  return ex.last;
}

export interface SimilarRef { name: string; weight: number; reps: number; isTime: boolean; sameVariant: boolean; }

// Finds the closest already-logged exercise to stand in as a reference for one with no history of
// its own. Ranked by match quality — same movement pattern first (a true variant, e.g. Incline DB
// Press for Bench Press), then same primary muscle — and within a tier by how much history exists
// (a well-established lift is a better reference than a one-off). Deliberately does NOT sort by
// date: ExerciseHistoryEntry.date is a display-formatted locale string with no year, so it isn't
// reliably comparable across exercises. The *entry* returned is still that exercise's own most
// recent log (last element of its append-ordered array).
export function similarExerciseReference(exId: string, allHistory?: Record<string, ExerciseHistoryEntry[]>): SimilarRef | null {
  const lib = EXLIB[exId];
  if (!lib || !allHistory) return null;
  let best: { id: string; tier: number; count: number } | null = null;
  for (const otherId of Object.keys(allHistory)) {
    if (otherId === exId) continue;
    const entries = allHistory[otherId];
    if (!entries || !entries.length) continue;
    const other = EXLIB[otherId];
    if (!other) continue;
    const tier = other.pattern === lib.pattern ? 0 : (other.muscle === lib.muscle ? 1 : -1);
    if (tier < 0) continue;
    if (!best || tier < best.tier || (tier === best.tier && entries.length > best.count)) {
      best = { id: otherId, tier, count: entries.length };
    }
  }
  if (!best) return null;
  const entries = allHistory[best.id];
  const e = entries[entries.length - 1];
  const sets = e.sets && e.sets.length ? e.sets : [{ weight: e.weight, reps: e.reps }];
  const top = sets[sets.length - 1];
  const otherLib = EXLIB[best.id];
  return { name: otherLib.name, weight: top.weight, reps: top.reps, isTime: otherLib.trackingMode === 'time', sameVariant: best.tier === 0 };
}

export function recommendation(ex: ProgramExercise, units: Units, voice: CoachVoice = 'Encouraging', history?: ExerciseHistoryEntry[], allHistory?: Record<string, ExerciseHistoryEntry[]>, deloadPct?: number | null, trainingType: TrainingType = 'progressive_overload'): Recommendation {
  const lib = EXLIB[ex.id];
  const equip = lib.equip[ex.equipIdx];
  const last = effectiveLast(ex, history);
  const w1 = fmtWeight(last.weight, units);
  // Progress is per-equipment: "have I done this before / is this a deload" is asked of THIS tool's
  // history only, so switching a slot to a new tool correctly reads as a first time on it.
  const scoped = variantHistory(history, equip.v);
  const isTime = lib.trackingMode === 'time';
  const unitWord = isTime ? '' : ' reps';
  const fmtVal = (v: number) => (isTime ? formatSetTime(v) : String(v) + unitWord);
  const v = voice.toLowerCase();
  const phrase = (direct: string, encouraging: string, hype: string) => (v === 'direct' ? direct : v === 'hype' ? hype : encouraging);

  // Never show a progressive-overload prompt for an exercise that's never been logged: `ex.last` is
  // placeholder data for a fresh slot (weight 0), so "+2.5 kg on last time" would be advice built on
  // nothing, and it reads as if the user has done this lift before. Instead surface a first-time
  // message, seeded with the closest logged variant as a reference point when one exists. A manual
  // target from the quick-edit modal counts as a deliberate starting point, so it's left alone.
  if (!ex.manualTarget && (!scoped || scoped.length === 0)) {
    const bodyweight = equip.v === 'bodyweight' || equip.v === 'assisted';
    // Best reference for a first time on a new tool is the SAME lift on another tool the user has
    // done (e.g. switched Barbell Bench → Dumbbell: point at their barbell number), before falling
    // back to a different, similar exercise.
    const otherVariant = (allHistory?.[ex.id] || []).filter(e => e.equip && e.equip !== equip.v && e.deload !== true);
    if (otherVariant.length && !bodyweight) {
      const le = otherVariant[otherVariant.length - 1];
      const vlabel = lib.equip.find(o => o.v === le.equip)?.label || le.equip;
      const lsets = le.sets && le.sets.length ? le.sets : [{ weight: le.weight, reps: le.reps }];
      const ltop = lsets[lsets.length - 1];
      return {
        weight: ltop.weight, reps: lib.repHi,
        title: phrase('First time on ' + equip.label, 'First time on ' + equip.label, 'New tool — dial it in! 💪'),
        note: 'No ' + equip.label + ' history yet. Your ' + vlabel + ' ' + lib.name + ' is at ' + fmtWeight(ltop.weight, units) + ' × ' + ltop.reps + ' reps — expect a different number here and adjust to feel.'
      };
    }
    const ref = similarExerciseReference(ex.id, allHistory);
    if (ref && !bodyweight) {
      const refVal = ref.isTime ? formatSetTime(ref.reps) : ref.reps + ' reps';
      return {
        weight: ref.weight, reps: lib.repHi,
        title: phrase('First time — reference below', 'First time — here’s a reference', 'New lift — let’s find your number! 💪'),
        note: 'No history for this one yet. Closest thing you’ve logged is ' + ref.name + ' at ' + fmtWeight(ref.weight, units) + ' × ' + refVal +
          (ref.sameVariant ? ' (same movement)' : ' (same muscle group)') + ' — use it as a starting reference and adjust to feel.'
      };
    }
    return {
      weight: bodyweight ? 0 : last.weight, reps: lib.repHi,
      title: phrase('First time — set a baseline', 'First time — find your baseline', 'New lift — set your baseline! 💪'),
      note: bodyweight
        ? 'No history yet. Aim for ' + fmtVal(lib.repHi) + ' and we’ll track your progress from here.'
        : 'No history yet. Pick a weight you can control for ' + fmtVal(lib.repHi) + ' — we’ll build from there next session.'
    };
  }
  // Deload week: cut the load and stop chasing progression entirely. Placed after the no-history
  // branch above (a lift you've never done has no working weight to take a percentage of, so it
  // gets normal first-time baseline advice even during a deload) but before every progression rule
  // below, since none of them should run while deloading — the point of the week is to *not* add.
  if (deloadPct && (scoped?.length || ex.manualTarget)) {
    const pctText = Math.round(deloadPct * 100) + '%';
    const title = phrase('Deload week — go light', 'Deload week — keep it easy', 'Deload week — bank the recovery! 🌱');
    if (equip.v === 'bodyweight' || equip.v === 'assisted') {
      // No external load to strip, so the volume comes off the reps/time instead.
      const val = Math.max(1, Math.round(last.reps * deloadPct));
      return {
        weight: 0, reps: val, title,
        note: 'Deload week: aim for ' + fmtVal(val) + ' instead of your usual ' + fmtVal(last.reps) +
          '. Leave plenty in the tank — you’re recovering, not testing.'
      };
    }
    const inc = incrementForEquip(equip.v, units) ?? 2.5;
    const raw = last.weight * deloadPct;
    const w = last.weight > 0 ? Math.max(inc, Math.round(raw / inc) * inc) : 0;
    return {
      weight: w, reps: lib.repHi, title,
      note: 'Deload week: ' + pctText + ' of your usual ' + w1 + ' — that’s ' + fmtWeight(w, units) +
        ' for ' + fmtVal(lib.repHi) + '. Every rep should feel easy; this week is what lets the next one go up.'
    };
  }
  if (equip.v === 'bodyweight' || equip.v === 'assisted') {
    const bump = isTime ? 5 : 1;
    const bumpWord = isTime ? bump + 's' : '1 rep';
    const val = last.hitTop ? last.reps + bump : last.reps;
    return {
      weight: 0, reps: val,
      title: last.hitTop
        ? phrase('+' + bumpWord + ' today', 'Push for +' + bumpWord + ' today', 'LET’S GO — +' + bumpWord + ' today! 🔥')
        : phrase('Match last time', 'Match last time', 'Hold the line — match it! 💪'),
      note: 'Last time: ' + fmtVal(last.reps) + '. Aim for ' + fmtVal(val) + (isTime ? '.' : ' across your sets.')
    };
  }
  const inc = incrementForEquip(equip.v, units) ?? 2.5;
  if (last.hitTop) {
    // hit the rep target but that top set was already to true failure (RIR 0) — hold the weight
    // rather than piling more load onto a set that had no reserve left, even though the rep
    // target was technically met.
    //
    // Skipped entirely on the low-volume/high-effort plan ('hit'), where RIR 0 is the whole
    // prescription rather than a warning sign. Under that style every logged set is at failure,
    // so this rule fired every single session and the load could never go up — a lifter on the
    // plan that's explicitly about training hard was the one lifter the app refused to progress.
    if (last.rir === 0 && trainingType !== 'hit') {
      return {
        weight: last.weight, reps: lib.repHi,
        title: phrase('Repeat weight', 'Repeat the weight, build a buffer', 'Hold steady — same weight! 💪'),
        note: 'Last time: ' + w1 + ' × ' + fmtVal(last.reps) + ', but that set was to failure (RIR 0). Repeat the weight and build a rep buffer before increasing.'
      };
    }
    const w = last.weight + inc;
    const incWord = fmtWeight(inc, units);
    return {
      weight: w, reps: lib.repHi,
      title: phrase('+' + incWord + ' today', 'Push for +' + incWord + ' today', 'PUSH IT — +' + incWord + ' today! 🔥'),
      note: 'Last time: ' + w1 + ' × ' + fmtVal(last.reps) + ', all sets hit target. Try ' + fmtWeight(w, units) + '.'
    };
  }
  return {
    weight: last.weight, reps: lib.repHi,
    title: phrase('Repeat weight, +1 rep', 'Match last time, add a rep', 'Almost there — +1 rep! 💪'),
    note: 'Last time: ' + w1 + ' × ' + fmtVal(last.reps) + '. Repeat the weight and aim for ' + fmtVal(lib.repHi) + '.'
  };
}

const REST_PACING_MULT: Record<RestPacing, number> = { Relaxed: 1.3, Standard: 1, Aggressive: 0.7 };

// Research-backed rest scaling, layered on top of each exercise's restBase (which already encodes
// compound-vs-isolation and load). Two factors beyond the user's manual pacing override:
//  - training type: heavy near-max strength work and low-volume/high-effort work need the longest
//    inter-set recovery for performance/volume-load to hold across sets, while endurance/metabolic
//    work rests shortest (Schoenfeld 2016; NSCA guidance that longer rest on multi-joint work
//    preserves subsequent-set performance).
//  - proximity to failure (RIR of the set just finished): a set taken to true failure incurs more
//    fatigue and needs longer to recover than one left several reps in reserve.
//
// 'hit' was 1.3, which stacked with rirRestFactor's 1.25-at-failure into ~3.5 minutes between
// bench-press sets — sensible for literal one-set-to-failure HIT, punishing for the retuned
// low-volume style. 1.15 keeps it clearly longer than standard without approaching Strength.
export const REST_TRAINING_FACTOR: Record<TrainingType, number> = {
  strength: 1.4, hit: 1.15, progressive_overload: 1, general: 0.85, endurance: 0.6
};

// undefined RIR (not logged for that set, or a static day-time estimate that can't know future
// effort) resolves to the neutral RIR-2 factor rather than assuming failure or a full buffer.
export function rirRestFactor(rir?: number): number {
  if (rir == null) return 1;
  if (rir <= 0) return 1.25;   // true failure
  if (rir === 1) return 1.15;
  if (rir === 2) return 1;     // baseline hypertrophy proximity
  if (rir === 3) return 0.9;
  return 0.8;                  // 4+ reps in reserve
}

// Clamped to a sane 30s–5min window so no combination of multipliers produces an absurd rest.
export function restForExercise(exId: string, pacing: RestPacing = 'Standard', trainingType: TrainingType = 'progressive_overload', rir?: number): number {
  const raw = EXLIB[exId].restBase * REST_TRAINING_FACTOR[trainingType] * rirRestFactor(rir) * REST_PACING_MULT[pacing];
  return Math.max(30, Math.min(300, Math.round(raw)));
}

function estimateDayTimeFormula(state: AppState, dayKey: string, pacing: RestPacing, warmupStyle: WarmupStyle): number {
  const day = state.program[dayKey];
  let sec = day.exercises.length * 30;
  day.exercises.forEach(ex => {
    const lib = EXLIB[ex.id];
    sec += ex.sets * (40 + restForExercise(ex.id, pacing, state.trainingType));
    if (lib.compound && ex.last.weight >= 40 && warmupStyle !== 'Minimal') sec += 150;
  });
  return sec;
}

// Starts from the static formula above, then blends toward the user's own logged history for
// this exact day as samples accumulate. A session only counts as a sample if every exercise in
// it was actually logged (badgeText 'Logged', never 'Skipped') and its exercise count matches
// today's plan — so a workout that ran short because exercises were *skipped* mid-session can
// never pull the estimate down, only a session logged against a plan that's since had an
// exercise permanently removed falls out of the pool (its exercise count no longer matches),
// which correctly lets the estimate shrink once the formula recomputes with fewer exercises.
export function estimateDayTime(state: AppState, dayKey: string, pacing: RestPacing = 'Standard', warmupStyle: WarmupStyle = 'Standard'): number {
  const base = estimateDayTimeFormula(state, dayKey, pacing, warmupStyle);
  const day = state.program[dayKey];
  const samples = state.history
    .filter(h => h.status === 'completed' && h.program === state.programName && h.day === day.label)
    .filter(h => h.exercises.length === day.exercises.length && h.exercises.every(e => e.badgeText === 'Logged'))
    .slice(0, 5);
  if (!samples.length) return base;
  const avgActualSec = (samples.reduce((a, h) => a + h.durationMin, 0) / samples.length) * 60;
  const weight = samples.length / 5;
  return Math.round(base * (1 - weight) + avgActualSec * weight);
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
// `workingWeight` is the load the user is actually about to lift this session — the heaviest of the
// current working sets (see viewModel), which already reflects today's recommendation plus any
// manual edit. Warm-up sets are percentages of *that*, so the ramp always leads into the real top
// set. It used to key off `ex.last.weight`, this program slot's stored last-session weight, which
// meant the ramp lagged a session behind every time the weight went up, ignored a quick-edit
// manualTarget entirely, and (because `ex.last` is placeholder 0 on a fresh slot) suppressed the
// warm-up altogether for an exercise being run for the first time even at a heavy working weight.
export function warmupInfo(ex: ProgramExercise, style: WarmupStyle = 'Standard', workingWeight?: number): WarmupInfo | null {
  if (style === 'Minimal') return null;
  const lib = EXLIB[ex.id];
  const equip = lib.equip[ex.equipIdx];
  if (!lib.compound || equip.v === 'bodyweight' || equip.v === 'assisted') return null;
  const top = workingWeight != null ? workingWeight : ex.last.weight;
  const threshold = style === 'Cautious' ? 25 : 40;
  if (top < threshold) return null;
  const sets = style === 'Cautious'
    ? [{ weight: roundTo(top * 0.3, 2.5), reps: 10 }, { weight: roundTo(top * 0.5, 2.5), reps: 8 }, { weight: roundTo(top * 0.7, 2.5), reps: 5 }]
    : [{ weight: roundTo(top * 0.4, 2.5), reps: 8 }, { weight: roundTo(top * 0.65, 2.5), reps: 5 }];
  return { note: 'Heavy compound lift — ramp up to your working weight before your first hard set.', sets };
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
export interface DeloadSuggestion {
  show: boolean;
  text: string;
  names: string[];
}

// Looks only at compound lifts currently in the program (isolation work is noisier and less
// telling of overall systemic fatigue) with enough logged history to judge a trend. A lift counts
// as "plateaued" if its most recent session's best set isn't meaningfully above the session from
// two sessions back — flat or declining rather than a single off day. Suggests a deload once at
// least half of the compound lifts with enough history are plateaued.
export function deloadSuggestion(state: AppState): DeloadSuggestion {
  const compoundIds = new Set<string>();
  state.dayOrder.forEach(k => {
    const day = state.program[k];
    if (!day || (day.kind || 'training') === 'rest') return;
    day.exercises.forEach(ex => { if (EXLIB[ex.id]?.compound) compoundIds.add(ex.id); });
  });
  let considered = 0;
  const plateaued: string[] = [];
  compoundIds.forEach(id => {
    // Deload entries are excluded before the trend is read: they're light by design, so a deload
    // week sitting in the window would read as a "flat or declining" lift and this detector would
    // recommend a deload immediately after one just finished.
    const entries = (state.exerciseHistory[id] || []).filter(e => e.deload !== true);
    if (entries.length < 3) return;
    considered++;
    const lib = EXLIB[id];
    const isTime = lib.trackingMode === 'time';
    const score = (e: ExerciseHistoryEntry) => (isTime ? e.reps : e.weight > 0 ? estimatedOneRepMax(e.weight, e.reps) : e.reps);
    const recent = entries.slice(-3);
    if (score(recent[2]) <= score(recent[0]) * 1.02) plateaued.push(lib.name);
  });
  if (considered < 2 || plateaued.length / considered < 0.5) return { show: false, text: '', names: [] };
  return {
    show: true,
    names: plateaued,
    text: plateaued.join(', ') + (plateaued.length > 1 ? ' have' : ' has') + ' been flat for a few sessions — consider a lighter deload week before pushing for more weight.'
  };
}

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
  const muscles = MUSCLES as string[];
  const basePct: Record<string, number> = {};
  bars.forEach(b => { basePct[b.name] = b.pct; });

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
    // reference the style's aim point so historical weeks and the live "Now" column (which is
    // sets/aim ×100 via basePct) are on the same scale.
    const target = aimSets(m as Muscle, state.trainingType);
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

// Progress is tracked per equipment variant, so a lift shows up in the chart pickers as a distinct
// selectable "series" per tool the user has actually logged it on (Bench Press · Barbell vs. ·
// Dumbbell). An exercise logged on 0-or-1 tools is a single series keyed by its bare id; one logged
// on 2+ tools splits into one series per tool, keyed `id@equipV`. This keeps each tool's line clean.
export interface ProgressVariant { key: string; id: string; equipV: string | null; name: string; entries: ExerciseHistoryEntry[]; }
function equipLabelFor(id: string, v: string): string { return EXLIB[id]?.equip.find(o => o.v === v)?.label || v; }
export function progressVariantsForId(state: AppState, id: string): ProgressVariant[] {
  const entries = state.exerciseHistory[id] || [];
  const vs = [...new Set(entries.map(e => e.equip).filter((x): x is string => !!x))];
  if (vs.length <= 1) return [{ key: id, id, equipV: vs[0] ?? null, name: EXLIB[id].name, entries }];
  return vs.map(v => ({ key: id + '@' + v, id, equipV: v, name: EXLIB[id].name + ' · ' + equipLabelFor(id, v), entries: entries.filter(e => e.equip === v) }));
}
function resolveProgressKey(state: AppState, key: string): ProgressVariant | null {
  const id = key.split('@')[0];
  if (!EXLIB[id]) return null;
  const variants = progressVariantsForId(state, id);
  return variants.find(pv => pv.key === key) || variants.find(pv => pv.id === id) || variants[0] || null;
}

// every exercise in the library (including custom ones) is selectable here, not just ones in
// the active program — grouped by muscle for an expandable picker rather than one long chip row.
export function exerciseProgressData(state: AppState, selectId: (id: string) => void, metric: 'weight' | 'e1rm' = 'weight') {
  const allIds = Object.keys(EXLIB).sort((a, b) => EXLIB[a].name.localeCompare(EXLIB[b].name));
  if (!allIds.length) return { hasData: false, empty: true, pickerGroups: [], selectedName: '', deltaText: '' };
  const allVariants = allIds.flatMap(id => progressVariantsForId(state, id));
  const selected = resolveProgressKey(state, state.selectedProgressEx || '') || allVariants.find(v => v.entries.length) || allVariants[0];
  const selectedKey = selected.key;

  const byMuscle: Record<string, string[]> = {};
  allIds.forEach(id => { const m = EXLIB[id].muscle; (byMuscle[m] = byMuscle[m] || []).push(id); });
  const pickerGroups = Object.keys(byMuscle).sort().map(muscle => ({
    muscle,
    items: byMuscle[muscle].flatMap(id => progressVariantsForId(state, id).map(pv => ({
      id: pv.key, name: pv.name,
      isSelected: pv.key === selectedKey,
      hasHistory: !!pv.entries.length,
      select: () => selectId(pv.key)
    })))
  }));

  const isTime = EXLIB[selected.id].trackingMode === 'time';
  const usingE1rm = metric === 'e1rm' && !isTime;
  const selectedName = selected.name;
  const entries = selected.entries;
  if (!entries.length) return { hasData: false, empty: true, pickerGroups, selectedName, deltaText: '', isTime, usingE1rm };
  // e1RM only makes sense for weighted sets — a bodyweight-equipment entry logs weight 0, so fall
  // back to reps for that entry even while the e1RM metric is toggled on.
  const valueOf = (e: ExerciseHistoryEntry) => (isTime ? e.reps : usingE1rm ? (e.weight > 0 ? estimatedOneRepMax(e.weight, e.reps) : e.reps) : e.weight);
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
  return { hasData: true, empty: false, pickerGroups, points, linePoints, selectedName, deltaText, isTime, usingE1rm };
}

// The picker shows a sensible default (top exercises with history) until the user explicitly
// selects/deselects something. Shared with the toggle action so the very first click acts on the
// same list the user is looking at, instead of an empty underlying selection.
export function defaultCompareLiftIds(state: AppState): string[] {
  const keys: string[] = [];
  for (const id of Object.keys(EXLIB)) for (const pv of progressVariantsForId(state, id)) if (pv.entries.length > 1) keys.push(pv.key);
  return keys.slice(0, 3);
}

// every exercise in the library is selectable (not just ones with logged history) — grouped by
// muscle for an expandable picker, capped at 3 selected at once. Selection keys are per-variant
// (`id` or `id@equipV`), so two tools for one lift can be compared as separate lines.
export function compareLiftsData(state: AppState, toggle: (id: string) => void, metric: 'weight' | 'e1rm' = 'weight') {
  const allIds = Object.keys(EXLIB).sort((a, b) => EXLIB[a].name.localeCompare(EXLIB[b].name));
  const colors = ['oklch(0.65 0.19 35)', 'oklch(0.7 0.13 230)', 'oklch(0.7 0.15 145)'];
  const allVariants = allIds.flatMap(id => progressVariantsForId(state, id));
  const vmap = new Map(allVariants.map(v => [v.key, v]));
  const selected = (state.compareLiftIds && state.compareLiftIds.length ? state.compareLiftIds : defaultCompareLiftIds(state)).filter(k => vmap.has(k));

  const byMuscle: Record<string, string[]> = {};
  allIds.forEach(id => { const m = EXLIB[id].muscle; (byMuscle[m] = byMuscle[m] || []).push(id); });
  const pickerGroups = Object.keys(byMuscle).sort().map(muscle => ({
    muscle,
    items: byMuscle[muscle].flatMap(id => progressVariantsForId(state, id).map(pv => {
      const idx = selected.indexOf(pv.key);
      const isSelected = idx !== -1;
      return {
        id: pv.key, name: pv.name, isSelected,
        color: isSelected ? colors[idx % colors.length] : null,
        hasHistory: pv.entries.length > 1,
        toggle: () => toggle(pv.key)
      };
    }))
  }));

  const series = selected.map((key, i) => {
    const pv = vmap.get(key);
    const entries = pv ? pv.entries : [];
    if (!pv || entries.length < 2) return null;
    const isTime = EXLIB[pv.id].trackingMode === 'time';
    const usingE1rm = metric === 'e1rm' && !isTime;
    const valueOf = (e: ExerciseHistoryEntry) => (isTime ? e.reps : usingE1rm ? (e.weight > 0 ? estimatedOneRepMax(e.weight, e.reps) : e.reps) : e.weight);
    const first = valueOf(entries[0]) || 1;
    const n = entries.length;
    const pts = entries.map((e, k) => ({ x: n > 1 ? Math.round((k / (n - 1)) * 260 + 10) : 140, pctChange: Math.round(((valueOf(e) - first) / first) * 100) }));
    return { id: pv.key, name: pv.name, color: colors[i % colors.length], pts };
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
  const pendingNames = selected.map(k => vmap.get(k)).filter((pv): pv is ProgressVariant => !!pv && pv.entries.length < 2).map(pv => pv.name);
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
  const vols = muscleVolumes(state.program, state.dayOrder, state.trainingType, state.exerciseHistory);
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

// Same points/linePoints/deltaText shape exerciseProgressData() produces, so ProgressScreen can
// reuse the exact same inline <svg><polyline> sparkline markup for both.
export function bodyWeightChartData(state: AppState) {
  const entries = (state.bodyWeightLog || []).slice().sort((a, b) => a.date.localeCompare(b.date));
  if (!entries.length) return { hasData: false, empty: true, points: [] as { x: number; y: number; date: string }[], linePoints: '', deltaText: '', latestText: '' };
  const maxW = Math.max(1, ...entries.map(e => e.weightKg));
  const minW = Math.min(...entries.map(e => e.weightKg));
  const range = Math.max(1, maxW - minW);
  const n = entries.length;
  const points = entries.map((e, i) => ({
    x: n > 1 ? Math.round((i / (n - 1)) * 260 + 10) : 140,
    y: Math.round(90 - ((e.weightKg - minW) / range) * 70),
    date: e.date
  }));
  const linePoints = points.map(p => p.x + ',' + p.y).join(' ');
  const first = entries[0], latest = entries[entries.length - 1];
  const deltaKg = latest.weightKg - first.weightKg;
  const deltaText = entries.length > 1
    ? (deltaKg >= 0 ? '+' : '-') + fmtBodyWeight(Math.abs(deltaKg), state.units) + ' since ' + first.date
    : 'First logged ' + first.date;
  return { hasData: true, empty: false, points, linePoints, deltaText, latestText: fmtBodyWeight(latest.weightKg, state.units) };
}

// ---------- body measurements ----------

// Fixed catalog rather than free-text types, so the chips/chart stay consistent and a synced
// blob can't accumulate near-duplicate labels ("arm"/"arms"/"bicep").
export const MEASUREMENT_TYPES: { key: string; label: string }[] = [
  { key: 'neck', label: 'Neck' }, { key: 'shoulders', label: 'Shoulders' }, { key: 'chest', label: 'Chest' },
  { key: 'waist', label: 'Waist' }, { key: 'hips', label: 'Hips' }, { key: 'biceps', label: 'Biceps' },
  { key: 'thigh', label: 'Thigh' }, { key: 'calf', label: 'Calf' }
];

// Measurements are stored in cm; lb users see inches (their mental model pairs lb with in the
// same way kg pairs with cm). 0.1 precision — same reasoning as fmtBodyWeight.
export function measurementUnitLabel(units: Units): string {
  return units === 'lb' ? 'in' : 'cm';
}
export function fmtMeasurement(cm: number, units: Units): string {
  if (units === 'lb') return Math.round((cm / 2.54) * 10) / 10 + ' in';
  return Math.round(cm * 10) / 10 + ' cm';
}

// Same points/linePoints/deltaText shape as bodyWeightChartData, so ProgressScreen reuses the
// identical sparkline markup.
export function measurementChartData(state: AppState, type: string) {
  const entries = (state.measurementLog || []).filter(e => e.type === type).sort((a, b) => a.date.localeCompare(b.date));
  if (!entries.length) return { hasData: false, empty: true, points: [] as { x: number; y: number; date: string }[], linePoints: '', deltaText: '', latestText: '' };
  const maxV = Math.max(1, ...entries.map(e => e.valueCm));
  const minV = Math.min(...entries.map(e => e.valueCm));
  const range = Math.max(1, maxV - minV);
  const n = entries.length;
  const points = entries.map((e, i) => ({
    x: n > 1 ? Math.round((i / (n - 1)) * 260 + 10) : 140,
    y: Math.round(90 - ((e.valueCm - minV) / range) * 70),
    date: e.date
  }));
  const linePoints = points.map(p => p.x + ',' + p.y).join(' ');
  const first = entries[0], latest = entries[entries.length - 1];
  const deltaCm = latest.valueCm - first.valueCm;
  const deltaText = entries.length > 1
    ? (deltaCm >= 0 ? '+' : '-') + fmtMeasurement(Math.abs(deltaCm), state.units) + ' since ' + first.date
    : 'First logged ' + first.date;
  return { hasData: true, empty: false, points, linePoints, deltaText, latestText: fmtMeasurement(latest.valueCm, state.units) };
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

// ---------- Achievements: pure, monotonically non-decreasing stats derived from state ----------
// Every one of these only ever grows (or, for streaks, tracks the best-ever run rather than the
// current one) — that's deliberate, not incidental: an achievement system needs "once earned,
// always earned," and state.history/exerciseHistory only ever gain entries in normal use, never
// lose them (exerciseHistory's per-exercise arrays are capped to the last 8 sessions, which is why
// PR counting below reads the isPR flag already stored on each history entry at completion time,
// rather than re-deriving PRs from the capped exerciseHistory arrays — re-deriving would let a PR
// count silently drop if the entry that established it aged out of a capped array).

export function completedWorkoutCount(state: AppState): number {
  return state.history.filter(h => h.status === 'completed').length;
}

export function lifetimeVolumeKg(state: AppState): number {
  return state.history.reduce((sum, h) => sum + (h.volumeKg || 0), 0);
}

// Lifetime set/rep totals. Summed per-session like volume above (not kept as a running scalar) so
// they can always be re-derived and never drift — see the HistoryEntry.setCount/repCount note.
// loadInitial() backfills these onto pre-counter sessions, so the sum covers all history, not just
// sessions logged since the fields existed.
export function lifetimeSets(state: AppState): number {
  return state.history.reduce((sum, h) => sum + (h.setCount || 0), 0);
}

export function lifetimeReps(state: AppState): number {
  return state.history.reduce((sum, h) => sum + (h.repCount || 0), 0);
}

// Longest run of consecutive completed sessions found *anywhere* in history, not just the current
// run from most-recent — so breaking today's streak doesn't un-earn a badge for a longer streak
// held in the past.
export function bestEverStreak(state: AppState): number {
  let best = 0, current = 0;
  for (const h of state.history) {
    if (h.status === 'completed') { current++; if (current > best) best = current; } else current = 0;
  }
  return best;
}

// A week counts as "clean" if it has at least one logged entry and none of them are skips — not a
// guarantee every planned day that week was done (history alone can't confirm that in general),
// just that nothing was explicitly marked skipped.
export function cleanWeekCount(state: AppState): number {
  const byWeek: Record<number, HistoryEntry[]> = {};
  state.history.forEach(h => { const w = h.weekNumber || 1; (byWeek[w] = byWeek[w] || []).push(h); });
  return Object.values(byWeek).filter(entries => entries.length > 0 && entries.every(e => e.status === 'completed')).length;
}

export function totalPRCount(state: AppState): number {
  return state.history.reduce((sum, h) => sum + h.exercises.filter(e => e.isPR).length, 0);
}

export function distinctExercisesLoggedCount(state: AppState): number {
  return Object.keys(state.exerciseHistory).filter(id => (state.exerciseHistory[id] || []).length > 0).length;
}

export function distinctMusclesTrainedCount(state: AppState): number {
  const muscles = new Set<Muscle>();
  Object.keys(state.exerciseHistory).forEach(id => {
    if ((state.exerciseHistory[id] || []).length > 0 && EXLIB[id]) muscles.add(EXLIB[id].muscle);
  });
  return muscles.size;
}

export function hasLoggedTimeExercise(state: AppState): boolean {
  return Object.keys(state.exerciseHistory).some(id => (state.exerciseHistory[id] || []).length > 0 && EXLIB[id]?.trackingMode === 'time');
}

export function customExerciseCount(state: AppState): number {
  return Object.keys(state.customExercises || {}).length;
}

// Total logged training time. Grows on every single completed session, which is exactly what makes
// it good achievement fuel — see the tier design note in data/achievements.ts.
export function totalTrainingMinutes(state: AppState): number {
  return state.history.reduce((sum, h) => sum + (h.status === 'completed' ? (h.durationMin || 0) : 0), 0);
}

// Best single-session volume. A max, so it's monotonic like the rest of these (a lighter session
// later can never pull it back down), and it's beatable surprisingly often while a lifter is still
// adding weight or sets — a "beat your best day" target rather than a lifetime total.
export function bestSessionVolumeKg(state: AppState): number {
  return state.history.reduce((best, h) => (h.status === 'completed' && (h.volumeKg || 0) > best ? h.volumeKg : best), 0);
}

// Lifetime count of logged sets is deliberately NOT offered as a metric: HistoryEntry.exercises is
// display rows with no set counts, and exerciseHistory is capped to the last 8 sessions per
// exercise, so any count derived from it would *decrease* as old sessions age out — which would
// un-earn badges. Volume and training time cover the same "grows every workout" role safely.

export type { Units, TrainingType };
