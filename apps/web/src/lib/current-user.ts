// Server-side "who is this request" — the MIGRATION SEAM from demo mode to
// real auth.
//
//   - If a verified Supabase access token is present → return that user's id.
//   - Otherwise → fall back to DEMO_USER_ID, so every route keeps working with
//     no login (current MVP behaviour).
//
// Migration plan: routes that today hardcode DEMO_USER_ID swap to this helper
// one at a time. /api/projects is wired as the first example. Until a route is
// migrated AND a user is logged in, nothing changes.
//
// The token is read from the `reforge-access-token` cookie (written client-side
// by /auth/callback) OR from an `Authorization: Bearer <jwt>` header. It is then
// VERIFIED by asking the Supabase Auth server via getUser(token) — we never
// trust the JWT contents without that round-trip.

import { cookies, headers } from 'next/headers'
import { createClient } from '@supabase/supabase-js'

import { AUTH_COOKIE } from '@/lib/auth-cookie'
import { DEMO_USER_ID } from '@/lib/demo-user'

function authEnabled(): boolean {
  return process.env.NEXT_PUBLIC_AUTH_ENABLED === '1'
}

// Extract a bearer token from the request: cookie first, then Authorization.
async function readAccessToken(): Promise<string | null> {
  const cookieStore = await cookies()
  const fromCookie = cookieStore.get(AUTH_COOKIE)?.value
  if (fromCookie) return fromCookie

  const headerStore = await headers()
  const auth = headerStore.get('authorization') ?? headerStore.get('Authorization')
  if (auth?.toLowerCase().startsWith('bearer ')) return auth.slice(7).trim()

  return null
}

// Verify a Supabase access token against the Auth server. Returns the user id or
// null. Uses a fresh anon client per call (cheap; no session state to share).
async function verifyToken(token: string): Promise<string | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anonKey) return null
  try {
    const supabase = createClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    })
    const { data, error } = await supabase.auth.getUser(token)
    if (error || !data?.user) return null
    return data.user.id
  } catch {
    return null
  }
}

// Resolve the current user id for the request, falling back to the demo user.
// Safe to call from any route handler / server component.
export async function getCurrentUserId(): Promise<string> {
  if (!authEnabled()) return DEMO_USER_ID
  const token = await readAccessToken()
  if (!token) return DEMO_USER_ID
  const userId = await verifyToken(token)
  return userId ?? DEMO_USER_ID
}
