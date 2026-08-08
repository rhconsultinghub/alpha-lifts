/**
 * Plan share links — replaces "export a JSON file and send it somehow" with a copyable URL.
 * POST /share (session-authed) stores one plan envelope and returns a short id; the app builds
 * `<app>/#plan=<id>`, and a recipient's app fetches GET /share/<id> on boot and stages the plan
 * behind the SAME import confirm the file path uses. The Worker treats the plan as an opaque
 * (size-capped) JSON blob — all validation happens client-side in parsePlanFile, exactly as it
 * does for a file, so a hostile shared plan degrades to the same "not a valid plan" error.
 */

import type { Env } from './index';
import { json } from './http';

/** A shared plan is a program, not a backup — 64 KB fits any realistic week many times over. */
const MAX_PLAN_BYTES = 64 * 1024;

/** Per-account ceiling: newest wins, oldest is dropped. Keeps a hot loop from filling D1. */
const MAX_SHARES_PER_USER = 20;

function randomShareId(): string {
  const bytes = new Uint8Array(9);
  crypto.getRandomValues(bytes);
  let s = '';
  bytes.forEach(b => { s += b.toString(36).padStart(2, '0').slice(0, 2); });
  return s.slice(0, 12);
}

export async function handleShareCreate(userId: string, body: { plan?: unknown }, env: Env, cors: Record<string, string>): Promise<Response> {
  if (!env.DB) return json({ error: 'share_not_configured' }, 503, cors);
  if (!body.plan || typeof body.plan !== 'object') return json({ error: 'missing_plan' }, 400, cors);
  let planJson: string;
  try {
    planJson = JSON.stringify(body.plan);
  } catch {
    return json({ error: 'invalid_plan' }, 400, cors);
  }
  if (new TextEncoder().encode(planJson).byteLength > MAX_PLAN_BYTES) {
    return json({ error: 'plan_too_large' }, 413, cors);
  }
  const id = randomShareId();
  await env.DB.prepare('INSERT INTO shared_plans (id, user_id, plan_json, created_at) VALUES (?, ?, ?, ?)')
    .bind(id, userId, planJson, Date.now()).run();
  // Trim this account's oldest shares past the cap. Links are cheap; old ones dying quietly
  // beats unbounded growth.
  await env.DB.prepare(
    `DELETE FROM shared_plans WHERE user_id = ? AND id NOT IN
       (SELECT id FROM shared_plans WHERE user_id = ? ORDER BY created_at DESC LIMIT ?)`
  ).bind(userId, userId, MAX_SHARES_PER_USER).run();
  return json({ id }, 200, cors);
}

export async function handleShareGet(id: string, env: Env, cors: Record<string, string>): Promise<Response> {
  if (!env.DB) return json({ error: 'share_not_configured' }, 503, cors);
  if (!/^[a-z0-9]{6,16}$/.test(id)) return json({ error: 'not_found' }, 404, cors);
  const row = await env.DB.prepare('SELECT plan_json FROM shared_plans WHERE id = ?').bind(id).first<{ plan_json: string }>();
  if (!row) return json({ error: 'not_found' }, 404, cors);
  let plan: unknown = null;
  try {
    plan = JSON.parse(row.plan_json);
  } catch {
    return json({ error: 'not_found' }, 404, cors);
  }
  return json({ plan }, 200, cors);
}
