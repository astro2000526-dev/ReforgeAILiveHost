'use client'

import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { Avatar, ReplyPreset } from '@/lib/types'
import type { StreamDestination } from '@/lib/system-config'

// ── Live Console ──────────────────────────────────────────────────────────────
// One screen that drives the whole live: (A) a server-side Qwen loop keeps the
// avatar talking 24/7, (B) Facebook comments stream in real-time and get an AI
// reply, (C) the presenter can SPEAK that reply aloud in the live.
//
// All orchestration lives server-side (lib/live-loop.ts). This page only sends
// start/stop + subscribes to two SSE feeds (loop state + FB comments) and runs
// the per-comment reply pipeline.
//
// Strings are hard-coded Thai by design (the shared i18n table is owned by
// another track and must not change here).

type LoopState = {
  running: boolean
  phase: string
  session_id: string | null
  pipeline_state: string | null
  buffered_seconds: number
  queue_len: number
  fed_chunks: number
  replied_count: number
  spoken_count: number
  last_error: string | null
}

type Comment = {
  id: string
  from: string
  message: string
  created_time: string
  reply?: string
  replyPending?: boolean
  posted?: boolean
  postPending?: boolean
  postError?: string
  spoken?: boolean
}

type LogEntry = {
  ts: string
  from: string
  comment: string
  reply: string
  posted: boolean
  spoken: boolean
}

const PHASE_TH: Record<string, string> = {
  idle: 'ว่าง',
  starting: 'กำลังเริ่ม',
  scripting: 'กำลังคิดบท',
  feeding: 'กำลังป้อนบท',
  error: 'ผิดพลาด',
}

const PIPELINE_TH: Record<string, string> = {
  starting: 'กำลังเริ่ม',
  live: 'ออกอากาศ',
  stopping: 'กำลังหยุด',
  stopped: 'หยุดแล้ว',
  failed: 'ล้มเหลว',
}

export default function LiveConsolePage() {
  // ── loop settings ──
  const [avatars, setAvatars] = useState<Avatar[]>([])
  const [avatarId, setAvatarId] = useState('')
  const [product, setProduct] = useState('')
  const [topic, setTopic] = useState('')
  const [rtmpUrl, setRtmpUrl] = useState('')
  const [streamKey, setStreamKey] = useState('')
  const [destinations, setDestinations] = useState<StreamDestination[]>([])
  const [destId, setDestId] = useState('')
  const [autoSpeak, setAutoSpeak] = useState(true)
  const [language] = useState('th')
  const [busy, setBusy] = useState(false)
  const [startError, setStartError] = useState<string | null>(null)

  // ── loop state (from SSE) ──
  const [loop, setLoop] = useState<LoopState | null>(null)

  // ── reply preset (instruction + data + QA for /api/ai-reply) ──
  const [presets, setPresets] = useState<ReplyPreset[]>([])
  const [presetId, setPresetId] = useState('')

  // ── comments + replies ──
  const [autoReply, setAutoReply] = useState(true)
  const [autoPost, setAutoPost] = useState(false)
  const [comments, setComments] = useState<Comment[]>([])
  const [commentStatus, setCommentStatus] = useState('idle')
  const [commentError, setCommentError] = useState<string | null>(null)
  const [log, setLog] = useState<LogEntry[]>([])

  // refs so SSE/closures see fresh values
  const seenRef = useRef<Set<string>>(new Set())
  const autoReplyRef = useRef(autoReply)
  const autoPostRef = useRef(autoPost)
  const autoSpeakRef = useRef(autoSpeak)
  const productRef = useRef(product)
  const presetIdRef = useRef(presetId)
  useEffect(() => { autoReplyRef.current = autoReply }, [autoReply])
  useEffect(() => { autoPostRef.current = autoPost }, [autoPost])
  useEffect(() => { autoSpeakRef.current = autoSpeak }, [autoSpeak])
  useEffect(() => { productRef.current = product }, [product])
  useEffect(() => { presetIdRef.current = presetId }, [presetId])

  const running = !!loop?.running

  // ── load avatars ──
  useEffect(() => {
    void (async () => {
      try {
        const r = await fetch('/api/avatars')
        const d = (await r.json()) as { avatars?: Avatar[] }
        const list = d.avatars ?? []
        setAvatars(list)
        if (list[0]?.id) setAvatarId((cur) => cur || list[0].id)
      } catch { /* ignore */ }
    })()
  }, [])

  // ── load saved stream destinations (from Settings) ──
  useEffect(() => {
    void (async () => {
      try {
        const r = await fetch('/api/config')
        const d = (await r.json()) as { config?: { stream_destinations?: StreamDestination[] } }
        setDestinations(d.config?.stream_destinations ?? [])
      } catch { /* ignore */ }
    })()
  }, [])

  // pick a saved destination → fill RTMP URL + stream key (still editable below)
  function pickDestination(id: string) {
    setDestId(id)
    const dest = destinations.find((x) => x.id === id)
    if (dest) { setRtmpUrl(dest.rtmp_url); setStreamKey(dest.stream_key) }
  }

  // ── load reply presets ──
  useEffect(() => {
    void (async () => {
      try {
        const r = await fetch('/api/reply-presets')
        const d = (await r.json()) as { presets?: ReplyPreset[] }
        setPresets(d.presets ?? [])
      } catch { /* ignore */ }
    })()
  }, [])

  // ── SSE: loop state ──
  useEffect(() => {
    const es = new EventSource('/api/live/loop/stream')
    es.onmessage = (e) => {
      try { setLoop(JSON.parse(e.data) as LoopState) } catch { /* ignore */ }
    }
    return () => es.close()
  }, [])

  // ── speak helper ──
  const speak = useCallback(async (text: string): Promise<boolean> => {
    try {
      const r = await fetch('/api/live/speak', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      })
      return r.ok
    } catch { return false }
  }, [])

  // ── post reply to FB ──
  const postReply = useCallback(async (id: string, message: string): Promise<boolean> => {
    setComments((xs) => xs.map((x) => (x.id === id ? { ...x, postPending: true, postError: undefined } : x)))
    try {
      const r = await fetch('/api/live/reply', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ commentId: id, message }),
      })
      const d = (await r.json()) as { ok?: boolean; error?: string }
      if (!r.ok || !d.ok) throw new Error(d.error ?? `HTTP ${r.status}`)
      setComments((xs) => xs.map((x) => (x.id === id ? { ...x, posted: true, postPending: false } : x)))
      return true
    } catch (e) {
      setComments((xs) => xs.map((x) => (x.id === id ? { ...x, postPending: false, postError: e instanceof Error ? e.message : String(e) } : x)))
      return false
    }
  }, [])

  // ── per-comment reply pipeline: AI reply → (auto post) → (auto speak) → log ──
  const handleComment = useCallback(async (c: Comment) => {
    setComments((xs) => xs.map((x) => (x.id === c.id ? { ...x, replyPending: true } : x)))
    let reply = ''
    try {
      const r = await fetch('/api/ai-reply', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ comment: c.message, product: productRef.current, language, preset_id: presetIdRef.current || undefined }),
      })
      const d = (await r.json()) as { reply?: string; error?: string }
      reply = d.reply ?? d.error ?? '—'
    } catch (e) {
      reply = e instanceof Error ? e.message : String(e)
    }
    setComments((xs) => xs.map((x) => (x.id === c.id ? { ...x, reply, replyPending: false } : x)))

    let posted = false
    let spoken = false
    if (reply && reply !== '—') {
      if (autoPostRef.current) posted = await postReply(c.id, reply)
      if (autoSpeakRef.current) {
        spoken = await speak(reply)
        if (spoken) setComments((xs) => xs.map((x) => (x.id === c.id ? { ...x, spoken: true } : x)))
      }
    }
    setLog((ls) => [{
      ts: new Date().toLocaleTimeString('th-TH'),
      from: c.from, comment: c.message, reply, posted, spoken,
    }, ...ls].slice(0, 100))
  }, [language, postReply, speak])

  // ── SSE: FB comments (only while loop running) ──
  useEffect(() => {
    if (!running) { setCommentStatus('idle'); return }
    setCommentStatus('กำลังเชื่อมต่อ…')
    const es = new EventSource('/api/live/comments/stream')
    es.onopen = () => { setCommentError(null); setCommentStatus(`สด · เห็นแล้ว ${seenRef.current.size}`) }
    es.onmessage = (e) => {
      let d: { comments?: Comment[]; error?: string }
      try { d = JSON.parse(e.data) } catch { return }
      if (d.error) { setCommentError(d.error); setCommentStatus('error'); return }
      setCommentError(null)
      const fresh = (d.comments ?? []).filter((c) => !seenRef.current.has(c.id))
      if (fresh.length) {
        fresh.forEach((c) => seenRef.current.add(c.id))
        setComments((xs) => [...fresh, ...xs].slice(0, 200))
        if (autoReplyRef.current) fresh.forEach((c) => void handleComment(c))
      }
      setCommentStatus(`สด · เห็นแล้ว ${seenRef.current.size}`)
    }
    es.onerror = () => setCommentStatus('กำลังเชื่อมต่อใหม่…')
    return () => es.close()
  }, [running, handleComment])

  // ── start / stop ──
  async function start() {
    setBusy(true); setStartError(null)
    try {
      const r = await fetch('/api/live/loop', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'start',
          avatar_id: avatarId,
          product, topic, language,
          rtmp_url: rtmpUrl,
          stream_key: streamKey,
          auto_speak_replies: autoSpeak,
        }),
      })
      const d = (await r.json()) as { state?: LoopState; error?: string }
      if (!r.ok) throw new Error(d.error ?? `HTTP ${r.status}`)
      if (d.state) setLoop(d.state)
    } catch (e) {
      setStartError(e instanceof Error ? e.message : String(e))
    } finally { setBusy(false) }
  }

  async function stop() {
    setBusy(true)
    try {
      const r = await fetch('/api/live/loop', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'stop' }),
      })
      const d = (await r.json()) as { state?: LoopState }
      if (d.state) setLoop(d.state)
    } catch { /* ignore */ } finally { setBusy(false) }
  }

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <Link href="/dashboard" className="text-xs font-mono uppercase tracking-widest text-muted-foreground hover:text-foreground">← กลับ</Link>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">Live Console</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        ไลฟ์ AI 24/7 — Qwen คิดบทต่อเนื่อง จับคอมเมนต์ FB แบบเรียลไทม์ แล้วให้พรีเซนเตอร์พูดตอบในไลฟ์
      </p>

      {/* ── top: loop control + status ────────────────────────────────────── */}
      <div className="mt-6 grid gap-5 lg:grid-cols-[1fr_320px]">
        {/* settings */}
        <div className="lux-card space-y-4 rounded-2xl border bg-card p-5">
          <h2 className="text-sm font-semibold">ตั้งค่าไลฟ์</h2>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">พรีเซนเตอร์ (Avatar)</label>
              <select
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm disabled:opacity-50"
                value={avatarId}
                disabled={running}
                onChange={(e) => setAvatarId(e.target.value)}
              >
                {avatars.length === 0 && <option value="">— ยังไม่มี avatar —</option>}
                {avatars.map((a) => (
                  <option key={a.id} value={a.id}>{a.name ?? a.id}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">สินค้า</label>
              <Input placeholder="เช่น ครีมบำรุงผิว" value={product} disabled={running} onChange={(e) => setProduct(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">ประเด็น / มุมที่อยากเน้น</label>
              <Input placeholder="เช่น โปรลดราคาวันนี้" value={topic} disabled={running} onChange={(e) => setTopic(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <label className="flex items-center justify-between text-xs font-medium text-muted-foreground">
                <span>Preset ตอบคอมเมนต์</span>
                <Link href="/live/presets" className="text-primary hover:underline">จัดการ</Link>
              </label>
              {/* not disabled while running — switching presets mid-live is intended */}
              <select
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
                value={presetId}
                onChange={(e) => setPresetId(e.target.value)}
              >
                <option value="">— ค่าเริ่มต้น (ไม่ใช้ preset) —</option>
                {presets.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <label className="flex items-center justify-between text-xs font-medium text-muted-foreground">
                <span>ปลายทาง (Destination)</span>
                <Link href="/settings" className="text-primary hover:underline">จัดการ</Link>
              </label>
              <select
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm disabled:opacity-50"
                value={destId}
                disabled={running}
                onChange={(e) => pickDestination(e.target.value)}
              >
                <option value="">— กรอกเอง / ใช้ค่าจาก Settings —</option>
                {destinations.map((d) => (
                  <option key={d.id} value={d.id}>{d.label || d.platform}{d.stream_key ? '' : ' (ยังไม่มี key)'}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">RTMP URL <span className="opacity-60">(ว่าง = ใช้ค่าจาก Settings)</span></label>
              <Input placeholder="rtmps://live-api-s.facebook.com:443/rtmp/" value={rtmpUrl} disabled={running} onChange={(e) => { setRtmpUrl(e.target.value); setDestId('') }} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <label className="text-xs font-medium text-muted-foreground">Stream Key</label>
              <Input placeholder="FB-xxxxxxxxxxxx" value={streamKey} disabled={running} onChange={(e) => { setStreamKey(e.target.value); setDestId('') }} />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-4 pt-1">
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <input type="checkbox" className="h-4 w-4" checked={autoSpeak} onChange={(e) => setAutoSpeak(e.target.checked)} />
              พูดตอบคอมเมนต์ในไลฟ์
            </label>
            <div className="ml-auto">
              {running
                ? <Button variant="destructive" disabled={busy} onClick={() => void stop()}>{busy ? '…' : 'หยุดไลฟ์'}</Button>
                : <Button disabled={busy || !avatarId || !streamKey.trim()} onClick={() => void start()}>{busy ? '…' : 'เริ่มไลฟ์'}</Button>}
            </div>
          </div>
          {startError && <p className="text-xs text-destructive">{startError}</p>}
        </div>

        {/* status card */}
        <div className="lux-card space-y-3 rounded-2xl border bg-card p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">สถานะไลฟ์</h2>
            <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ${running ? 'bg-live/15 text-live' : 'bg-muted text-muted-foreground'}`}>
              {running && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-live" />}
              {running ? 'กำลังไลฟ์' : 'หยุด'}
            </span>
          </div>
          <dl className="space-y-2 text-sm">
            <Row label="เฟส" value={loop ? (PHASE_TH[loop.phase] ?? loop.phase) : '—'} />
            <Row label="pipeline" value={loop?.pipeline_state ? (PIPELINE_TH[loop.pipeline_state] ?? loop.pipeline_state) : '—'} />
            <Row label="บัฟเฟอร์" value={loop ? `${Math.round(loop.buffered_seconds)} วิ` : '—'} />
            <Row label="คิวบท" value={loop ? String(loop.queue_len) : '—'} />
            <Row label="บทที่ป้อนแล้ว" value={loop ? String(loop.fed_chunks) : '—'} />
            <Row label="ตอบ FB / พูดตอบ" value={loop ? `${loop.replied_count} / ${loop.spoken_count}` : '—'} />
          </dl>
          {loop?.last_error && <p className="text-xs text-destructive">⚠ {loop.last_error}</p>}
        </div>
      </div>

      {/* ── bottom: comments + reply log ──────────────────────────────────── */}
      <div className="mt-6 grid gap-5 lg:grid-cols-2">
        {/* live comments */}
        <div className="lux-card rounded-2xl border bg-card p-5">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-sm font-semibold">คอมเมนต์สด</h2>
            <span className="font-mono text-xs text-muted-foreground">{commentStatus}</span>
            {commentError && <span className="text-xs text-destructive">· {commentError}</span>}
            <div className="ml-auto flex items-center gap-3">
              <label className="flex cursor-pointer items-center gap-1.5 text-xs">
                <input type="checkbox" className="h-3.5 w-3.5" checked={autoReply} onChange={(e) => setAutoReply(e.target.checked)} />
                ตอบอัตโนมัติ
              </label>
              <label className="flex cursor-pointer items-center gap-1.5 text-xs">
                <input type="checkbox" className="h-3.5 w-3.5" checked={autoPost} onChange={(e) => setAutoPost(e.target.checked)} />
                <span className={autoPost ? 'font-medium text-amber-600' : ''}>โพสต์กลับ FB ⚠️</span>
              </label>
            </div>
          </div>

          <div className="mt-4 max-h-[28rem] space-y-3 overflow-y-auto pr-1">
            {comments.length === 0 && (
              <p className="text-sm text-muted-foreground">
                {running ? 'รอคอมเมนต์… (ตั้ง fb_page_token + fb_live_video_id ใน Settings)' : 'เริ่มไลฟ์ก่อนเพื่อดึงคอมเมนต์'}
              </p>
            )}
            {comments.map((c) => (
              <div key={c.id} className="rounded-xl border bg-background p-3">
                <p className="text-sm">
                  <span className="text-muted-foreground">💬 </span>
                  {c.from && <span className="font-medium">{c.from}: </span>}
                  {c.message}
                </p>
                <div className="mt-2 rounded-lg bg-muted/50 p-2 text-sm">
                  <span className="font-medium text-primary">🤖 </span>
                  {c.replyPending
                    ? <span className="text-muted-foreground">กำลังคิด…</span>
                    : (c.reply ?? <button onClick={() => void handleComment(c)} className="text-primary hover:underline">ร่างคำตอบ</button>)}
                </div>
                {c.reply && !c.replyPending && (
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    {c.posted
                      ? <span className="text-xs text-success">✓ โพสต์แล้ว</span>
                      : <Button size="sm" disabled={c.postPending} onClick={() => void postReply(c.id, c.reply!)}>
                          {c.postPending ? 'กำลังโพสต์…' : 'ส่งกลับ FB'}
                        </Button>}
                    {c.spoken
                      ? <span className="text-xs text-sky-600 dark:text-sky-400">🔊 พูดแล้ว</span>
                      : <Button size="sm" variant="outline" disabled={!running} onClick={() => { void speak(c.reply!); setComments((xs) => xs.map((x) => x.id === c.id ? { ...x, spoken: true } : x)) }}>
                          พูดในไลฟ์
                        </Button>}
                    {c.postError && <span className="text-xs text-destructive">{c.postError}</span>}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* reply log */}
        <div className="lux-card rounded-2xl border bg-card p-5">
          <h2 className="text-sm font-semibold">บันทึกการตอบ</h2>
          <div className="mt-4 max-h-[28rem] space-y-2 overflow-y-auto pr-1">
            {log.length === 0 && <p className="text-sm text-muted-foreground">ยังไม่มีการตอบ</p>}
            {log.map((l, i) => (
              <div key={i} className="rounded-lg border bg-background p-2.5 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-muted-foreground">{l.ts}</span>
                  <span className="flex gap-2">
                    {l.posted && <span className="text-success">FB✓</span>}
                    {l.spoken && <span className="text-sky-600 dark:text-sky-400">🔊</span>}
                  </span>
                </div>
                <p className="mt-1"><span className="text-muted-foreground">💬 {l.from ? `${l.from}: ` : ''}</span>{l.comment}</p>
                <p className="mt-0.5 text-primary">🤖 {l.reply}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <p className="mt-6 text-xs text-muted-foreground">
        ตัวทดสอบเดิม (mock) ย้ายไปที่{' '}
        <Link href="/live/fb-test" className="text-primary hover:underline">/live/fb-test</Link>
      </p>
    </main>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  )
}
