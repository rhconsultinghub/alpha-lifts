import { EXLIB } from './exercises';
import type { AppState, ExerciseHistoryEntry, HistoryEntry, Units } from './types';

// One-tap spreadsheet export of the workout history — the "share with a coach / analyze in
// Sheets" format the JSON backup isn't. One row per logged set, Strong-style: session fields
// repeat on every row so the file filters/pivots cleanly without joins.
//
// Two data sources, best-fidelity-first:
//  - exerciseHistory carries real per-set rows (weight/reps/RIR/equipment/deload) but is capped
//    to the last 8 sessions per equipment variant. Rows are joined back to their session by the
//    same date+day key weeklyHeatmapData() uses.
//  - Sessions that have aged out of that cap fall back to parsing the display resultText
//    ("80 kg × 8/8/6" — one weight for the set list, unit as logged). Equipment/RIR are unknown
//    there and left blank.

const HEADER = [
  'Date', 'Workout', 'Program', 'Week', 'Duration (min)',
  'Exercise', 'Equipment', 'Set', 'Weight', 'Unit', 'Reps', 'Seconds', 'RIR', 'PR', 'Deload'
];

/** Quote a CSV field only when it needs it (comma, quote, or newline). */
export function escapeCsv(v: string | number | null | undefined): string {
  if (v == null) return '';
  const s = String(v);
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

// HistoryEntry.id is 'h' + Date.now() — the only real timestamp in the persisted shape (the
// display date string is locale-formatted with no year). Same derivation logic.ts uses.
function isoDateOf(h: HistoryEntry): string {
  const n = Number(h.id.slice(1));
  return Number.isFinite(n) ? new Date(n).toISOString().slice(0, 10) : '';
}

// Weights are stored internally in kg; export in the user's current display unit at 0.1
// precision (fmtWeight's 5-lb display grid would erase real progress steps in a spreadsheet).
function displayWeight(kg: number, units: Units): number {
  return units === 'lb' ? Math.round(kg * 2.20462 * 10) / 10 : Math.round(kg * 10) / 10;
}

// "80 kg × 8/8/6" → { weight: 80, unit: 'kg', reps: [8, 8, 6] }. The fallback path for sessions
// whose per-set rows have aged out of the exerciseHistory cap — resultText stores one weight for
// the whole set list, in whatever unit was active when it was logged.
function parseResultText(text: string): { weight: number; unit: string; reps: number[] } | null {
  const m = /^([\d.]+)\s*(kg|lb)\s*×\s*([\d/]+)$/.exec(text || '');
  if (!m) return null;
  const reps = m[3].split('/').map(Number).filter(n => Number.isFinite(n));
  if (!reps.length) return null;
  return { weight: Number(m[1]), unit: m[2], reps };
}

export function buildWorkoutCsv(state: AppState): string {
  // Exercise display name → def, for trackingMode lookups on fallback rows. EXLIB already holds
  // merged custom exercises at runtime, so custom names resolve too.
  const defByName = new Map(Object.keys(EXLIB).map(id => [EXLIB[id].name, EXLIB[id]]));

  // date|day|exerciseName → per-set entries, consumed oldest-first as sessions are walked so a
  // day played twice on one date pairs each session with its own entry.
  const entryQueue = new Map<string, ExerciseHistoryEntry[]>();
  Object.entries(state.exerciseHistory).forEach(([exId, entries]) => {
    const lib = EXLIB[exId];
    if (!lib) return;
    entries.forEach(e => {
      const key = e.date + '|' + e.day + '|' + lib.name;
      const list = entryQueue.get(key) || [];
      list.push(e);
      entryQueue.set(key, list);
    });
  });

  const lines = [HEADER.join(',')];
  // history is stored newest-first; a spreadsheet reads better oldest-first.
  const sessions = state.history.filter(h => h.status === 'completed').slice().reverse();
  for (const h of sessions) {
    const base = [isoDateOf(h), h.day, h.program, h.weekNumber, h.durationMin];
    for (const row of h.exercises) {
      if (row.badgeText === 'Skipped') continue;
      const def = defByName.get(row.name);
      const isTime = def?.trackingMode === 'time';
      const pr = row.isPR ? 'Yes' : '';

      const key = h.date + '|' + h.day + '|' + row.name;
      const queued = entryQueue.get(key);
      const entry = queued?.shift();
      if (entry) {
        const sets = entry.sets && entry.sets.length ? entry.sets : [{ weight: entry.weight, reps: entry.reps, rir: undefined }];
        const equipLabel = def?.equip.find(o => o.v === entry.equip)?.label ?? entry.equip ?? '';
        sets.forEach((set, i) => {
          lines.push([
            ...base, row.name, equipLabel, i + 1,
            isTime ? '' : displayWeight(set.weight, state.units),
            isTime ? '' : state.units,
            isTime ? '' : set.reps,
            isTime ? set.reps : '',
            set.rir ?? '', pr, entry.deload ? 'Yes' : ''
          ].map(escapeCsv).join(','));
        });
        continue;
      }

      const parsed = parseResultText(row.resultText);
      if (!parsed) continue;
      parsed.reps.forEach((reps, i) => {
        lines.push([
          ...base, row.name, '', i + 1,
          isTime ? '' : parsed.weight,
          isTime ? '' : parsed.unit,
          isTime ? '' : reps,
          isTime ? reps : '',
          '', pr, ''
        ].map(escapeCsv).join(','));
      });
    }
  }
  return lines.join('\r\n') + '\r\n';
}

export function exportWorkoutCsv(state: AppState): void {
  const csv = buildWorkoutCsv(state);
  // UTF-8 BOM so Excel detects the encoding (exercise names can carry non-ASCII).
  const blob = new Blob([String.fromCharCode(0xfeff), csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const dateStr = new Date().toISOString().slice(0, 10);
  const a = document.createElement('a');
  a.href = url;
  a.download = `alpha-lifts-history-${dateStr}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
