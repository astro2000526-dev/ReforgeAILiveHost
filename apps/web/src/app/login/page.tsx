'use client'

// Login page — Google OAuth via Supabase Auth (cloud).
//
// Strings are hardcoded Thai per mission (do NOT touch i18n.ts). The page is
// only meaningful when NEXT_PUBLIC_AUTH_ENABLED=1; with the flag off it shows a
// "demo mode" notice instead, so a stray /login visit isn't a dead end.

import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { Suspense, useState } from 'react'

import { Button } from '@/components/ui/button'
import { getSupabaseBrowser } from '@/lib/supabase-browser'

const AUTH_ENABLED = process.env.NEXT_PUBLIC_AUTH_ENABLED === '1'

function LoginCard() {
  const params = useSearchParams()
  const urlError = params.get('error')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(urlError)

  async function signInWithGoogle() {
    setBusy(true)
    setError(null)
    try {
      const supabase = getSupabaseBrowser()
      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: `${location.origin}/auth/callback` },
      })
      // On success the browser is redirected to Google; we only reach here on error.
      if (oauthError) {
        setError(oauthError.message)
        setBusy(false)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setBusy(false)
    }
  }

  return (
    <div className="lux-card w-full max-w-sm space-y-6 rounded-2xl border bg-card p-8">
      <div className="space-y-1 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">เข้าสู่ระบบ</h1>
        <p className="text-sm text-muted-foreground">เข้าใช้งาน Reforge AI Live ด้วยบัญชี Google ของคุณ</p>
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          เข้าสู่ระบบไม่สำเร็จ: {error}
        </div>
      )}

      {AUTH_ENABLED ? (
        <Button onClick={signInWithGoogle} disabled={busy} className="w-full">
          {busy ? 'กำลังเปลี่ยนเส้นทาง…' : 'เข้าสู่ระบบด้วย Google'}
        </Button>
      ) : (
        <div className="rounded-lg border bg-muted/40 px-3 py-3 text-center text-sm text-muted-foreground">
          ขณะนี้ระบบทำงานในโหมดเดโม — ยังไม่ต้องเข้าสู่ระบบ
          <br />
          (เปิดใช้ภายหลังด้วย <code className="font-mono text-xs">NEXT_PUBLIC_AUTH_ENABLED=1</code>)
        </div>
      )}

      <p className="text-center text-xs text-muted-foreground">
        <Link href="/dashboard" className="hover:text-foreground hover:underline">
          ไปที่คอนโซล
        </Link>
      </p>
    </div>
  )
}

export default function LoginPage() {
  return (
    <main className="flex flex-1 items-center justify-center px-6 py-16">
      {/* useSearchParams must be inside Suspense in the app router. */}
      <Suspense fallback={null}>
        <LoginCard />
      </Suspense>
    </main>
  )
}
