// Server-side Supabase client.
//
// Uses the service_role key — BYPASSES RLS. Only import this from `route.ts`
// or Server Components. Never expose to the browser or to any code annotated
// "use client".
//
// In MVP demo mode we don't have user auth; the service_role + a fixed demo
// user UUID is how we let the wizard talk to the DB without signing anyone in.

import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_KEY

if (!url) {
  throw new Error('NEXT_PUBLIC_SUPABASE_URL is not set in apps/web/.env.local')
}
if (!serviceKey) {
  throw new Error('SUPABASE_SERVICE_KEY is not set in apps/web/.env.local')
}

export const supabaseAdmin = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
})
