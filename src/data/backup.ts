import type { AppState, ExerciseDef } from './types';
import { createInitialState } from './initialState';
import { saveOrShareFile } from '../native/files';

// Full-state JSON export. Filename carries today's date so repeated exports don't silently
// overwrite each other. Delivery is platform-branched in saveOrShareFile: anchor download on
// web, cache-file + OS share sheet on native (where anchor downloads silently do nothing).
export function exportBackup(state: AppState): void {
  const dateStr = new Date().toISOString().slice(0, 10);
  void saveOrShareFile({
    filename: `alpha-lifts-backup-${dateStr}.json`,
    mime: 'application/json',
    data: JSON.stringify(state, null, 2)
  });
}

// Same shape loadInitial() already uses to bring an older persisted session up to the current
// AppState — reused here so a restored backup gets the same missing-field-falls-back-to-default
// safety net a normal app load already has.
export function mergeBackupIntoDefaults(data: Partial<AppState>): AppState {
  return { ...createInitialState(), ...data };
}

// ---------------------------------------------------------------------------------------------
// Import validation. A backup file is untrusted input: before this existed, ANY parsed JSON was
// spread over defaults and persisted immediately, so a corrupt/hostile file could crash render
// and brick the app on every reload (and then sync the junk to the server). This doesn't try to
// validate every field — loadInitial's shallow-merge already defaults missing ones — it rejects
// the shapes that crash or corrupt: wrong-typed core collections, non-object roots, and unsafe
// custom-exercise keys.

/** Keys that must never be written into a plain-object store via bracket assignment —
 *  `EXLIB["__proto__"] = x` rewires the library's prototype chain instead of adding an entry. */
const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * The safe subset of a customExercises record: plain-object defs with a string name and an equip
 * array, under keys that can't clobber a built-in library entry or pollute a prototype. Used by
 * every code path that merges custom exercises into the module-level EXLIB singleton (load,
 * backup restore) — junk entries are dropped, never merged.
 */
export function safeCustomEntries(customs: unknown, builtinIds: ReadonlySet<string>): [string, ExerciseDef][] {
  if (!isPlainObject(customs)) return [];
  const out: [string, ExerciseDef][] = [];
  for (const [id, def] of Object.entries(customs)) {
    if (FORBIDDEN_KEYS.has(id) || builtinIds.has(id)) continue;
    if (!isPlainObject(def)) continue;
    if (typeof def.name !== 'string' || !Array.isArray(def.equip)) continue;
    out.push([id, def as unknown as ExerciseDef]);
  }
  return out;
}

export type BackupValidation = { ok: true; data: Partial<AppState> } | { ok: false; error: string };

/** Shape-check a parsed backup before it's staged for import. Field checks are deliberately
 *  structural (right container types), not exhaustive — deep per-field validation lives where
 *  each field is consumed, and missing fields default via mergeBackupIntoDefaults. */
export function validateBackup(data: unknown): BackupValidation {
  if (!isPlainObject(data)) return { ok: false, error: 'Not a valid backup file (expected a JSON object).' };

  const bad = (field: string, expected: string): BackupValidation => ({
    ok: false,
    error: `Not a valid backup file ("${field}" should be ${expected}).`
  });

  if ('dayOrder' in data && !(Array.isArray(data.dayOrder) && data.dayOrder.every(k => typeof k === 'string'))) {
    return bad('dayOrder', 'a list of day keys');
  }
  if ('program' in data && !isPlainObject(data.program)) return bad('program', 'an object of days');
  if ('history' in data && !Array.isArray(data.history)) return bad('history', 'a list of sessions');
  if ('exerciseHistory' in data && !isPlainObject(data.exerciseHistory)) return bad('exerciseHistory', 'an object');
  if ('savedPrograms' in data && !isPlainObject(data.savedPrograms)) return bad('savedPrograms', 'an object');
  if ('customExercises' in data && !isPlainObject(data.customExercises)) return bad('customExercises', 'an object');
  if ('units' in data && data.units !== 'kg' && data.units !== 'lb') return bad('units', '"kg" or "lb"');
  if ('bodyWeightLog' in data && !Array.isArray(data.bodyWeightLog)) return bad('bodyWeightLog', 'a list');

  // Every day the order references must exist as an object, or render crashes on s.program[k].
  if (Array.isArray(data.dayOrder) && isPlainObject(data.program)) {
    for (const k of data.dayOrder as string[]) {
      const day = (data.program as Record<string, unknown>)[k];
      if (!isPlainObject(day) || !Array.isArray(day.exercises)) {
        return bad('program', `complete (day "${k}" is missing or malformed)`);
      }
    }
  }

  return { ok: true, data: data as Partial<AppState> };
}
