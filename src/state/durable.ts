/**
 * The durable/transient split for cloud sync.
 *
 * The whole AppState used to sync verbatim, which meant a second device pulled the first one's
 * open modals, half-typed inputs, and even its LIVE workout session — and every keystroke in any
 * text field dirtied the sync layer and scheduled a push of the entire blob. Sync now mirrors
 * only the DURABLE projection: what the user's training actually is (program, history, settings,
 * chat, achievements), never what their screen happens to look like this second.
 *
 * Everything here is exclusion-based on purpose: a NEW AppState field is durable (synced) by
 * default, which is the safe default for data — forgetting to list a new transient UI field
 * costs a few synced bytes, while a whitelist that forgot a new data field would silently stop
 * syncing it.
 */

import type { AppState } from '../data/types';

/** Fields that never leave this device: navigation, open-modal flags, staged confirms,
 *  in-flight inputs, and the live workout session (a session belongs to the device running it —
 *  its RESULTS sync via history/exerciseHistory when it completes). */
const TRANSIENT_FIELDS = [
  'screen',
  'showSettings',
  'confirmDeleteProgId',
  'confirmEndEarly',
  'idleWorkoutPrompt',
  'confirmRemoveExIndex',
  'editWeekOpen',
  'confirmRemoveDayKey',
  'pendingPlanUpdate',
  'activeDayKey',
  'bodyView',
  'showBodyModal',
  'muscleDrill',
  'warmupDetailId',
  'detail',
  'quickEdit',
  'swap',
  'muscleSwap',
  'workout',
  'completeSummary',
  'exerciseHistoryModalId',
  'archiveDetailId',
  'libraryDetailId',
  'exerciseSearchQuery',
  'exerciseEquipFilter',
  'measurementInput',
  'selectedMeasurementType',
  'confirmDeleteExId',
  'confirmRemoveBuilderIdx',
  'exerciseForm',
  'newProgramWizard',
  'selectedProgressEx',
  'progressPickerOpen',
  'compareLiftPickerOpen',
  'compareLiftLimitHit',
  'weekReviewOpen',
  'weekReviewSelected',
  'bodyWeightInput',
  'pendingBackupImport',
  'pendingPlanImport',
  'confirmResetApp',
  'coachInput',
  'coachPending',
  'coachEntitlement',
  'showTutorial'
] as const satisfies readonly (keyof AppState)[];

/** What actually gets pushed to (and therefore pulled from) the server. loadInitial()'s
 *  merge-over-defaults fills the stripped fields back in with defaults on whatever device
 *  adopts the blob. */
export function projectDurable(state: AppState): Partial<AppState> {
  const copy: Record<string, unknown> = { ...state };
  for (const f of TRANSIENT_FIELDS) delete copy[f];
  return copy as Partial<AppState>;
}

/**
 * When a device adopts a server copy (sign-in reconcile, or losing a mid-session sync conflict),
 * its own live session must survive: the server projection never contains a workout, so a plain
 * adopt would erase the set-by-set progress of a session this device is running RIGHT NOW.
 * Grafts the local session fields onto the adopted blob — the rest of local loses (that's what
 * losing LWW means), but the in-progress workout is this device's alone and always survives.
 */
export function mergeDeviceSession(serverState: unknown, localRaw: string | null): unknown {
  if (!serverState || typeof serverState !== 'object' || !localRaw) return serverState;
  try {
    const local = JSON.parse(localRaw) as Partial<AppState>;
    const merged: Record<string, unknown> = { ...(serverState as Record<string, unknown>) };
    let touched = false;
    if (local.workout) {
      merged.workout = local.workout;
      merged.activeDayKey = local.activeDayKey ?? null;
      merged.screen = local.screen;
      touched = true;
    }
    // The just-finished-session decision UI (complete screen + "update your plan?" prompt) is
    // equally device-local and equally unrecoverable if dropped mid-decision.
    if (local.pendingPlanUpdate) {
      merged.pendingPlanUpdate = local.pendingPlanUpdate;
      touched = true;
    }
    if (local.completeSummary && local.screen === 'complete') {
      merged.completeSummary = local.completeSummary;
      merged.screen = local.screen;
      touched = true;
    }
    return touched ? merged : serverState;
  } catch {
    return serverState;
  }
}
