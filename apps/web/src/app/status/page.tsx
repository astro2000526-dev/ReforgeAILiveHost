'use client'

// System status — pipeline resources (CPU/RAM/disk/GPU) + every task the
// system knows about (render jobs, generation jobs, ffmpeg streams, DB rows).
// Polls /api/system/status every 5s.

import { useCallback, useEffect, useState } from 'react'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useI18n } from '@/components/LocaleProvider'

type GpuInfo = {
  name: string
  util_percent: number
  mem_used_mb: number
  mem_total_mb: number
  temp_c: number
}

type PipelineStatus = {
  resources: {
    cpu: { percent: number | null; cores: number | null; load_1m: number | null }
    memory: { total_bytes: number; used_bytes: number; percent: number } | null
    disk: { total_bytes: number; used_bytes: number; percent: number }
    gpus: GpuInfo[]
  }
  tasks: {
    render_jobs: Record<string, { status?: string; pct?: number; source?: string }>
    generation_jobs: Record<string, { status?: string; stage?: string; progress?: number; message?: string }>
    streams: { stream_id: string; status: string; pid: number; duration_sec: number }[]
  }
}

type GenerationRow = {
  id: string
  project_id: string
  project_name: string | null
  status: string
  progress: number
  error_message: string | null
  created_at: string
  finished_at: string | null
}

type StreamRow = {
  id: string
  project_id: string
  project_name: string | null
  status: string
  started_at: string | null
  duration_seconds: number
  created_at: string
}

type StatusPayload = {
  pipeline: PipelineStatus | null
  pipelineError: string | null
  projects: { total: number; byStatus: Record<string, number> }
  generations: GenerationRow[]
  streams: StreamRow[]
  fetchedAt: string
}

const WARN_BADGE = 'bg-amber-500/15 text-amber-700 dark:text-amber-400'
const NEUTRAL_BADGE = 'bg-muted text-muted-foreground'
const SUCCESS_BADGE = 'bg-success/15 text-success'

const STATUS_STYLE: Record<string, string> = {
  // task / generation states
  queued: NEUTRAL_BADGE,
  rendering: WARN_BADGE,
  tts: WARN_BADGE,
  lipsync: WARN_BADGE,
  concat: WARN_BADGE,
  generating: WARN_BADGE,
  done: SUCCESS_BADGE,
  ready: SUCCESS_BADGE,
  live: 'bg-live/15 text-live',
  failed: 'bg-destructive/15 text-destructive',
  error: 'bg-destructive/15 text-destructive',
  cancelled: NEUTRAL_BADGE,
  stopped: NEUTRAL_BADGE,
  idle: NEUTRAL_BADGE,
  draft: NEUTRAL_BADGE,
}

function StatusBadge({ value }: { value: string }) {
  return (
    <span
      className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
        STATUS_STYLE[value] ?? NEUTRAL_BADGE
      }`}
    >
      {value}
    </span>
  )
}

function fmtBytes(n: number): string {
  if (n >= 1024 ** 4) return `${(n / 1024 ** 4).toFixed(1)} TB`
  if (n >= 1024 ** 3) return `${(n / 1024 ** 3).toFixed(1)} GB`
  return `${(n / 1024 ** 2).toFixed(0)} MB`
}

function fmtDuration(sec: number): string {
  const s = Math.floor(sec)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  return h > 0 ? `${h}h ${m}m` : `${m}m ${s % 60}s`
}

function barTone(pct: number): string {
  if (pct >= 90) return 'bg-destructive'
  if (pct >= 70) return 'bg-amber-500'
  return 'bg-success'
}

function ResourceCard({
  label,
  pct,
  detail,
}: {
  label: string
  pct: number | null
  detail: string
}) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="flex items-baseline justify-between">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        <span className="text-lg font-semibold">{pct === null ? '—' : `${pct}%`}</span>
      </div>
      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={`h-full rounded-full transition-all ${pct === null ? 'bg-muted' : barTone(pct)}`}
          style={{ width: `${Math.min(100, pct ?? 0)}%` }}
        />
      </div>
      <div className="mt-1.5 text-xs text-muted-foreground">{detail}</div>
    </div>
  )
}

export default function StatusPage() {
  const { t } = useI18n()
  const [data, setData] = useState<StatusPayload | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/system/status', { cache: 'no-store' })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      setData((await r.json()) as StatusPayload)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'fetch failed')
    }
  }, [])

  useEffect(() => {
    void load() // instant first paint, then live pushes via SSE
    const es = new EventSource('/api/system/status/stream')
    es.onmessage = (e) => {
      try { setData(JSON.parse(e.data) as StatusPayload); setError(null) } catch { /* skip bad frame */ }
    }
    // EventSource reconnects automatically; just surface the gap
    es.onerror = () => setError('stream disconnected — reconnecting…')
    return () => es.close()
  }, [load])

  const pipe = data?.pipeline ?? null
  const res = pipe?.resources ?? null
  const renderJobs = Object.entries(pipe?.tasks.render_jobs ?? {})
  const genJobs = Object.entries(pipe?.tasks.generation_jobs ?? {})
  const liveStreams = pipe?.tasks.streams ?? []
  const online = !!pipe

  return (
    <main className="mx-auto max-w-5xl px-6 py-12">
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-mono uppercase tracking-widest text-muted-foreground">
            {t('app.name')}
          </p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">{t('sys.title')}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t('sys.subtitle')}</p>
        </div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          {data && (
            <span>
              {t('sys.updated')} {new Date(data.fetchedAt).toLocaleTimeString()}
            </span>
          )}
          <span
            className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-medium ${
              online
                ? 'border-success/30 bg-success/10 text-success'
                : 'border-destructive/30 bg-destructive/10 text-destructive'
            }`}
          >
            <span className={`size-1.5 rounded-full ${online ? 'bg-success' : 'bg-destructive'}`} />
            {online ? t('sys.online') : t('sys.offline')}
          </span>
        </div>
      </header>

      {error && (
        <div className="mb-6 rounded-md border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          {error}
        </div>
      )}
      {!error && !data && <p className="text-sm text-muted-foreground">{t('common.loading')}</p>}

      {data && !online && data.pipelineError && (
        <div className="mb-6 rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-900/30 dark:text-amber-300">
          {t('sys.pipelineDown')} {data.pipelineError}
        </div>
      )}

      {/* resources */}
      {res && (
        <section className="mb-8">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            {t('sys.resources')}
          </h2>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <ResourceCard
              label="CPU"
              pct={res.cpu.percent}
              detail={`${res.cpu.cores ?? '?'} ${t('sys.cores')}${
                res.cpu.load_1m !== null ? ` · load ${res.cpu.load_1m}` : ''
              }`}
            />
            <ResourceCard
              label="RAM"
              pct={res.memory?.percent ?? null}
              detail={
                res.memory
                  ? `${fmtBytes(res.memory.used_bytes)} / ${fmtBytes(res.memory.total_bytes)}`
                  : t('sys.notAvailable')
              }
            />
            <ResourceCard
              label="Disk"
              pct={res.disk.percent}
              detail={`${fmtBytes(res.disk.used_bytes)} / ${fmtBytes(res.disk.total_bytes)}`}
            />
            {res.gpus.length === 0 ? (
              <ResourceCard label="GPU" pct={null} detail={t('sys.noGpu')} />
            ) : (
              res.gpus.map((g, i) => (
                <ResourceCard
                  key={i}
                  label={`GPU ${res.gpus.length > 1 ? i : ''} · ${g.name}`}
                  pct={g.util_percent}
                  detail={`VRAM ${(g.mem_used_mb / 1024).toFixed(1)} / ${(g.mem_total_mb / 1024).toFixed(1)} GB · ${g.temp_c}°C`}
                />
              ))
            )}
          </div>
        </section>
      )}

      {/* live tasks on the pipeline */}
      <section className="mb-8">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          {t('sys.tasks')}
        </h2>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">
                {t('sys.renderJobs')} ({renderJobs.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              {renderJobs.length === 0 ? (
                <p className="text-xs text-muted-foreground">{t('sys.none')}</p>
              ) : (
                <ul className="space-y-3">
                  {renderJobs.map(([id, j]) => (
                    <li key={id} className="text-xs">
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate font-mono">{id.slice(0, 8)}</span>
                        <span className="flex items-center gap-2">
                          {j.source && <span className="text-muted-foreground">{j.source}</span>}
                          <StatusBadge value={j.status ?? 'unknown'} />
                        </span>
                      </div>
                      <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-primary transition-all"
                          style={{ width: `${j.pct ?? 0}%` }}
                        />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">
                {t('sys.streams')} ({liveStreams.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              {liveStreams.length === 0 ? (
                <p className="text-xs text-muted-foreground">{t('sys.none')}</p>
              ) : (
                <ul className="space-y-2">
                  {liveStreams.map((s) => (
                    <li key={s.stream_id} className="flex items-center justify-between text-xs">
                      <span className="truncate font-mono">{s.stream_id.slice(0, 8)}</span>
                      <span className="flex items-center gap-2">
                        <span className="text-muted-foreground">{fmtDuration(s.duration_sec)}</span>
                        <StatusBadge value={s.status} />
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          {genJobs.length > 0 && (
            <Card className="lg:col-span-2">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">
                  {t('sys.genJobs')} ({genJobs.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {genJobs.map(([id, j]) => (
                    <li key={id} className="flex items-center justify-between text-xs">
                      <span className="truncate font-mono">{id.slice(0, 8)}</span>
                      <span className="flex items-center gap-2">
                        {j.stage && <span className="text-muted-foreground">{j.stage}</span>}
                        {typeof j.progress === 'number' && (
                          <span className="text-muted-foreground">{j.progress}%</span>
                        )}
                        <StatusBadge value={j.status ?? j.stage ?? 'unknown'} />
                      </span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
        </div>
      </section>

      {/* DB task history */}
      {data && (
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            {t('sys.history')}
          </h2>

          {/* projects by status */}
          <div className="mb-4 flex flex-wrap gap-2 text-xs">
            <span className="rounded-full border px-2.5 py-1 text-muted-foreground">
              {t('sys.projects')}: {data.projects.total}
            </span>
            {Object.entries(data.projects.byStatus).map(([s, n]) => (
              <span key={s} className="flex items-center gap-1.5 rounded-full border px-2.5 py-1">
                <StatusBadge value={s} /> {n}
              </span>
            ))}
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">{t('sys.recentGenerations')}</CardTitle>
              </CardHeader>
              <CardContent>
                {data.generations.length === 0 ? (
                  <p className="text-xs text-muted-foreground">{t('sys.none')}</p>
                ) : (
                  <ul className="space-y-2">
                    {data.generations.map((g) => (
                      <li key={g.id} className="text-xs">
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate">{g.project_name ?? g.project_id.slice(0, 8)}</span>
                          <span className="flex shrink-0 items-center gap-2">
                            <span className="text-muted-foreground">
                              {new Date(g.created_at).toLocaleString()}
                            </span>
                            <StatusBadge value={g.status} />
                          </span>
                        </div>
                        {g.error_message && (
                          <p className="mt-0.5 truncate text-destructive">
                            {g.error_message}
                          </p>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">{t('sys.recentStreams')}</CardTitle>
              </CardHeader>
              <CardContent>
                {data.streams.length === 0 ? (
                  <p className="text-xs text-muted-foreground">{t('sys.none')}</p>
                ) : (
                  <ul className="space-y-2">
                    {data.streams.map((s) => (
                      <li key={s.id} className="flex items-center justify-between gap-2 text-xs">
                        <span className="truncate">{s.project_name ?? s.project_id.slice(0, 8)}</span>
                        <span className="flex shrink-0 items-center gap-2">
                          {s.duration_seconds > 0 && (
                            <span className="text-muted-foreground">
                              {fmtDuration(s.duration_seconds)}
                            </span>
                          )}
                          <span className="text-muted-foreground">
                            {new Date(s.created_at).toLocaleString()}
                          </span>
                          <StatusBadge value={s.status} />
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>
        </section>
      )}
    </main>
  )
}
