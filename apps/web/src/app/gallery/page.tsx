'use client'

// /gallery — auto news-clip factory + full video library.
//
// TOP: control panel for the SERVER-SIDE news loop (lib/gallery-loop.ts). Press
// Start and close the tab — clips keep coming until someone presses Stop. This
// page subscribes to /api/gallery/loop/stream (SSE) so every open browser shows
// the same live on/off state, phase and progress.
//
// BOTTOM: a categorized, searchable library of EVERY rendered clip for the demo
// user (scope=all) — tabs by source/status, big modal player, download, open
// project. New UI strings are hardcoded Thai by design; existing t() keys kept.

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useI18n } from '@/components/LocaleProvider'
import type { LoopState } from '@/lib/gallery-loop'
import type { Avatar as AvatarRow } from '@/lib/types'

type Avatar = Pick<AvatarRow, 'id' | 'name' | 'preview_image_url' | 'template_video_url'>

// scope=all shape from /api/gallery/clips
type Clip = {
  project_id: string
  title: string
  project_name: string
  source: 'auto-news' | 'manual'
  news_link: string | null
  news_source: string | null
  created_at: string
  status: string
  progress: number
  video_url: string | null
}

type TabKey = 'all' | 'auto-news' | 'manual' | 'rendering'

const TABS: { key: TabKey; label: string }[] = [
  { key: 'all', label: 'ทั้งหมด' },
  { key: 'auto-news', label: 'จากข่าวอัตโนมัติ' },
  { key: 'manual', label: 'สร้างเอง' },
  { key: 'rendering', label: 'กำลังเรนเดอร์' },
]

const EMPTY_BY_TAB: Record<TabKey, string> = {
  all: 'ยังไม่มีวิดีโอ — กดเริ่มสร้างคลิปข่าว หรือสร้างโปรเจกต์ใหม่',
  'auto-news': 'ยังไม่มีคลิปจากข่าวอัตโนมัติ — กดเริ่มสร้างด้านบน',
  manual: 'ยังไม่มีวิดีโอที่สร้างเอง',
  rendering: 'ตอนนี้ไม่มีวิดีโอที่กำลังเรนเดอร์',
}

function isRendering(c: Clip): boolean {
  return c.status !== 'done' && c.status !== 'failed'
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

  // library controls
  const [tab, setTab] = useState<TabKey>('all')
  const [search, setSearch] = useState('')
  const [player, setPlayer] = useState<Clip | null>(null)

  const loadClips = useCallback(async () => {
    try {
      const r = await fetch('/api/gallery/clips?scope=all', { cache: 'no-store' })
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

  // close modal on Escape
  useEffect(() => {
    if (!player) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPlayer(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [player])

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

  // counts per tab (for badges)
  const counts = useMemo(() => {
    const c = { all: clips.length, 'auto-news': 0, manual: 0, rendering: 0 }
    for (const clip of clips) {
      if (clip.source === 'auto-news') c['auto-news'] += 1
      else c.manual += 1
      if (isRendering(clip)) c.rendering += 1
    }
    return c
  }, [clips])

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    return clips.filter((c) => {
      if (tab === 'auto-news' && c.source !== 'auto-news') return false
      if (tab === 'manual' && c.source !== 'manual') return false
      if (tab === 'rendering' && !isRendering(c)) return false
      if (q && !c.project_name.toLowerCase().includes(q)) return false
      return true
    })
  }, [clips, tab, search])

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
                ? 'border-success/30 bg-success/10 text-success'
                : 'border-border bg-muted text-muted-foreground'
            }`}>
              <span className={`h-1.5 w-1.5 rounded-full ${running ? 'animate-pulse bg-success' : 'bg-muted-foreground/50'}`} />
              {running ? t('gallery.statusOn') : t('gallery.statusOff')}
            </span>
          )}
        </div>
        <p className="mt-1 text-sm text-muted-foreground">{t('gallery.subtitle')}</p>
      </header>

      {/* ── control panel (news loop) ── */}
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
          <p className="mt-2 text-[11px] text-success">{t('gallery.keepOpen')}</p>
        )}
        {loop?.last_error && (
          <div className="mt-3 rounded-md border border-destructive/30 bg-destructive/10 p-2 text-xs text-destructive break-all">
            {loop.last_error} — {t('gallery.retrying')}
          </div>
        )}
      </div>

      {/* ── video library ── */}
      <section>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-medium">คลังวิดีโอ</h2>
          <Button size="sm" variant="outline" onClick={loadClips}>↻ {t('gallery.refresh')}</Button>
        </div>

        {/* tabs */}
        <div className="mb-4 flex flex-wrap gap-2">
          {TABS.map((tb) => {
            const active = tab === tb.key
            return (
              <button
                key={tb.key}
                onClick={() => setTab(tb.key)}
                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                  active
                    ? 'border-foreground bg-foreground text-background'
                    : 'border-border bg-background text-muted-foreground hover:text-foreground'
                }`}
              >
                {tb.label}
                <span className={`rounded-full px-1.5 text-[10px] ${active ? 'bg-background/20' : 'bg-muted'}`}>
                  {counts[tb.key]}
                </span>
              </button>
            )
          })}
        </div>

        {/* search */}
        <div className="mb-5">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="ค้นหาตามชื่อวิดีโอ…"
            className="max-w-sm"
          />
        </div>

        {loadingClips ? (
          <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
        ) : visible.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {search.trim() ? 'ไม่พบวิดีโอที่ตรงกับคำค้นหา' : EMPTY_BY_TAB[tab]}
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
            {visible.map((c) => (
              <ClipCard key={c.project_id} clip={c} onPlay={() => setPlayer(c)} />
            ))}
          </div>
        )}
      </section>

      {player && <PlayerModal clip={player} onClose={() => setPlayer(null)} />}
    </main>
  )
}

function SourceBadge({ source }: { source: Clip['source'] }) {
  const auto = source === 'auto-news'
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${
        auto
          ? 'bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300'
          : 'bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300'
      }`}
    >
      {auto ? 'ข่าวอัตโนมัติ' : 'สร้างเอง'}
    </span>
  )
}

function ClipCard({ clip, onPlay }: { clip: Clip; onPlay: () => void }) {
  const failed = clip.status === 'failed'

  return (
    <div className="flex flex-col rounded-lg border p-3 transition-colors hover:bg-muted/30">
      {clip.video_url ? (
        <button
          onClick={onPlay}
          className="group relative mb-2 block aspect-video w-full overflow-hidden rounded-md bg-black"
          aria-label="เล่นวิดีโอ"
        >
          <video src={clip.video_url} preload="metadata" muted playsInline className="h-full w-full object-contain" />
          <span className="absolute inset-0 flex items-center justify-center bg-black/20 opacity-0 transition-opacity group-hover:opacity-100">
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-white/90 text-lg text-black">▶</span>
          </span>
        </button>
      ) : (
        <div className="mb-2 flex aspect-video w-full flex-col items-center justify-center gap-1.5 rounded-md bg-muted px-3 text-muted-foreground">
          <span className="text-2xl">{failed ? '⚠️' : '⏳'}</span>
          {failed ? (
            <span className="text-xs">เรนเดอร์ล้มเหลว</span>
          ) : (
            <>
              <span className="text-xs">กำลังเรนเดอร์ {clip.progress}%</span>
              <div className="h-1.5 w-full max-w-[80%] overflow-hidden rounded-full bg-muted-foreground/20">
                <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${Math.max(4, clip.progress)}%` }} />
              </div>
            </>
          )}
        </div>
      )}

      <div className="flex items-start justify-between gap-2">
        <p className="line-clamp-2 text-sm font-medium">{clip.project_name}</p>
        <SourceBadge source={clip.source} />
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        {clip.news_source ? `${clip.news_source} · ` : ''}{new Date(clip.created_at).toLocaleString()}
      </p>

      <div className="mt-2 flex flex-wrap items-center gap-3 text-xs">
        {clip.video_url && (
          <>
            <button onClick={onPlay} className="font-medium text-foreground hover:underline">▶ เล่น</button>
            <a
              href={clip.video_url}
              download
              className="text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
            >
              ⬇ ดาวน์โหลด
            </a>
          </>
        )}
        <Link
          href={`/projects/${clip.project_id}`}
          className="text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
        >
          🔗 เปิดโปรเจกต์
        </Link>
        {clip.news_link && (
          <a
            href={clip.news_link}
            target="_blank"
            rel="noreferrer"
            className="text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
          >
            ข่าวต้นทาง
          </a>
        )}
      </div>
    </div>
  )
}

function PlayerModal({ clip, onClose }: { clip: Clip; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-0 sm:p-6"
      onClick={onClose}
    >
      <div
        className="relative flex h-full w-full flex-col bg-black sm:h-auto sm:max-h-[90vh] sm:max-w-3xl sm:rounded-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 px-4 py-3 text-white">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{clip.project_name}</p>
            <p className="truncate text-xs text-white/60">
              {clip.news_source ? `${clip.news_source} · ` : ''}{new Date(clip.created_at).toLocaleString()}
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="ปิด"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20"
          >
            ✕
          </button>
        </div>

        <div className="flex flex-1 items-center justify-center overflow-hidden bg-black">
          {clip.video_url && (
            <video
              src={clip.video_url}
              controls
              autoPlay
              playsInline
              className="max-h-full max-w-full"
            />
          )}
        </div>

        <div className="flex flex-wrap items-center gap-4 px-4 py-3 text-sm text-white/90">
          {clip.video_url && (
            <a href={clip.video_url} download className="hover:underline">⬇ ดาวน์โหลด</a>
          )}
          <Link href={`/projects/${clip.project_id}`} className="hover:underline">🔗 เปิดโปรเจกต์</Link>
          {clip.news_link && (
            <a href={clip.news_link} target="_blank" rel="noreferrer" className="hover:underline">ข่าวต้นทาง</a>
          )}
        </div>
      </div>
    </div>
  )
}
