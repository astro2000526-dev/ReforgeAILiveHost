// Server-side Supabase client.
//
// Uses the service_role key — BYPASSES RLS. Only import this from `route.ts`
// or Server Components. Never expose to the browser or to any code annotated
// "use client".
//
// In MVP demo mode we don't have user auth; the service_role + a fixed demo
// user UUID is how we let the wizard talk to the DB without signing anyone in.
//
// The client is created LAZILY (on first use) so importing this module during
// `next build` — when NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_KEY aren't
// injected — doesn't throw. At runtime the env is set (docker compose), so the
// first call constructs the real client.

import { createClient, type SupabaseClient } from '@supabase/supabase-js'

let _client: SupabaseClient | null = null

function getClient(): SupabaseClient {
  if (_client) return _client
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_KEY
  if (!url) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL is not set')
  }
  if (!serviceKey) {
    throw new Error('SUPABASE_SERVICE_KEY is not set')
  }
  _client = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  return _client
}

// Proxy that defers construction to first property access (e.g. .from(...)),
// so the env checks run at request time, not at module import / build time.
export const supabaseAdmin: SupabaseClient = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    const client = getClient() as unknown as Record<string | symbol, unknown>
    const value = client[prop]
    return typeof value === 'function' ? (value as (...a: unknown[]) => unknown).bind(client) : value
  },
})
