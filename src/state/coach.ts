import type { AppState } from '../data/types';
import { EXLIB } from '../data/exercises';

/**
 * Client half of the AI coach. Everything security-relevant — the API key, the system prompt,
 * the topic restriction, the usage metering — lives in the Cloudflare Worker (`worker/`), not
 * here. This file only assembles context, POSTs, and parses the reply.
 *
 * Set VITE_COACH_API_URL to the deployed Worker URL. When it's unset the coach tab renders a
 * "not configured" state rather than failing at request time, so a build without the env var
 * still works as an app.
 */
export const COACH_API_URL: string = import.meta.env.VITE_COACH_API_URL || '';

export const COACH_CONFIGURED = COACH_API_URL !== '';

/** How many past sessions to summarise into the prompt. Every message re-sends this and is
 *  billed for it, so this is a cost knob as much as a quality one. */
const RECENT_WORKOUT_LIMIT = 5;

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
  programName?: string;
  trainingType?: string;
  weekNumber?: number;
  days?: { name: string; kind: string; exercises: string[] }[];
  recentWorkouts?: { day: string; when: string; exercises: string[] }[];
  bodyWeight?: { value: number; when: string } | null;
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

export function buildCoachContext(s: AppState): CoachContext {
  const ctx: CoachContext = { units: s.units };

  if (s.programName) ctx.programName = s.programName;
  if (s.trainingType) ctx.trainingType = s.trainingType;
  if (s.weekNumber) ctx.weekNumber = s.weekNumber;

  const days = s.dayOrder.map(k => s.program[k]).filter(Boolean);
  if (days.length) {
    ctx.days = days.map(d => ({
      // Prefixed with the weekday because labels repeat across a week — a PPL split has two
      // separate "Push Day"s with different exercises, and without the day-of-week the model
      // sees two identically-named entries and can't tell which one the user means.
      name: d.dow ? `${d.dow} — ${d.label}` : d.label,
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

  return ctx;
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

export type CoachResult = { ok: true; reply: string } | { ok: false; error: string };

export async function askCoach(messages: CoachMessage[], context: CoachContext): Promise<CoachResult> {
  if (!COACH_CONFIGURED) {
    return { ok: false, error: 'The AI coach is not configured for this build.' };
  }

  let res: Response;
  try {
    res = await fetch(COACH_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages, context, userId: deviceId() })
    });
  } catch {
    // The app is an offline-capable PWA; this is the common case, not an edge case.
    return { ok: false, error: 'Can’t reach the coach. Check your connection and try again.' };
  }

  let data: { reply?: string; error?: string; truncated?: boolean };
  try {
    data = await res.json();
  } catch {
    return { ok: false, error: 'Got an unreadable response from the coach.' };
  }

  if (!res.ok || data.error) {
    switch (data.error) {
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

  const reply = (data.reply || '').trim();
  if (!reply) return { ok: false, error: 'The coach came back empty. Try asking again.' };

  return { ok: true, reply: data.truncated ? `${reply}…` : reply };
}
