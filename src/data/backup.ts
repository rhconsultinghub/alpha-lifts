import type { AppState } from './types';
import { createInitialState } from './initialState';

// Full-state JSON download — the only backup mechanism this app has, since everything lives in
// one localStorage key with no server. Filename carries today's date so repeated exports don't
// silently overwrite each other in a downloads folder.
export function exportBackup(state: AppState): void {
  const json = JSON.stringify(state, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const dateStr = new Date().toISOString().slice(0, 10);
  const a = document.createElement('a');
  a.href = url;
  a.download = `alpha-lifts-backup-${dateStr}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Same shape loadInitial() already uses to bring an older persisted session up to the current
// AppState — reused here so a restored backup gets the same missing-field-falls-back-to-default
// safety net a normal app load already has.
export function mergeBackupIntoDefaults(data: Partial<AppState>): AppState {
  return { ...createInitialState(), ...data };
}
