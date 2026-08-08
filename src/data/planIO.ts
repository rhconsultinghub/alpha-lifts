import type { AppState, ProgramDays, ExerciseDef, TrainingType, ParsedPlan } from './types';
import { saveOrShareFile } from '../native/files';

export type { ParsedPlan };

// Workout-plan (program) import/export — a lighter, shareable cousin of the full-state backup
// (backup.ts). A backup is your entire account; a plan is just one program's days/exercises/
// sets-reps, plus any *custom* exercises those days reference (so the file is self-contained and
// re-creates them on import). It never carries history, bodyweight, achievements, or settings.

const PLAN_FORMAT = 'alpha-lifts-plan';
const PLAN_VERSION = 1;

const TRAINING_TYPES: TrainingType[] = ['progressive_overload', 'strength', 'hit', 'endurance', 'general'];

export interface PlanEnvelope {
  format: typeof PLAN_FORMAT;
  version: number;
  name: string;
  trainingType: TrainingType;
  dayOrder: string[];
  days: ProgramDays;
  // Only the custom exercises referenced by `days` — built-ins live in app code and are omitted.
  customExercises: Record<string, ExerciseDef>;
}

// Collect the ids the program's days actually use, so we only bundle custom exercises in play.
function referencedIds(days: ProgramDays): Set<string> {
  const ids = new Set<string>();
  for (const day of Object.values(days)) {
    for (const ex of day.exercises) ids.add(ex.id);
  }
  return ids;
}

/** The active program as a self-contained envelope — shared by the file export below and the
 *  share-link flow (state/share.ts), so both paths always carry the identical shape. */
export function buildPlanEnvelope(state: AppState): PlanEnvelope {
  const refs = referencedIds(state.program);
  const customExercises: Record<string, ExerciseDef> = {};
  for (const [id, def] of Object.entries(state.customExercises || {})) {
    if (refs.has(id)) customExercises[id] = def;
  }
  return {
    format: PLAN_FORMAT,
    version: PLAN_VERSION,
    name: state.programName,
    trainingType: state.trainingType,
    dayOrder: state.dayOrder,
    days: state.program,
    customExercises
  };
}

// Export the active program as a plan file (delivery platform-branched in saveOrShareFile).
export function exportPlan(state: AppState): void {
  const envelope = buildPlanEnvelope(state);
  const dateStr = new Date().toISOString().slice(0, 10);
  void saveOrShareFile({
    filename: `alpha-lifts-plan-${dateStr}.json`,
    mime: 'application/json',
    data: JSON.stringify(envelope, null, 2)
  });
}

// Validate + coerce a parsed JSON object into a ParsedPlan. Throws a friendly Error on anything
// malformed so the caller (SettingsModal) can surface it, rather than staging junk.
export function parsePlanFile(raw: unknown): ParsedPlan {
  if (!raw || typeof raw !== 'object') throw new Error("That file isn't a valid plan.");
  const o = raw as Record<string, unknown>;
  if (o.format !== PLAN_FORMAT) throw new Error("That file isn't an Alpha Lifts plan.");
  if (o.version !== PLAN_VERSION) throw new Error(`Unsupported plan version (${String(o.version)}).`);

  const days = o.days;
  if (!days || typeof days !== 'object') throw new Error('The plan has no training days.');
  const dayKeys = Object.keys(days as object);
  if (dayKeys.length === 0) throw new Error('The plan has no training days.');

  const trainingType = TRAINING_TYPES.includes(o.trainingType as TrainingType)
    ? (o.trainingType as TrainingType)
    : 'progressive_overload';

  const dayOrder = Array.isArray(o.dayOrder) && o.dayOrder.every(k => typeof k === 'string' && k in (days as object))
    ? (o.dayOrder as string[])
    : dayKeys;

  const customExercises =
    o.customExercises && typeof o.customExercises === 'object'
      ? (o.customExercises as Record<string, ExerciseDef>)
      : {};

  return {
    name: typeof o.name === 'string' && o.name.trim() ? o.name.trim() : 'Imported Plan',
    trainingType,
    dayOrder,
    days: days as ProgramDays,
    customExercises
  };
}
