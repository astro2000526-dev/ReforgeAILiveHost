'use client'

// /gallery — auto news-clip factory.
// The generation loop runs SERVER-SIDE (lib/gallery-loop.ts): press Start and
// close the tab — clips keep coming until someone presses Stop. This page is
// just a remote control + viewer: it subscribes to /api/gallery/loop/stream
// (SSE) so every open browser shows the same live on/off state, phase and
// progress, no matter who started or stopped the loop.

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
type LoopState = {
  running: boolean
  phase: 'idle' | 'news' | 'render' | 'cooldown'
  current_title: string | null
  render_pct: number
  clip_count: number
  last_error: string | null
  started_at: string | null
  settings: {
    avatar_id: string
    language: string
    product?: string
    topic?: string
    duration_seconds: number
  } | null
}

export default function GalleryPage() {
  const { t } = useI18n()
  const [avatars, setAvatars] = useState<Avatar[]>([])
  const [avatarId, setAvatarId] = useState('')
  const [language, setLanguage] = useState('th')
  const [product, setProduct] = useState('')
  const [topic, setTopic] = useState('')
  const [duration, setDuration] = useState(45)

  const [loop, setLoop] = useState<LoopState | null>(null)
  const [busy, setBusy] = useState(false) // start/stop request in flight
  const [clips, setClips] = useState<Clip[]>([])
  const [loadingClips, setLoadingClips] = useState(true)
  const clipCountRef = useRef(-1)
  const seededRef = useRef(false)

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

  // live shared state — SSE pushes every change (any user's start/stop included)
  useEffect(() => {
    const es = new EventSource('/api/gallery/loop/stream')
    es.onmessage = (ev) => {
      const state = JSON.parse(ev.data) as LoopState
      setLoop(state)
      // first event: seed the form with the settings the loop is running with
      if (!seededRef.current && state.settings) {
        seededRef.current = true
        setAvatarId(state.settings.avatar_id)
        setLanguage(state.settings.language)
        setProduct(state.settings.product ?? '')
        setTopic(state.settings.topic ?? '')
        setDuration(state.settings.duration_seconds)
      }
      // a clip finished (or a new run started) → refresh the grid
      if (state.clip_count !== clipCountRef.current) {
        clipCountRef.current = state.clip_count
        void loadClips()
      }
    }
    return () => es.close()
  }, [loadClips])

  async function send(body: Record<string, unknown>) {
    setBusy(true)
    try {
      const r = await fetch('/api/gallery/loop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const d = (await r.json()) as { state?: LoopState; error?: string }
      if (d.state) setLoop(d.state)
    } finally {
      setBusy(false)
    }
  }

  const running = loop?.running ?? false
  const phase = loop?.phase ?? 'idle'

  const phaseLabel: Record<LoopState['phase'], string> = {
    idle: '',
    news: t('gallery.phase.news'),
    render: `${t('gallery.phase.render')} ${loop?.render_pct ?? 0}%`,
    cooldown: t('gallery.phase.cooldown'),
  }

  return (
    <main className="mx-auto max-w-5xl px-6 py-12">
      <header className="mb-8">
        <Link href="/dashboard" className="text-xs font-mono uppercase tracking-widest text-muted-foreground hover:text-foreground">
          {t('common.back')}
        </Link>
        <div className="mt-2 flex items-center gap-3">
          <h1 className="text-3xl font-semibold tracking-tight">{t('gallery.title')}</h1>
          {loop && (
            <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${
              running
                ? 'border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-400'
                : 'border-border bg-muted text-muted-foreground'
            }`}>
              <span className={`h-1.5 w-1.5 rounded-full ${running ? 'animate-pulse bg-emerald-500' : 'bg-muted-foreground/50'}`} />
              {running ? t('gallery.statusOn') : t('gallery.statusOff')}
            </span>
          )}
        </div>
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
            <Button variant="destructive" disabled={busy} onClick={() => send({ action: 'stop' })}>
              ⏹ {t('gallery.stop')}
            </Button>
          ) : (
            <Button disabled={busy || !avatarId || loop === null}
              onClick={() => send({ action: 'start', avatar_id: avatarId, language, product, topic, duration_seconds: duration })}>
              ▶ {t('gallery.start')}
            </Button>
          )}
          {running && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span>{phaseLabel[phase]}</span>
              {loop?.current_title && (
                <span className="max-w-[28rem] truncate font-medium text-foreground">— {loop.current_title}</span>
              )}
            </div>
          )}
          {(loop?.clip_count ?? 0) > 0 && (
            <span className="text-sm text-muted-foreground">{t('gallery.made')} {loop?.clip_count}</span>
          )}
        </div>
        {running && (
          <p className="mt-2 text-[11px] text-emerald-600">{t('gallery.keepOpen')}</p>
        )}
        {loop?.last_error && (
          <div className="mt-3 rounded-md border border-red-200 bg-red-50 p-2 text-xs text-red-800 break-all">
            {loop.last_error} — {t('gallery.retrying')}
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
