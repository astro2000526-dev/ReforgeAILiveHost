// Shared PostgREST gateway base helper (server-only).
//
// Several server modules talk to Supabase via raw fetch → PostgREST instead of
// the Supabase JS client, because the JS client is ~7s slow on this host while
// raw HTTP is <50ms. They all built the same `GW` base + service-key headers;
// this centralises that one pattern.
//
// In the compose deploy the web container reaches the gateway as
// http://nginx:8088 (via NEXT_PUBLIC_SUPABASE_URL); a host-net deploy uses
// 127.0.0.1:8088. Read from env so it works in both, with a safe fallback.

import 'server-only'

const GW =
  ((process.env.SUPABASE_GATEWAY_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://127.0.0.1:8088').replace(/\/+$/, '')) +
  '/rest/v1'

// Build a PostgREST URL. `path` may include a leading slash or not.
export function gwUrl(path: string): string {
  return GW + (path.startsWith('/') ? path : `/${path}`)
}

// Auth headers for the gateway. The service key is read inside the function so
// it always reflects the current env (never captured at module load).
export function gwHeaders(): Record<string, string> {
  const SVC_KEY = process.env.SUPABASE_SERVICE_KEY ?? ''
  return { Authorization: `Bearer ${SVC_KEY}`, apikey: SVC_KEY }
}
