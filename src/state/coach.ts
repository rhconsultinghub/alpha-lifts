import type { AppState, CoachProposal, CoachEntitlement, TrainingType, Screen, ExerciseDef, ProgramDays, ProgramExercise, Muscle, ParsedPlan } from '../data/types';
import { EXLIB, EQUIP_CATALOG, MUSCLES } from '../data/exercises';
import { mkEx, slugify } from '../data/program';
import {
  muscleBarsList, fmtWeight, completedWorkoutCount, bestEverStreak, totalPRCount,
  lifetimeVolumeKg, bestSessionVolumeKg, estimatedOneRepMax
} from './logic';

/**
 * Client half of the AI coach. Everything security-relevant — the API key, the system prompt,
 * the topic restriction, the usage metering — lives in the Cloudflare Worker (`worker/`), not
 * here. This file only assembles context, POSTs, and parses the reply.
 *
 * As of the coach-actions phase it also does two more things: it builds the aggregate stats and
 * exercise catalog the coach reads from (so "what's my bench 1RM / is my volume ok" needs no
 * tool round-trip), and it resolves the Worker's raw tool calls into validated, apply-ready
 * proposals (see parseProposals). Nothing here mutates AppState — a proposal is applied only when
 * the user taps Apply, by the actions in useApp.ts.
 *
 * Set VITE_COACH_API_URL to the deployed Worker URL. When it's unset the coach tab renders a
 * "not configured" state rather than failing at request time, so a build without the env var
 * still works as an app.
 */
export const COACH_API_URL: string = import.meta.env?.VITE_COACH_API_URL || '';

export const COACH_CONFIGURED = COACH_API_URL !== '';

/**
 * Headers for a coach request. When the user is signed in we attach the session bearer token so
 * the Worker keys entitlement + budget on their *account* (surviving reinstalls and shared across
 * their devices), not the throwaway device UUID. The device UUID is still sent in the body as the
 * fallback identity for anonymous/local-only builds. Imported lazily-ish via a function so this
 * module doesn't hard-depend on auth being configured.
 */
function coachHeaders(): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const token = getAuthToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

// Read the token without a static import cycle (auth.ts imports from this module). Kept tiny and
// failure-tolerant — no token just means the request falls back to device-id identity.
function getAuthToken(): string | null {
  try {
    return localStorage.getItem('alpha-lifts-auth-token');
  } catch {
    return null;
  }
}

/** How many past sessions to summarise into the prompt. Every message re-sends this and is
 *  billed for it, so this is a cost knob as much as a quality one. */
const RECENT_WORKOUT_LIMIT = 5;

/** How many of the user's strongest lifts to surface in the stats block. */
const TOP_LIFTS_LIMIT = 6;

/**
 * Most chat turns kept in AppState. Two reasons for a cap: the whole app shares one
 * localStorage blob, and the Worker re-sends this history as input tokens on every message,
 * so an uncapped conversation gets quadratically more expensive as it goes. The Worker
 * enforces its own, tighter limit — this one just stops the stored log growing forever.
 */
export const COACH_HISTORY_CAP = 40;

export interface CoachMessage {
  role: 'user' | 'assistant';
  content: string;
}

/**
 * The subset of AppState the coach is allowed to see. Deliberately a hand-built projection
 * rather than sending AppState wholesale: the full state is large (151 exercises' worth of
 * history, every saved program), and input tokens are billed on every single message.
 */
export interface CoachContext {
  units: 'kg' | 'lb';
  /** Who the coach is talking to. Every field optional — the name comes from AppState.userName
   *  (absent for accounts that never stored one) and the rest from onboardingProfile, which only
   *  exists for accounts onboarded through the guided flow. */
  user?: {
    name?: string;
    experience?: string;
    goal?: string;
    equipment?: string;
    diet?: string;
  };
  programName?: string;
  trainingType?: string;
  weekNumber?: number;
  days?: { name: string; kind: string; exercises: string[] }[];
  recentWorkouts?: { day: string; when: string; exercises: string[] }[];
  bodyWeight?: { value: number; when: string } | null;
  stats?: {
    totalWorkouts?: number;
    currentStreak?: number;
    totalPRs?: number;
    lifetimeVolume?: string;
    bestSession?: string;
    muscleVolume?: { muscle: string; sets: number; range: string; status: string }[];
    topLifts?: { name: string; best: string; e1rm: string }[];
  };
  catalog?: { muscle: string; names: string[] }[];
}

function exName(id: string): string {
  return EXLIB[id]?.name || id;
}

function displayWeight(kg: number, units: 'kg' | 'lb'): number {
  return units === 'lb' ? Math.round(kg * 2.20462 * 10) / 10 : Math.round(kg * 10) / 10;
}

function relativeDay(iso: string): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  return `${days} days ago`;
}

/** The day name the coach sees and echoes back in tool args — weekday-prefixed because labels
 *  repeat across a week (a PPL split has two "Push Day"s). Kept as one function so the context
 *  serializer and the proposal resolver agree exactly on the format. */
function dayDisplayName(d: { dow?: string; label: string }): string {
  return d.dow ? `${d.dow} — ${d.label}` : d.label;
}

function buildStats(s: AppState): CoachContext['stats'] {
  const stats: NonNullable<CoachContext['stats']> = {};

  stats.totalWorkouts = completedWorkoutCount(s);
  stats.currentStreak = bestEverStreak(s);
  stats.totalPRs = totalPRCount(s);
  const lifetime = lifetimeVolumeKg(s);
  if (lifetime > 0) stats.lifetimeVolume = fmtWeight(lifetime, s.units);
  const best = bestSessionVolumeKg(s);
  if (best > 0) stats.bestSession = fmtWeight(best, s.units);

  // Per-muscle weekly volume in hard sets vs. the recommended MEV–MAV range — the same numbers the
  // Program screen's bars show, sent as sets + range (not a single %) so the coach reasons in the
  // same ranges the app and outside volume guidance use.
  stats.muscleVolume = muscleBarsList(s)
    .filter(b => b.sets > 0)
    .map(b => ({ muscle: b.name, sets: Math.round(b.sets * 10) / 10, range: b.rangeText, status: b.status }));

  // Strongest logged lifts by estimated 1RM. Only weighted lifts qualify — a 1RM estimate is
  // meaningless for bodyweight/timed work, and history carries no equip to tell them apart, so
  // gate on a real logged weight instead.
  const lifts: { name: string; best: string; e1rm: string; score: number }[] = [];
  for (const [id, entries] of Object.entries(s.exerciseHistory || {})) {
    const real = (entries || []).filter(e => e.deload !== true && e.weight > 0 && e.reps > 0);
    if (!real.length) continue;
    let top = real[0];
    for (const e of real) if (estimatedOneRepMax(e.weight, e.reps) > estimatedOneRepMax(top.weight, top.reps)) top = e;
    const e1rmKg = estimatedOneRepMax(top.weight, top.reps);
    lifts.push({
      name: exName(id),
      best: `${fmtWeight(top.weight, s.units)} × ${top.reps}`,
      e1rm: fmtWeight(e1rmKg, s.units),
      score: e1rmKg
    });
  }
  lifts.sort((a, b) => b.score - a.score);
  if (lifts.length) stats.topLifts = lifts.slice(0, TOP_LIFTS_LIMIT).map(({ name, best, e1rm }) => ({ name, best, e1rm }));

  return stats;
}

/** Every catalogued exercise (built-ins + this session's custom ones, already merged into EXLIB),
 *  grouped by muscle, name only. The coach must use these exact names in tool args so the client
 *  can resolve them back to ids by exact match. */
export function buildCatalog(): CoachContext['catalog'] {
  const byMuscle: Record<string, string[]> = {};
  for (const def of Object.values(EXLIB)) {
    (byMuscle[def.muscle] ||= []).push(def.name);
  }
  return Object.entries(byMuscle).map(([muscle, names]) => ({ muscle, names: names.sort() }));
}

/** onboardingProfile stores the raw option ids the wizard used. The coach reads prose, so translate
 *  them here rather than shipping "trains with: full_gym" into the prompt. Unknown values (a future
 *  option this map hasn't caught up with) pass through as-is instead of being dropped. */
const PROFILE_LABELS: Record<'experience' | 'goal' | 'equipment' | 'diet', Record<string, string>> = {
  experience: { beginner: 'new to lifting', intermediate: 'trains consistently', advanced: 'experienced lifter' },
  goal: { muscle: 'building muscle', strength: 'getting stronger', general: 'general fitness', endurance: 'building endurance' },
  equipment: { full_gym: 'a full gym', home_basic: 'a home setup (dumbbells, bands, maybe a bench)', minimal: 'minimal equipment' },
  diet: { build: 'eating to build', lean: 'leaning out', maintain: 'maintaining', unsure: 'unsure about nutrition' }
};

export function buildCoachContext(s: AppState): CoachContext {
  const ctx: CoachContext = { units: s.units };

  // Who they are. The onboarding answers have been persisted since AI onboarding shipped but were
  // never read anywhere — this is the first consumer, and the reason the coach can say "for someone
  // your first year in, eating to build" rather than asking every time. Only emitted when non-empty
  // so an account with neither a name nor a profile costs no extra input tokens.
  const userName = (s.userName || '').trim();
  const profile = s.onboardingProfile;
  if (userName || profile) {
    ctx.user = {
      ...(userName ? { name: userName } : {}),
      ...(profile
        ? {
            experience: PROFILE_LABELS.experience[profile.experience] || profile.experience,
            goal: PROFILE_LABELS.goal[profile.goal] || profile.goal,
            equipment: PROFILE_LABELS.equipment[profile.equipment] || profile.equipment,
            diet: PROFILE_LABELS.diet[profile.diet] || profile.diet
          }
        : {})
    };
  }

  if (s.programName) ctx.programName = s.programName;
  if (s.trainingType) ctx.trainingType = s.trainingType;
  if (s.weekNumber) ctx.weekNumber = s.weekNumber;

  const days = s.dayOrder.map(k => s.program[k]).filter(Boolean);
  if (days.length) {
    ctx.days = days.map(d => ({
      name: dayDisplayName(d),
      kind: d.kind === 'rest' ? 'rest' : 'training',
      exercises: (d.exercises || []).map(e => exName(e.id))
    }));
  }

  const recent = (s.history || []).filter(h => h.status === 'completed').slice(0, RECENT_WORKOUT_LIMIT);
  if (recent.length) {
    ctx.recentWorkouts = recent.map(h => ({
      day: h.day,
      when: relativeDay(h.date),
      // `resultText` is already the human-readable "3x8 @ 60kg"-style summary the completion
      // screen shows, so it needs no reformatting for the model.
      exercises: h.exercises.map(e => `${e.name} ${e.resultText}`)
    }));
  }

  // bodyWeightLog stores kg regardless of the display setting, and isn't guaranteed sorted
  // (logWeight filters-then-appends), so sort before taking the latest — same as
  // bodyWeightChartData() in logic.ts. Converted to the user's units here so the model talks
  // about the number they actually see in the app.
  const bw = (s.bodyWeightLog || []).slice().sort((a, b) => a.date.localeCompare(b.date));
  const latest = bw.length ? bw[bw.length - 1] : null;
  if (latest) ctx.bodyWeight = { value: displayWeight(latest.weightKg, s.units), when: relativeDay(latest.date) };

  ctx.stats = buildStats(s);
  ctx.catalog = buildCatalog();

  return ctx;
}

// ---------- proposal resolution ----------

// Same normalize rule the exercise-photo matching used (phase 22): lowercase, drop
// apostrophes/punctuation, collapse whitespace. Since the catalog names come straight from EXLIB,
// the model echoes them verbatim and an exact normalized match resolves cleanly; the fuzzier
// fallbacks below only exist to catch a paraphrase ("Romanian Deadlift" for "RDL") gracefully.
function normalizeName(s: string): string {
  return s.toLowerCase().replace(/['’]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
}

let exactNameToId: Record<string, string> | null = null;
function nameToIdMap(): Record<string, string> {
  if (!exactNameToId) {
    exactNameToId = {};
    for (const [id, def] of Object.entries(EXLIB)) {
      const key = normalizeName(def.name);
      // A name made entirely of punctuation/emoji ("...", "🔥") normalizes to '' — legal for a
      // custom exercise, since saveExerciseForm only requires a non-empty *trimmed* name. Letting
      // it into the map would poison every lookup: the substring fallback below tests
      // `q.includes(name)`, which is unconditionally true for ''. That turns any unresolvable
      // name into a confidently-wrong match instead of an honest error card.
      if (key) exactNameToId[key] = id;
    }
  }
  return exactNameToId;
}

export function resolveExerciseId(rawName: string): string | null {
  const q = normalizeName(rawName);
  if (!q) return null;
  const map = nameToIdMap();
  if (map[q]) return map[q];

  // substring either direction (e.g. "bench press" ⊂ "close grip bench press" or vice versa)
  const entries = Object.entries(map);
  const sub = entries.find(([name]) => name === q || name.includes(q) || q.includes(name));
  if (sub) return sub[1];

  // token-overlap best match, requiring a strong majority so a bad guess resolves to nothing
  // (→ an error card) rather than to a confidently-wrong exercise.
  const qTokens = new Set(q.split(' '));
  let best: { id: string; score: number } | null = null;
  for (const [name, id] of entries) {
    const nTokens = name.split(' ');
    const overlap = nTokens.filter(t => qTokens.has(t)).length;
    const score = overlap / Math.max(qTokens.size, nTokens.length);
    if (score > (best?.score ?? 0)) best = { id, score };
  }
  return best && best.score >= 0.6 ? best.id : null;
}

function resolveDayKey(rawName: string, s: AppState): string | null {
  const q = normalizeName(rawName);
  if (!q) return null;
  for (const key of s.dayOrder) {
    const d = s.program[key];
    if (!d) continue;
    if (normalizeName(dayDisplayName(d)) === q || normalizeName(d.label) === q) return key;
  }
  // looser fallback: the label appearing inside the model's string, or vice versa
  for (const key of s.dayOrder) {
    const d = s.program[key];
    if (!d) continue;
    const label = normalizeName(d.label);
    if (label && (q.includes(label) || label.includes(q))) return key;
  }
  return null;
}

const SPLIT_LABELS: Record<string, string> = {
  ppl6: 'Push / Pull / Legs (6-day)', upper_lower: 'Upper / Lower', full_body: 'Full Body',
  bro_split: 'Body-Part Split', ppl_rest: 'PPL with Rest Between', ppl_ul_hybrid: 'PPL + Upper/Lower'
};
const TRAINING_LABELS_SHORT: Record<string, string> = {
  progressive_overload: 'Progressive Overload', strength: 'Strength', hit: 'Low Volume / High Effort',
  endurance: 'Endurance', general: 'General Fitness'
};
const SCREEN_LABELS: Record<string, string> = {
  program: 'Program', progress: 'Progress', exercises: 'Exercises', achievements: 'Achievements'
};

function str(v: unknown): string | undefined { return typeof v === 'string' ? v : undefined; }

/**
 * A *name* argument from a tool call, or undefined when it isn't usable as one. Missing, blank and
 * punctuation-only values all collapse to undefined rather than being passed downstream: none can
 * ever resolve to a real exercise or day, and interpolating one into an error message is what
 * produced the meaningless `"" isn't in the exercise library.` card. Callers turn undefined into
 * INCOMPLETE instead of quoting an empty string back at the user.
 *
 * The Worker now drops tool calls missing a schema-required field (worker/src/tools.ts
 * #isCompleteToolInput), so this is the second line of defence — it still matters because the
 * client is the only side that knows a name has to survive normalizeName() to be resolvable.
 */
function reqStr(v: unknown): string | undefined {
  const raw = str(v);
  return raw && normalizeName(raw) ? raw.trim() : undefined;
}

const INCOMPLETE = 'That suggestion came through incomplete — ask me to try it again.';
function num(v: unknown): number | undefined { return typeof v === 'number' && Number.isFinite(v) ? v : undefined; }
function repsIn(v: unknown): number | undefined { const n = num(v); return n != null ? Math.max(1, Math.round(n)) : undefined; }
function setsIn(v: unknown): number | undefined { const n = num(v); return n != null ? Math.max(1, Math.min(8, Math.round(n))) : undefined; }

function paramSuffix(sets?: number, reps?: number): string {
  const parts: string[] = [];
  if (sets != null) parts.push(`${sets} sets`);
  if (reps != null) parts.push(`${reps} reps`);
  return parts.length ? ` (${parts.join(', ')})` : '';
}

interface RawProposal { tool: string; input: unknown }

/** Turn the Worker's raw tool calls into resolved, apply-ready (or clearly-errored) proposals. */
export function parseProposals(raw: unknown, s: AppState): CoachProposal[] {
  if (!Array.isArray(raw)) return [];
  const out: CoachProposal[] = [];

  for (const r of raw as RawProposal[]) {
    if (!r || typeof r.tool !== 'string' || typeof r.input !== 'object' || r.input == null) continue;
    const input = r.input as Record<string, unknown>;
    const err = (summary: string, error: string): CoachProposal => ({ kind: kindFor(r.tool), summary, error, status: 'pending' });

    switch (r.tool) {
      case 'propose_add_exercise': {
        const dayName = reqStr(input.day), exName_ = reqStr(input.exercise);
        const sets = setsIn(input.sets), reps = repsIn(input.reps);
        if (!dayName || !exName_) { out.push(err('Add exercise', INCOMPLETE)); break; }
        const dayKey = resolveDayKey(dayName, s), exId = resolveExerciseId(exName_);
        if (!dayKey) { out.push(err(`Add ${exName_}`, `Couldn't find a day called "${dayName}".`)); break; }
        if (!exId) { out.push(err(`Add ${exName_}`, `"${exName_}" isn't in the exercise library.`)); break; }
        out.push({
          kind: 'add_exercise',
          summary: `Add ${exName(exId)} to ${s.program[dayKey].label}${paramSuffix(sets, reps)}`,
          payload: { kind: 'add_exercise', dayKey, exId, sets, reps }, status: 'pending'
        });
        break;
      }
      case 'propose_swap_exercise': {
        const dayName = reqStr(input.day), fromName = reqStr(input.from_exercise), toName = reqStr(input.to_exercise);
        if (!dayName || !fromName || !toName) { out.push(err('Swap exercise', INCOMPLETE)); break; }
        const dayKey = resolveDayKey(dayName, s), toExId = resolveExerciseId(toName);
        if (!dayKey) { out.push(err('Swap exercise', `Couldn't find a day called "${dayName}".`)); break; }
        const fromExId = resolveExerciseOnDay(fromName, dayKey, s);
        if (!fromExId) { out.push(err('Swap exercise', `"${fromName}" isn't on ${s.program[dayKey].label}.`)); break; }
        if (!toExId) { out.push(err(`Swap in ${toName}`, `"${toName}" isn't in the exercise library.`)); break; }
        out.push({
          kind: 'swap_exercise',
          summary: `Swap ${exName(fromExId)} → ${exName(toExId)} on ${s.program[dayKey].label}`,
          payload: { kind: 'swap_exercise', dayKey, fromExId, toExId }, status: 'pending'
        });
        break;
      }
      case 'propose_remove_exercise': {
        const dayName = reqStr(input.day), exName_ = reqStr(input.exercise);
        if (!dayName || !exName_) { out.push(err('Remove exercise', INCOMPLETE)); break; }
        const dayKey = resolveDayKey(dayName, s);
        if (!dayKey) { out.push(err('Remove exercise', `Couldn't find a day called "${dayName}".`)); break; }
        const exId = resolveExerciseOnDay(exName_, dayKey, s);
        if (!exId) { out.push(err('Remove exercise', `"${exName_}" isn't on ${s.program[dayKey].label}.`)); break; }
        out.push({
          kind: 'remove_exercise',
          summary: `Remove ${exName(exId)} from ${s.program[dayKey].label}`,
          payload: { kind: 'remove_exercise', dayKey, exId }, status: 'pending'
        });
        break;
      }
      case 'propose_set_exercise_params': {
        const dayName = reqStr(input.day), exName_ = reqStr(input.exercise);
        const sets = setsIn(input.sets), reps = repsIn(input.reps);
        if (!dayName || !exName_) { out.push(err('Adjust exercise', INCOMPLETE)); break; }
        const dayKey = resolveDayKey(dayName, s);
        if (!dayKey) { out.push(err('Adjust exercise', `Couldn't find a day called "${dayName}".`)); break; }
        const exId = resolveExerciseOnDay(exName_, dayKey, s);
        if (!exId) { out.push(err('Adjust exercise', `"${exName_}" isn't on ${s.program[dayKey].label}.`)); break; }
        if (sets == null && reps == null) { out.push(err('Adjust exercise', 'No new sets or reps were given.')); break; }
        out.push({
          kind: 'set_params',
          summary: `Set ${exName(exId)} on ${s.program[dayKey].label} to${paramSuffix(sets, reps)}`,
          payload: { kind: 'set_params', dayKey, exId, sets, reps }, status: 'pending'
        });
        break;
      }
      case 'propose_set_day_kind': {
        const dayName = reqStr(input.day), kind = str(input.kind)?.trim();
        if (!dayName || !kind) { out.push(err('Change day type', INCOMPLETE)); break; }
        if (kind !== 'training' && kind !== 'rest') { out.push(err('Change day type', `"${kind}" isn't a day type — it has to be training or rest.`)); break; }
        const dayKey = resolveDayKey(dayName, s);
        if (!dayKey) { out.push(err('Change day type', `Couldn't find a day called "${dayName}".`)); break; }
        const day = s.program[dayKey];
        if ((day.kind || 'training') === kind) { out.push(err('Change day type', `${day.label} is already a ${kind === 'rest' ? 'rest' : 'training'} day.`)); break; }
        out.push({
          kind: 'set_day_kind',
          summary: kind === 'rest'
            ? `Make ${day.label} a rest day${day.exercises.length ? ' (its exercises are kept)' : ''}`
            : `Make ${day.label} a training day`,
          payload: { kind: 'set_day_kind', dayKey, dayKind: kind }, status: 'pending'
        });
        break;
      }
      case 'propose_rename_day': {
        const dayName = reqStr(input.day), label = reqStr(input.name);
        if (!dayName || !label) { out.push(err('Rename day', INCOMPLETE)); break; }
        const dayKey = resolveDayKey(dayName, s);
        if (!dayKey) { out.push(err('Rename day', `Couldn't find a day called "${dayName}".`)); break; }
        out.push({
          kind: 'rename_day',
          summary: `Rename ${s.program[dayKey].label} to "${label}"`,
          payload: { kind: 'rename_day', dayKey, label }, status: 'pending'
        });
        break;
      }
      case 'propose_build_program': {
        const splitId = str(input.split)?.trim() ?? '', trainingType = str(input.training_type)?.trim() ?? '';
        const name = str(input.name)?.trim() || undefined;
        if (!splitId || !trainingType) { out.push(err('Build a program', INCOMPLETE)); break; }
        if (!SPLIT_LABELS[splitId]) { out.push(err('Build a program', `Unknown split "${splitId}".`)); break; }
        if (!TRAINING_LABELS_SHORT[trainingType]) { out.push(err('Build a program', `Unknown training style "${trainingType}".`)); break; }
        out.push({
          kind: 'build_program',
          summary: `Build a new ${SPLIT_LABELS[splitId]} program (${TRAINING_LABELS_SHORT[trainingType]})${name ? ` — "${name}"` : ''}. This replaces your current program.`,
          payload: { kind: 'build_program', splitId, trainingType: trainingType as TrainingType, name }, status: 'pending'
        });
        break;
      }
      case 'propose_log_bodyweight': {
        const value = num(input.value);
        if (value == null || value <= 0) { out.push(err('Log bodyweight', 'That bodyweight value looks off.')); break; }
        out.push({
          kind: 'log_bodyweight',
          summary: `Log today's bodyweight as ${value} ${s.units}`,
          payload: { kind: 'log_bodyweight', displayValue: value }, status: 'pending'
        });
        break;
      }
      case 'propose_navigate': {
        const dayName = reqStr(input.day), screen = str(input.screen)?.trim();
        if (dayName) {
          const dayKey = resolveDayKey(dayName, s);
          if (!dayKey) { out.push(err('Open day', `Couldn't find a day called "${dayName}".`)); break; }
          out.push({
            kind: 'navigate', summary: `Open ${s.program[dayKey].label}`,
            payload: { kind: 'navigate', dayKey }, status: 'pending'
          });
          break;
        }
        if (screen && SCREEN_LABELS[screen]) {
          out.push({
            kind: 'navigate', summary: `Open the ${SCREEN_LABELS[screen]} screen`,
            payload: { kind: 'navigate', screen: screen as Screen }, status: 'pending'
          });
          break;
        }
        out.push(err('Open screen', 'No valid screen or day was given.'));
        break;
      }
      default:
        // Unknown tool name (shouldn't happen — the Worker only exposes the tools above).
        break;
    }
  }
  return out;
}

function resolveExerciseOnDay(rawName: string, dayKey: string, s: AppState): string | null {
  const day = s.program[dayKey];
  if (!day) return null;
  const generic = resolveExerciseId(rawName);
  // Prefer a match that's actually on the day; fall back to the generic resolve only if the
  // day happens to contain it anyway.
  const q = normalizeName(rawName);
  const onDay = day.exercises.find(e => normalizeName(exName(e.id)) === q)
    ?? day.exercises.find(e => e.id === generic);
  return onDay ? onDay.id : null;
}

function kindFor(tool: string): CoachProposal['kind'] {
  switch (tool) {
    case 'propose_add_exercise': return 'add_exercise';
    case 'propose_swap_exercise': return 'swap_exercise';
    case 'propose_remove_exercise': return 'remove_exercise';
    case 'propose_set_exercise_params': return 'set_params';
    case 'propose_set_day_kind': return 'set_day_kind';
    case 'propose_rename_day': return 'rename_day';
    case 'propose_build_program': return 'build_program';
    case 'propose_log_bodyweight': return 'log_bodyweight';
    default: return 'navigate';
  }
}

/**
 * A stable-per-device id, so the Worker has something to meter against during testing.
 *
 * Explicitly NOT a security boundary: anyone can clear it and get a fresh budget. It is a
 * placeholder for a real, subscription-backed user id (see worker/README.md). Kept in its own
 * localStorage key rather than in AppState so that restoring a backup onto a second device
 * doesn't clone one device's identity onto another.
 */
const DEVICE_ID_KEY = 'alpha-lifts-device-id';

export function deviceId(): string {
  try {
    const existing = localStorage.getItem(DEVICE_ID_KEY);
    if (existing) return existing;
    const fresh = crypto.randomUUID();
    localStorage.setItem(DEVICE_ID_KEY, fresh);
    return fresh;
  } catch {
    return 'anonymous';
  }
}

/**
 * Lightweight probe for whether this device may use the coach — no Anthropic call, no cost. Drives
 * the chat-vs-locked screen. Returns 'unknown' on any network/parse failure (offline, Worker down):
 * we don't lock someone out on a failed probe, since the real send is gated server-side anyway.
 */
export async function fetchCoachStatus(): Promise<CoachEntitlement> {
  if (!COACH_CONFIGURED) return 'unknown';
  try {
    const res = await fetch(COACH_API_URL, {
      method: 'POST',
      headers: coachHeaders(),
      body: JSON.stringify({ op: 'status', userId: deviceId() })
    });
    if (!res.ok) return 'unknown';
    const data = (await res.json()) as { entitled?: boolean };
    return data.entitled === false ? 'locked' : 'entitled';
  } catch {
    return 'unknown';
  }
}

export type CoachResult =
  | { ok: true; reply: string; rawProposals: unknown }
  | { ok: false; error: string };

export async function askCoach(messages: CoachMessage[], context: CoachContext): Promise<CoachResult> {
  if (!COACH_CONFIGURED) {
    return { ok: false, error: 'The AI coach is not configured for this build.' };
  }

  let res: Response;
  try {
    res = await fetch(COACH_API_URL, {
      method: 'POST',
      headers: coachHeaders(),
      body: JSON.stringify({ messages, context, userId: deviceId() })
    });
  } catch {
    // The app is an offline-capable PWA; this is the common case, not an edge case.
    return { ok: false, error: 'Can’t reach the coach. Check your connection and try again.' };
  }

  let data: { reply?: string; error?: string; truncated?: boolean; droppedProposals?: number; proposals?: unknown };
  try {
    data = await res.json();
  } catch {
    return { ok: false, error: 'Got an unreadable response from the coach.' };
  }

  if (!res.ok || data.error) {
    switch (data.error) {
      case 'not_entitled':
        return { ok: false, error: 'This device isn’t approved for the coach yet. Share your Coach ID (shown below) to get access.' };
      case 'budget_exhausted':
        return { ok: false, error: 'You’ve used up this month’s coach messages.' };
      case 'rate_limited':
        return { ok: false, error: 'Too many messages at once — give it a few seconds.' };
      case 'refused':
        return { ok: false, error: 'The coach couldn’t answer that one. Try rephrasing it.' };
      default:
        return { ok: false, error: 'The coach hit an error. Try again in a moment.' };
    }
  }

  const proposals = Array.isArray(data.proposals) ? data.proposals : [];
  let reply = (data.reply || '').trim();
  // A tool-only turn can come back with no prose. Give the proposal cards a lead-in rather than
  // rendering an empty coach bubble above them.
  if (!reply && proposals.length) reply = 'Here’s what I can do — tap Apply to make the change:';
  if (!reply) return { ok: false, error: 'The coach came back empty. Try asking again.' };

  if (data.truncated) reply = `${reply}…`;
  // The Worker dropped a tool call whose input arrived incomplete. Say so — the prose above may
  // describe a change that has no card under it, and silently showing fewer cards than were
  // promised is worse than admitting the answer got cut off.
  if (data.droppedProposals) {
    const n = data.droppedProposals;
    reply = `${reply}\n\n(${n === 1 ? 'One change I described didn’t' : `${n} changes I described didn’t`} come through in full — ask me again and I’ll redo ${n === 1 ? 'it' : 'them'}.)`;
  }

  return { ok: true, reply, rawProposals: proposals };
}

// ---------- AI plan parsing (Pro-gated /parse-plan route) ----------

const TRAINING_TYPES: TrainingType[] = ['progressive_overload', 'strength', 'hit', 'endurance', 'general'];
const PARSE_WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

interface RawPlanExercise { name?: string; muscle?: string; equipment?: string; sets?: number; reps?: number }
interface RawPlanDay { label?: string; exercises?: RawPlanExercise[] }
interface RawPlan { program_name?: string; training_type?: string; days?: RawPlanDay[]; error?: string }

function clampInt(v: unknown, lo: number, hi: number, fallback: number): number {
  const n = typeof v === 'number' ? Math.round(v) : parseInt(String(v), 10);
  return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : fallback;
}

/**
 * Send pasted free-text to the Pro-gated `/parse-plan` Worker route and turn the structured result
 * into a ParsedPlan the import flow can stage. Exercises are resolved to real library ids where a
 * name matches; anything unmatched becomes a lightweight custom ExerciseDef (built from the model's
 * muscle/equipment guess). Throws a friendly Error on any failure so the caller can surface it.
 */
export async function parsePlanText(text: string, fallbackType: TrainingType): Promise<ParsedPlan> {
  if (!COACH_CONFIGURED) throw new Error('AI plan reading isn’t available in this build.');

  let res: Response;
  try {
    res = await fetch(`${COACH_API_URL}/parse-plan`, {
      method: 'POST',
      headers: coachHeaders(),
      body: JSON.stringify({ text, catalog: buildCatalog(), userId: deviceId() })
    });
  } catch {
    throw new Error('Can’t reach the server. Check your connection and try again.');
  }

  let data: RawPlan;
  try {
    data = (await res.json()) as RawPlan;
  } catch {
    throw new Error('Got an unreadable response from the server.');
  }

  if (!res.ok || data.error) {
    if (res.status === 401 || data.error === 'unauthorized') throw new Error('Sign in to use AI plan reading.');
    if (data.error === 'not_entitled') throw new Error('AI plan reading is a Pro feature — subscribe to use it.');
    if (data.error === 'budget_exhausted') throw new Error('You’ve used up this month’s AI usage.');
    if (data.error === 'too_long') throw new Error('That plan is too long to read in one go — try importing a few days at a time.');
    if (data.error === 'bad_plan') throw new Error('Couldn’t make sense of that. Try including day names and exercises with sets and reps.');
    throw new Error('The plan reader hit an error. Try again in a moment.');
  }

  return buildPlanFromParse(data, fallbackType);
}

function buildPlanFromParse(raw: RawPlan, fallbackType: TrainingType): ParsedPlan {
  const days: ProgramDays = {};
  const dayOrder: string[] = [];
  const customExercises: Record<string, ExerciseDef> = {};
  const usedIds = new Set(Object.keys(EXLIB));
  const createdByName: Record<string, string> = {}; // dedupe same custom name across days
  const usedKeys = new Set<string>();

  const uniqueId = (base: string): string => {
    const root = base || 'exercise';
    let id = root, n = 2;
    while (usedIds.has(id)) id = `${root}_${n++}`;
    usedIds.add(id);
    return id;
  };

  (raw.days || []).forEach((rd, di) => {
    const label = (rd.label || `Day ${di + 1}`).trim().slice(0, 40) || `Day ${di + 1}`;
    let key = slugify(label), n = 2;
    while (usedKeys.has(key)) key = `${slugify(label) || 'day'}_${n++}`;

    const exercises: ProgramExercise[] = [];
    for (const re of rd.exercises || []) {
      const name = (re.name || '').trim();
      if (!name) continue;
      let id = resolveExerciseId(name);
      if (!id) {
        const norm = name.toLowerCase();
        id = createdByName[norm];
        if (!id) {
          const muscle = (MUSCLES.includes(re.muscle as Muscle) ? (re.muscle as Muscle) : 'Chest');
          const equip = EQUIP_CATALOG.find(e => e.v === re.equipment) || EQUIP_CATALOG[0];
          const reps = clampInt(re.reps, 1, 30, 10);
          id = uniqueId(slugify(name));
          customExercises[id] = {
            name: name.slice(0, 60), muscle, compound: false, restBase: 90, pattern: id,
            equip: [equip], repLo: reps, repHi: reps, cue: 'Imported exercise — edit its details anytime.', secondary: []
          };
          createdByName[norm] = id;
        }
      }
      exercises.push(mkEx(id, clampInt(re.sets, 1, 8, 3), 0, { weight: 0, reps: clampInt(re.reps, 1, 300, 10), hitTop: true }));
    }
    if (!exercises.length) return; // drop empty days
    usedKeys.add(key);
    days[key] = { key, label, dow: PARSE_WEEKDAYS[di % 7], skipped: false, exercises };
    dayOrder.push(key);
  });

  if (!dayOrder.length) throw new Error('That didn’t contain any exercises we could read.');

  return {
    name: (raw.program_name || 'Imported Plan').trim().slice(0, 60) || 'Imported Plan',
    trainingType: TRAINING_TYPES.includes(raw.training_type as TrainingType) ? (raw.training_type as TrainingType) : fallbackType,
    dayOrder,
    days,
    customExercises
  };
}
