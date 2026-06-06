import Link from 'next/link'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { buttonVariants } from '@/components/ui/button'
import { DEMO_USER_ID } from '@/lib/demo-user'
import { getLiveLoopState } from '@/lib/live-loop'
import { supabaseAdmin } from '@/lib/supabase-server'
import { getLocale } from '@/lib/locale-server'
import { translate, type Locale } from '@/lib/i18n'

const STATUS_KEY: Record<string, string> = {
  draft: 'status.draft',
  generating: 'status.generating',
  ready: 'status.ready',
  failed: 'status.failed',
}

const STATUS_STYLE: Record<string, string> = {
  draft: 'bg-zinc-100 text-zinc-700',
  generating: 'bg-amber-100 text-amber-800',
  ready: 'bg-emerald-100 text-emerald-800',
  failed: 'bg-red-100 text-red-700',
}

const LOCALE_TAG: Record<Locale, string> = { en: 'en-US', zh: 'zh-CN', th: 'th-TH' }

export const dynamic = 'force-dynamic'

export default async function DashboardPage() {
  const locale = await getLocale()
  const t = (k: string) => translate(locale, k)

  const { data: projects, error } = await supabaseAdmin
    .from('projects')
    .select('id, name, status, language, voice, created_at')
    .eq('user_id', DEMO_USER_ID)
    .order('created_at', { ascending: false })

  const list = projects ?? []
  const stats = {
    total: list.length,
    ready: list.filter((p) => p.status === 'ready').length,
    generating: list.filter((p) => p.status === 'generating').length,
    draft: list.filter((p) => p.status === 'draft').length,
  }

  // Live Console summary — read the shared server-side loop state directly.
  const live = getLiveLoopState()

  return (
    <main className="mx-auto max-w-5xl px-6 py-12">
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-mono uppercase tracking-widest text-muted-foreground">
            {t('app.name')}
          </p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">{t('dash.title')}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t('dash.subtitle')}</p>
        </div>
        <Link href="/projects/new" className={buttonVariants({ size: 'lg' })}>
          {t('dash.new')}
        </Link>
      </header>

      {/* stats bar */}
      <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: t('dash.title'), value: stats.total, tone: 'text-foreground' },
          { label: t('status.ready'), value: stats.ready, tone: 'text-emerald-600' },
          { label: t('status.generating'), value: stats.generating, tone: 'text-amber-600' },
          { label: t('status.draft'), value: stats.draft, tone: 'text-zinc-500' },
        ].map((s, i) => (
          <div key={i} className="rounded-lg border bg-card p-4">
            <div className={`text-2xl font-semibold ${s.tone}`}>{s.value}</div>
            <div className="mt-0.5 text-xs text-muted-foreground">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Live สด — server-side 24/7 loop summary */}
      <Link href="/live" className="mb-8 block">
        <div className="flex flex-wrap items-center gap-4 rounded-xl border bg-card p-4 transition-colors hover:bg-muted/40">
          <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${live.running ? 'bg-emerald-100 text-emerald-800' : 'bg-zinc-100 text-zinc-600'}`}>
            {live.running ? '🔴 กำลังไลฟ์' : '⚫ ไลฟ์หยุดอยู่'}
          </span>
          <div className="text-sm">
            <span className="font-semibold">Live สด</span>
            <span className="ml-2 text-muted-foreground">
              {live.running
                ? `ตอบ FB ${live.replied_count} · พูดตอบ ${live.spoken_count} · บัฟเฟอร์ ${Math.round(live.buffered_seconds)} วิ`
                : 'เปิด Live Console เพื่อเริ่มไลฟ์ AI 24/7'}
            </span>
          </div>
          {live.last_error && <span className="text-xs text-destructive">⚠ {live.last_error}</span>}
          <span className="ml-auto text-xs font-mono uppercase tracking-widest text-muted-foreground">เปิด Console →</span>
        </div>
      </Link>

      {error ? (
        <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          {t('dash.loadFailed')}{error.message}
        </div>
      ) : !projects || projects.length === 0 ? (
        <EmptyState locale={locale} />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {projects.map((p) => (
            <Link key={p.id} href={`/projects/${p.id}`} className="block">
              <Card className="h-full transition-colors hover:bg-muted/40">
                <CardHeader>
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="text-base">{p.name}</CardTitle>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
                        STATUS_STYLE[p.status] ?? 'bg-zinc-100 text-zinc-700'
                      }`}
                    >
                      {STATUS_KEY[p.status] ? t(STATUS_KEY[p.status]) : p.status}
                    </span>
                  </div>
                  <CardDescription className="text-xs">
                    {p.language} · {p.voice}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-xs text-muted-foreground">
                    {new Date(p.created_at).toLocaleString(LOCALE_TAG[locale])}
                  </p>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </main>
  )
}

function EmptyState({ locale }: { locale: Locale }) {
  const t = (k: string) => translate(locale, k)
  return (
    <div className="flex flex-col items-center rounded-xl border border-dashed border-border bg-card/40 px-6 py-16 text-center shadow-sm">
      <div className="flex size-14 items-center justify-center rounded-full bg-primary/10 text-primary ring-1 ring-primary/20">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="26"
          height="26"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="m16 13 5.223 3.482a.5.5 0 0 0 .777-.416V7.87a.5.5 0 0 0-.752-.432L16 10.5" />
          <rect x="2" y="6" width="14" height="12" rx="2" />
        </svg>
      </div>
      <h2 className="mt-5 text-xl font-semibold tracking-tight">{t('dash.empty.title')}</h2>
      <p className="mt-2 max-w-sm text-sm text-muted-foreground">{t('dash.empty.subtitle')}</p>
      <Link
        href="/projects/new"
        className={`${buttonVariants({ size: 'lg' })} mt-7`}
      >
        {t('dash.new')}
      </Link>
    </div>
  )
}
