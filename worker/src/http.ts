/**
 * Shared HTTP helpers — CORS + JSON responses. Factored out of index.ts so the coach route and
 * the auth/state routes all answer with the same CORS policy and body shape.
 */

export interface CorsEnv {
  ALLOWED_ORIGINS: string;
}

export function corsHeaders(origin: string | null, env: CorsEnv): Record<string, string> {
  const allowed = env.ALLOWED_ORIGINS.split(',').map(s => s.trim()).filter(Boolean);
  // Echo the origin only when it's on the list — never `*`. A wildcard here would let any page
  // on the internet spend this key / hit these accounts.
  if (!origin || !allowed.includes(origin)) return {};
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
    // Authorization is here for the session bearer token the auth/state routes require.
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin'
  };
}

export function json(body: unknown, status: number, cors: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...cors }
  });
}
