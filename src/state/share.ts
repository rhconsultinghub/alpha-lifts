/**
 * Plan share links, client half (worker/src/share.ts is the server half). Creating a link
 * uploads the active program's PlanEnvelope and returns a URL like
 * `https://…/alpha-lifts/#plan=<id>`; opening that URL routes through the SAME staged
 * plan-import confirm the JSON-file path uses (see the boot-hash handling in useApp.ts).
 */
import { COACH_API_URL, COACH_CONFIGURED } from './coach';
import { getStoredToken } from './tokenStore';
import { buildPlanEnvelope } from '../data/planIO';
import { isNative } from '../native/platform';
import type { AppState } from '../data/types';

export const SHARE_CONFIGURED = COACH_CONFIGURED;

export async function createPlanShareLink(state: AppState): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  if (!SHARE_CONFIGURED) return { ok: false, error: 'Sharing isn’t available in this build.' };
  const token = getStoredToken();
  if (!token) return { ok: false, error: 'Sign in to create a share link.' };
  try {
    const res = await fetch(`${COACH_API_URL}/share`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ plan: buildPlanEnvelope(state) })
    });
    const data = (await res.json()) as { id?: string; error?: string };
    if (!res.ok || !data.id) {
      return { ok: false, error: data.error === 'plan_too_large' ? 'This plan is too large to share.' : 'Couldn’t create the link — try again in a bit.' };
    }
    // Web: location.origin + BASE_URL is the app's real root in both dev (/) and prod
    // (/alpha-lifts/). Native: location.origin is capacitor://localhost — useless to a
    // recipient — so links always point at the web deployment, where any browser can open them.
    const root = isNative()
      ? 'https://rhconsultinghub.github.io/alpha-lifts/'
      : `${location.origin}${import.meta.env.BASE_URL}`;
    const url = `${root}#plan=${data.id}`;
    return { ok: true, url };
  } catch {
    return { ok: false, error: 'Couldn’t reach the share service — are you online?' };
  }
}

export async function fetchSharedPlan(id: string): Promise<unknown | null> {
  if (!SHARE_CONFIGURED || !/^[a-z0-9]{6,16}$/.test(id)) return null;
  try {
    const res = await fetch(`${COACH_API_URL}/share/${id}`);
    if (!res.ok) return null;
    const data = (await res.json()) as { plan?: unknown };
    return data.plan ?? null;
  } catch {
    return null;
  }
}
