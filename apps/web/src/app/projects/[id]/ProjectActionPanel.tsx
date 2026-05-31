'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useI18n } from '@/components/LocaleProvider'

type StreamState = {
  stream_id?: string
  status: 'idle' | 'live' | 'stopped' | 'error'
  message?: string | null
}

const FB_RTMP = 'rtmps://live-api-s.facebook.com:443/rtmp/'

export function ProjectActionPanel({
  projectId,
  initialStatus,
}: {
  projectId: string
  initialStatus: string
}) {
  const router = useRouter()
  const { t } = useI18n()

  const [projectStatus, setProjectStatus] = useState(initialStatus)

  // --- render clip ---
  const [duration, setDuration] = useState(30)
  const [defaultRtmpLoaded, setDefaultRtmpLoaded] = useState(false)
  const [rendering, setRendering] = useState(false)
  const [renderPct, setRenderPct] = useState(0)
  const [renderErrors, setRenderErrors] = useState<string[]>([])
  const [renderSource, setRenderSource] = useState<string | null>(null)
  const [renderDone, setRenderDone] = useState(false)
  const [renderFailed, setRenderFailed] = useState<string | null>(null)

  // --- stream ---
  const [rtmpUrl, setRtmpUrl] = useState(FB_RTMP)
  const [streamKey, setStreamKey] = useState('')
  const [stream, setStream] = useState<StreamState>({ status: 'idle' })
  const [streamBusy, setStreamBusy] = useState(false)
  const [streamError, setStreamError] = useState<string | null>(null)

  // Load defaults (clip length, RTMP URL) from system settings.
  useEffect(() => {
    const ctrl = new AbortController()
    fetch('/api/config', { signal: ctrl.signal })
      .then((r) => r.json())
      .then((d) => {
        const c = d.config ?? {}
        if (typeof c.default_duration === 'number') setDuration(c.default_duration)
        if (c.default_rtmp_url && !defaultRtmpLoaded) {
          setRtmpUrl(c.default_rtmp_url)
          setDefaultRtmpLoaded(true)
        }
      })
      .catch(() => {})
    return () => ctrl.abort()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Resume progress on page load if a render is already in flight (survives refresh).
  useEffect(() => {
    let alive = true
    fetch(`/api/projects/${projectId}/render-status`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((js) => {
        if (alive && js && js.status === 'rendering') {
          setRendering(true)
          setRenderPct(js.pct ?? 0)
          pollRender()
        }
      })
      .catch(() => {})
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function pollRender() {
    for (let i = 0; i < 200; i++) {
      await new Promise((res) => setTimeout(res, 2500))
      const s = await fetch(`/api/projects/${projectId}/render-status`, { cache: 'no-store' })
      if (!s.ok) continue
      const js = (await s.json()) as { status: string; pct: number; source?: string; output_url?: string; errors?: string[] }
      setRenderPct(js.pct ?? 0)
      if (js.status === 'done') {
        setRenderErrors(js.errors ?? []); setRenderSource(js.source ?? null)
        setRenderDone(true); setProjectStatus('ready'); setRendering(false); router.refresh(); return
      }
      if (js.status === 'failed') { setRenderFailed((js.errors ?? []).join('; ') || 'render failed'); setRendering(false); return }
      if (js.status === 'cancelled') { setRendering(false); setRenderPct(0); return }
    }
    setRenderFailed('render timed out'); setRendering(false)
  }

  async function renderClip() {
    setRendering(true); setRenderFailed(null); setRenderErrors([]); setRenderDone(false); setRenderPct(0)
    try {
      const r = await fetch(`/api/projects/${projectId}/render`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ duration_seconds: duration }),
      })
      const data = (await r.json()) as { ok?: boolean; error?: string }
      if (!r.ok) throw new Error(data.error ?? `HTTP ${r.status}`)
      await pollRender()
    } catch (err) {
      setRenderFailed(err instanceof Error ? err.message : String(err)); setRendering(false)
    }
  }

  async function cancelRender() {
    try { await fetch(`/api/projects/${projectId}/render-cancel`, { method: 'POST' }) } catch {}
    setRendering(false); setRenderPct(0)
  }

  async function startStream() {
    setStreamBusy(true)
    setStreamError(null)
    try {
      const r = await fetch('/api/streams/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: projectId,
          rtmp_url: rtmpUrl.trim(),
          stream_key: streamKey.trim(),
        }),
      })
      const data = (await r.json()) as StreamState & { error?: string }
      if (!r.ok) throw new Error(data.error ?? `HTTP ${r.status}`)
      setStream({ status: 'live', stream_id: data.stream_id })
    } catch (err) {
      setStreamError(err instanceof Error ? err.message : String(err))
    } finally {
      setStreamBusy(false)
    }
  }

  async function stopStream() {
    if (!stream.stream_id) return
    setStreamBusy(true)
    setStreamError(null)
    try {
      const r = await fetch(`/api/streams/${stream.stream_id}/stop`, { method: 'POST' })
      const data = (await r.json()) as { error?: string }
      if (!r.ok) throw new Error(data.error ?? `HTTP ${r.status}`)
      setStream({ status: 'stopped' })
    } catch (err) {
      setStreamError(err instanceof Error ? err.message : String(err))
    } finally {
      setStreamBusy(false)
    }
  }

  const canStream = projectStatus === 'ready'

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('panel.render.title')}</CardTitle>
          <CardDescription>{t('panel.render.desc')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="duration">{t('panel.render.duration')} <span className="text-xs font-normal text-muted-foreground">(0 วินาที – 30 นาที / {Math.floor(duration/60)}:{String(duration%60).padStart(2,'0')})</span></Label>
            <Input
              id="duration"
              type="number"
              inputMode="numeric"
              min={0}
              max={1800}
              step={1}
              value={duration}
              // allow free typing; only cap the ceiling at 30 min (1800s). empty → 0.
              onChange={(e) => setDuration(Math.min(Math.max(Number(e.target.value) || 0, 0), 1800))}
              disabled={rendering}
            />
          </div>

          {renderFailed && (
            <div className="rounded-md border border-red-200 bg-red-50 p-2 text-xs text-red-800 break-all">
              {renderFailed}
            </div>
          )}

          {renderErrors.length > 0 && (
            <div className="rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">
              <p className="font-medium">{t('panel.render.warnings')}</p>
              <ul className="mt-1 list-disc pl-4">
                {renderErrors.map((e, i) => (
                  <li key={i} className="break-all">{e}</li>
                ))}
              </ul>
              {/* only say "test pattern" when that's actually what was produced */}
              {renderSource === 'testpattern' && <p className="mt-1">{t('panel.render.fallback')}</p>}
            </div>
          )}
          {renderDone && renderSource && renderSource !== 'testpattern' && (
            <p className="text-xs text-muted-foreground">source: {renderSource}</p>
          )}

          {renderDone && renderErrors.length === 0 && (
            <p className="text-sm text-emerald-700">{t('panel.render.done')}</p>
          )}

          {rendering && (
            <div className="space-y-1">
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <div className="h-full bg-primary transition-all" style={{ width: `${renderPct}%` }} />
              </div>
              <p className="text-[11px] text-muted-foreground">{renderPct}%</p>
            </div>
          )}
          {rendering ? (
            <div className="flex gap-2">
              <Button className="flex-1" disabled>{`${t('panel.render.rendering')} ${renderPct}%`}</Button>
              <Button variant="destructive" onClick={cancelRender}>{t('panel.render.cancel')}</Button>
            </div>
          ) : (
            <Button className="w-full" onClick={renderClip}>{t('panel.render.button')}</Button>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('panel.stream.title')}</CardTitle>
          <CardDescription>{t('panel.stream.desc')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="rtmp-url">{t('panel.stream.rtmp')}</Label>
            <Input
              id="rtmp-url"
              placeholder="rtmp://push.example.com/live"
              value={rtmpUrl}
              onChange={(e) => setRtmpUrl(e.target.value)}
              disabled={!canStream || stream.status === 'live'}
            />
            <p className="text-[11px] text-muted-foreground">{t('panel.stream.fbHint')}</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="stream-key">{t('panel.stream.key')}</Label>
            <Input
              id="stream-key"
              type="password"
              placeholder={t('panel.stream.keyPh')}
              value={streamKey}
              onChange={(e) => setStreamKey(e.target.value)}
              disabled={!canStream || stream.status === 'live'}
            />
          </div>

          {stream.status === 'live' && (
            <div className="rounded-md border border-emerald-200 bg-emerald-50 p-2 text-xs text-emerald-800">
              {t('panel.stream.live')} {stream.stream_id}
            </div>
          )}
          {streamError && (
            <div className="rounded-md border border-red-200 bg-red-50 p-2 text-xs text-red-800">
              {streamError}
            </div>
          )}

          {stream.status === 'live' ? (
            <Button className="w-full" variant="destructive" disabled={streamBusy} onClick={stopStream}>
              {streamBusy ? t('panel.stream.stopping') : t('panel.stream.stop')}
            </Button>
          ) : (
            <Button
              className="w-full"
              disabled={!canStream || streamBusy || !rtmpUrl.trim() || !streamKey.trim()}
              onClick={startStream}
            >
              {streamBusy ? t('panel.stream.starting') : canStream ? t('panel.stream.start') : t('panel.stream.waitReady')}
            </Button>
          )}
        </CardContent>
      </Card>
    </>
  )
}
