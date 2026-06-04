'use client'

// /gallery — auto news-clip factory.
// Press Start → loop forever: fetch news → Qwen writes a sales-pitch script →
// render clip on the GPU pipeline → show in grid → next article. Press Stop to
// end after the current clip. Keeps the GPU box busy instead of idling.

import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useI18n } from '@/components/LocaleProvider'

type Avatar = { id: string; name: string; preview_image_url: string | null; template_video_url: string | null }
type Clip = {
  project_id: string
  title: string
  news_link: string | null
  news_source: string | null
  created_at: string
  status: string
  progress: number
  video_url: string | null
}
type Phase = 'idle' | 'news' | 'script' | 'render' | 'cooldown'

const POLL_MS = 3000
const MAX_POLLS = 400          // ≈20 min per clip before declaring it stuck
const ERROR_BACKOFF_MS = 15000 // wait before retrying after a failed iteration

export default function GalleryPage() {
  const { t } = useI18n()
  const [avatars, setAvatars] = useState<Avatar[]>([])
  const [avatarId, setAvatarId] = useState('')
  const [language, setLanguage] = useState('th')
  const [product, setProduct] = useState('')
  const [topic, setTopic] = useState('')
  const [duration, setDuration] = useState(45)

  const [running, setRunning] = useState(false)
  const [phase, setPhase] = useState<Phase>('idle')
  const [currentTitle, setCurrentTitle] = useState('')
  const [renderPct, setRenderPct] = useState(0)
  const [clipCount, setClipCount] = useState(0)
  const [lastError, setLastError] = useState<string | null>(null)
  const [clips, setClips] = useState<Clip[]>([])
  const [loadingClips, setLoadingClips] = useState(true)

  // the loop reads this ref so Stop takes effect without re-creating the loop
  const runningRef = useRef(false)

  const loadClips = useCallback(async () => {
    try {
      const r = await fetch('/api/gallery/clips', { cache: 'no-store' })
      const d = (await r.json()) as { clips?: Clip[] }
      setClips(d.clips ?? [])
    } finally {
      setLoadingClips(false)
    }
  }, [])

  useEffect(() => {
    loadClips()
    fetch('/api/avatars', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d: { avatars?: Avatar[] }) => {
        const list = (d.avatars ?? []).filter((a) => a.template_video_url || a.preview_image_url)
        setAvatars(list)
        if (list[0]) setAvatarId((prev) => prev || list[0].id)
      })
      .catch(() => {})
  }, [loadClips])

  const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms))

  async function runOnce(): Promise<void> {
    // 1+2. news + script + project (single API call)
    setPhase('news')
    setCurrentTitle('')
    setRenderPct(0)
    const runRes = await fetch('/api/gallery/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        avatar_id: avatarId,
        language,
        product: product.trim() || undefined,
        topic: topic.trim() || undefined,
        duration_seconds: duration,
      }),
    })
    const run = (await runRes.json()) as { project_id?: string; news_title?: string; error?: string }
    if (!runRes.ok || !run.project_id) throw new Error(run.error ?? `HTTP ${runRes.status}`)
    setCurrentTitle(run.news_title ?? '')
    await loadClips()

    // 3. render via the existing project render route
    setPhase('render')
    const renderRes = await fetch(`/api/projects/${run.project_id}/render`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ duration_seconds: duration }),
    })
    const render = (await renderRes.json()) as { ok?: boolean; error?: string }
    if (!renderRes.ok || !render.ok) throw new Error(render.error ?? `render HTTP ${renderRes.status}`)

    // 4. poll until done/failed
    for (let i = 0; i < MAX_POLLS; i++) {
      await sleep(POLL_MS)
      if (!runningRef.current) return // user stopped — abandon polling, render finishes server-side
      try {
        const sr = await fetch(`/api/projects/${run.project_id}/render-status`, { cache: 'no-store' })
        const s = (await sr.json()) as { status?: string; pct?: number; errors?: string[] }
        setRenderPct(s.pct ?? 0)
        if (s.status === 'done') {
          setClipCount((c) => c + 1)
          await loadClips()
          return
        }
        if (s.status === 'failed') throw new Error((s.errors ?? []).join('; ') || 'render failed')
      } catch (err) {
        if (err instanceof Error && err.message !== 'Failed to fetch') throw err
        // transient network blip — keep polling
      }
    }
    throw new Error('render timed out')
  }

  async function loop() {
    while (runningRef.current) {
      try {
        setLastError(null)
        await runOnce()
      } catch (err) {
        setLastError(err instanceof Error ? err.message : String(err))
        setPhase('cooldown')
        await sleep(ERROR_BACKOFF_MS)
      }
    }
    setPhase('idle')
    setCurrentTitle('')
  }

  function start() {
    if (!avatarId) return
    runningRef.current = true
    setRunning(true)
    setClipCount(0)
    void loop()
  }

  function stop() {
    runningRef.current = false
    setRunning(false)
  }

  const phaseLabel: Record<Phase, string> = {
    idle: '',
    news: t('gallery.phase.news'),
    script: t('gallery.phase.script'),
    render: `${t('gallery.phase.render')} ${renderPct}%`,
    cooldown: t('gallery.phase.cooldown'),
  }

  return (
    <main className="mx-auto max-w-5xl px-6 py-12">
      <header className="mb-8">
        <Link href="/dashboard" className="text-xs font-mono uppercase tracking-widest text-muted-foreground hover:text-foreground">
          {t('common.back')}
        </Link>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">{t('gallery.title')}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t('gallery.subtitle')}</p>
      </header>

      {/* ── control panel ── */}
      <div className="mb-8 rounded-lg border p-5">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-2">
            <Label>{t('gallery.avatar')}</Label>
            <select
              value={avatarId}
              onChange={(e) => setAvatarId(e.target.value)}
              disabled={running}
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              {avatars.length === 0 && <option value="">{t('gallery.noAvatars')}</option>}
              {avatars.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
          <div className="space-y-2">
            <Label>{t('gallery.language')}</Label>
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              disabled={running}
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="th">ไทย</option>
              <option value="zh">中文</option>
              <option value="en">English</option>
            </select>
          </div>
          <div className="space-y-2">
            <Label>{t('gallery.topic')} <span className="text-muted-foreground text-xs">({t('av.optional')})</span></Label>
            <Input value={topic} onChange={(e) => setTopic(e.target.value)} disabled={running} placeholder={t('gallery.topicPh')} />
          </div>
          <div className="space-y-2">
            <Label>{t('gallery.duration')}</Label>
            <Input
              type="number" min={10} max={300}
              value={duration}
              onChange={(e) => setDuration(Math.max(10, Math.min(Number(e.target.value) || 45, 300)))}
              disabled={running}
            />
          </div>
        </div>

        <div className="mt-4 space-y-2">
          <Label>{t('gallery.product')} <span className="text-muted-foreground text-xs">({t('av.optional')})</span></Label>
          <Input value={product} onChange={(e) => setProduct(e.target.value)} disabled={running} placeholder={t('gallery.productPh')} />
        </div>

        <div className="mt-5 flex items-center gap-4">
          {running ? (
            <Button variant="destructive" onClick={stop}>⏹ {t('gallery.stop')}</Button>
          ) : (
            <Button onClick={start} disabled={!avatarId}>▶ {t('gallery.start')}</Button>
          )}
          {running && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
              <span>{phaseLabel[phase]}</span>
              {currentTitle && <span className="max-w-[28rem] truncate font-medium text-foreground">— {currentTitle}</span>}
            </div>
          )}
          {clipCount > 0 && (
            <span className="text-sm text-muted-foreground">{t('gallery.made')} {clipCount}</span>
          )}
        </div>
        {running && (
          <p className="mt-2 text-[11px] text-amber-600">{t('gallery.keepOpen')}</p>
        )}
        {lastError && (
          <div className="mt-3 rounded-md border border-red-200 bg-red-50 p-2 text-xs text-red-800 break-all">
            {lastError} — {t('gallery.retrying')}
          </div>
        )}
      </div>

      {/* ── clip grid ── */}
      <section>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-medium">{t('gallery.clips')}</h2>
          <Button size="sm" variant="outline" onClick={loadClips}>↻ {t('gallery.refresh')}</Button>
        </div>
        {loadingClips ? (
          <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
        ) : clips.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('gallery.empty')}</p>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
            {clips.map((c) => (
              <div key={c.project_id} className="rounded-lg border p-3 hover:bg-muted/30 transition-colors">
                {c.video_url ? (
                  <video src={c.video_url} controls preload="metadata" className="mb-2 aspect-video w-full rounded-md bg-black object-contain" />
                ) : (
                  <div className="mb-2 flex aspect-video w-full flex-col items-center justify-center gap-1 rounded-md bg-muted text-muted-foreground">
                    <span className="text-2xl">{c.status === 'failed' ? '⚠️' : '⏳'}</span>
                    <span className="text-xs">
                      {c.status === 'failed' ? t('gallery.clipFailed') : `${t('gallery.rendering')} ${c.progress}%`}
                    </span>
                  </div>
                )}
                <p className="text-sm font-medium line-clamp-2">{c.title}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {c.news_source ? `${c.news_source} · ` : ''}{new Date(c.created_at).toLocaleString()}
                </p>
                <div className="mt-2 flex gap-2">
                  <Link href={`/projects/${c.project_id}`} className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline">
                    {t('gallery.openProject')}
                  </Link>
                  {c.news_link && (
                    <a href={c.news_link} target="_blank" rel="noreferrer" className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline">
                      {t('gallery.sourceLink')}
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  )
}
