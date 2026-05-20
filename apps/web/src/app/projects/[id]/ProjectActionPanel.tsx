'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

type GenerationStatus = {
  status: 'queued' | 'tts' | 'lipsync' | 'concat' | 'transcode' | 'done' | 'failed' | 'unknown'
  stage?: string
  progress?: number
  output_path?: string | null
  output_url?: string | null
  message?: string | null
}

type StreamState = {
  stream_id?: string
  status: 'idle' | 'live' | 'stopped' | 'error'
  message?: string | null
}

const STAGE_LABEL: Record<string, string> = {
  queued: '排队中',
  download: '下载模板',
  tts: 'TTS 合成',
  concat_audio: '音频拼接',
  lipsync: 'MuseTalk 对口型',
  transcode: '转码',
  done: '完成',
  failed: '失败',
}

export function ProjectActionPanel({
  projectId,
  initialStatus,
}: {
  projectId: string
  initialStatus: string
}) {
  const router = useRouter()

  const [projectStatus, setProjectStatus] = useState(initialStatus)
  const [gen, setGen] = useState<GenerationStatus | null>(null)
  const [genError, setGenError] = useState<string | null>(null)
  const [starting, setStarting] = useState(false)

  const [rtmpUrl, setRtmpUrl] = useState('')
  const [streamKey, setStreamKey] = useState('')
  const [stream, setStream] = useState<StreamState>({ status: 'idle' })
  const [streamBusy, setStreamBusy] = useState(false)
  const [streamError, setStreamError] = useState<string | null>(null)

  // Poll generation status while generating.
  useEffect(() => {
    if (projectStatus !== 'generating') return
    let cancelled = false
    const tick = async () => {
      try {
        const r = await fetch(`/api/projects/${projectId}/generation-status`, { cache: 'no-store' })
        if (!r.ok) return
        const data = (await r.json()) as GenerationStatus
        if (cancelled) return
        setGen(data)
        if (data.status === 'done' || data.status === 'failed') {
          // Flip local state so the polling effect exits AND the UI swaps
          // out of the "generating" branch (which would otherwise hide the
          // error message and keep the spinner up).
          setProjectStatus(data.status === 'done' ? 'ready' : 'failed')
          router.refresh()
        }
      } catch {
        // swallow; we'll try again next tick
      }
    }
    tick()
    const id = setInterval(tick, 3000)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [projectId, projectStatus, router])

  async function startGeneration() {
    setStarting(true)
    setGenError(null)
    try {
      const r = await fetch(`/api/projects/${projectId}/generate`, { method: 'POST' })
      const data = (await r.json()) as { error?: string }
      if (!r.ok) throw new Error(data.error ?? `HTTP ${r.status}`)
      setProjectStatus('generating')
      setGen({ status: 'queued', progress: 0 })
    } catch (err) {
      setGenError(err instanceof Error ? err.message : String(err))
    } finally {
      setStarting(false)
    }
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

  const canGenerate = projectStatus === 'draft' || projectStatus === 'failed'
  const canStream = projectStatus === 'ready'

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">生成视频</CardTitle>
          <CardDescription>调用 RunPod GPU 上的 MuseTalk + TTS，约 5–10 分钟</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {projectStatus === 'generating' && (
            <div className="space-y-2">
              <div className="flex justify-between text-xs">
                <span>{STAGE_LABEL[gen?.stage ?? 'queued'] ?? gen?.stage ?? '处理中'}</span>
                <span>{gen?.progress ?? 0}%</span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full bg-primary transition-all"
                  style={{ width: `${gen?.progress ?? 0}%` }}
                />
              </div>
            </div>
          )}

          {projectStatus === 'failed' && gen?.message && (
            <div className="rounded-md border border-red-200 bg-red-50 p-2 text-xs text-red-800">
              {gen.message}
            </div>
          )}

          {genError && (
            <div className="rounded-md border border-red-200 bg-red-50 p-2 text-xs text-red-800">
              {genError}
            </div>
          )}

          {projectStatus === 'ready' && (
            <p className="text-sm text-emerald-700">视频已就绪，去下面开始推流。</p>
          )}

          <Button
            className="w-full"
            disabled={!canGenerate || starting}
            onClick={startGeneration}
          >
            {projectStatus === 'generating'
              ? '生成中...'
              : projectStatus === 'ready'
                ? '重新生成'
                : starting
                  ? '提交中...'
                  : '开始生成'}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">推流到直播平台</CardTitle>
          <CardDescription>抖音 / 视频号 / 小红书都支持标准 RTMP</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="rtmp-url">RTMP 推流地址</Label>
            <Input
              id="rtmp-url"
              placeholder="rtmp://push.example.com/live"
              value={rtmpUrl}
              onChange={(e) => setRtmpUrl(e.target.value)}
              disabled={!canStream || stream.status === 'live'}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="stream-key">推流密钥</Label>
            <Input
              id="stream-key"
              type="password"
              placeholder="平台分配的 stream key"
              value={streamKey}
              onChange={(e) => setStreamKey(e.target.value)}
              disabled={!canStream || stream.status === 'live'}
            />
          </div>

          {stream.status === 'live' && (
            <div className="rounded-md border border-emerald-200 bg-emerald-50 p-2 text-xs text-emerald-800">
              正在直播中 · stream_id: {stream.stream_id}
            </div>
          )}
          {streamError && (
            <div className="rounded-md border border-red-200 bg-red-50 p-2 text-xs text-red-800">
              {streamError}
            </div>
          )}

          {stream.status === 'live' ? (
            <Button
              className="w-full"
              variant="destructive"
              disabled={streamBusy}
              onClick={stopStream}
            >
              {streamBusy ? '停止中...' : '停止推流'}
            </Button>
          ) : (
            <Button
              className="w-full"
              disabled={!canStream || streamBusy || !rtmpUrl.trim() || !streamKey.trim()}
              onClick={startStream}
            >
              {streamBusy ? '启动中...' : canStream ? '开始推流' : '生成完成后可开播'}
            </Button>
          )}
        </CardContent>
      </Card>
    </>
  )
}
