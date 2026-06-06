// Name of the cookie that mirrors the Supabase access token.
//
// Why a custom cookie? Without @supabase/ssr, the SDK persists the session in
// the browser's localStorage — invisible to the server. The OAuth callback page
// (client) writes the access token here so server code (current-user.ts, route
// handlers) can read + verify it with `supabase.auth.getUser(token)`.
//
// Keep this name OUT of the `sb-*` namespace so it never collides with the
// SDK's own storage keys.

export const AUTH_COOKIE = 'reforge-access-token'

// Max age for the mirrored token cookie (1 hour — matches Supabase's default
// access-token lifetime). The browser SDK auto-refreshes the real session; a
// stale cookie just falls back to demo mode until the next page that re-mirrors.
export const AUTH_COOKIE_MAX_AGE = 60 * 60
