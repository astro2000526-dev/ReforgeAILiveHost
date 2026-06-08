// Browser-side Supabase client (anon key) — used ONLY by "use client" code:
// the login page and the OAuth callback page.
//
// We don't ship @supabase/ssr, so the SDK keeps the session in the browser
// (localStorage) and runs the PKCE flow there. After exchangeCodeForSession we
// manually mirror the access token into a readable cookie so the server helper
// `current-user.ts` can verify it (see lib/auth-cookie.ts).
//
// This points at Supabase CLOUD in prod (NEXT_PUBLIC_SUPABASE_URL =
// https://<ref>.supabase.co). The lean self-hosted PostgREST stack has no Auth
// service — Google login is a cloud-only feature, gated by NEXT_PUBLIC_AUTH_ENABLED.

import { createClient, type SupabaseClient } from '@supabase/supabase-js'

let _client: SupabaseClient | null = null

// Singleton: multiple createClient instances with the same storageKey warn and
// can race on the PKCE verifier.
export function getSupabaseBrowser(): SupabaseClient {
  if (_client) return _client
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url) throw new Error('NEXT_PUBLIC_SUPABASE_URL is not set')
  if (!anonKey) throw new Error('NEXT_PUBLIC_SUPABASE_ANON_KEY is not set')
  _client = createClient(url, anonKey, {
    auth: {
      flowType: 'pkce',
      persistSession: true,
      autoRefreshToken: true,
      // We trigger the code→session exchange manually on /auth/callback so we
      // can mirror the token to a cookie; don't let the SDK race us on load.
      detectSessionInUrl: false,
    },
  })
  return _client
}
