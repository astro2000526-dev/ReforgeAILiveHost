'use client'

// OAuth callback — completes the PKCE flow.
//
// WHY CLIENT-SIDE (not a route.ts): the PKCE code verifier is generated and
// stored by the BROWSER client (localStorage) when signInWithOAuth runs. A
// server route handler has no access to that verifier, so it cannot call
// exchangeCodeForSession. We don't ship @supabase/ssr (no new deps), so the
// documented clean path with @supabase/supabase-js alone is to exchange in the
// browser, then mirror the access token into a cookie the server can read.
//
// Flow: Google → /auth/callback?code=... → exchangeCodeForSession(href) →
// write reforge-access-token cookie → router.push('/dashboard').

import { useRouter } from 'next/navigation'
import { useEffect, useRef } from 'react'

import { AUTH_COOKIE, AUTH_COOKIE_MAX_AGE } from '@/lib/auth-cookie'
import { getSupabaseBrowser } from '@/lib/supabase-browser'

function setAuthCookie(token: string) {
  const secure = location.protocol === 'https:' ? '; Secure' : ''
  // SameSite=Lax so the cookie rides top-level navigations (this redirect) and
  // same-site fetches from route handlers. HttpOnly is not settable from JS;
  // the token is short-lived and re-verified server-side on every use.
  document.cookie = `${AUTH_COOKIE}=${token}; Path=/; Max-Age=${AUTH_COOKIE_MAX_AGE}; SameSite=Lax${secure}`
}

export default function AuthCallbackPage() {
  const router = useRouter()
  const ran = useRef(false)

  useEffect(() => {
    if (ran.current) return // guard React strict-mode double-invoke
    ran.current = true

    ;(async () => {
      try {
        const supabase = getSupabaseBrowser()
        const { data, error } = await supabase.auth.exchangeCodeForSession(window.location.href)
        if (error || !data.session) {
          const msg = error?.message ?? 'no session returned'
          router.replace(`/login?error=${encodeURIComponent(msg)}`)
          return
        }
        setAuthCookie(data.session.access_token)
        router.replace('/dashboard')
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        router.replace(`/login?error=${encodeURIComponent(msg)}`)
      }
    })()
  }, [router])

  return (
    <main className="flex flex-1 items-center justify-center px-6 py-16">
      <p className="text-sm text-muted-foreground">กำลังเข้าสู่ระบบ…</p>
    </main>
  )
}
