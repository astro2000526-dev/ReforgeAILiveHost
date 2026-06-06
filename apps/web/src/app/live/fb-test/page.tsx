'use client'

import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useI18n } from '@/components/LocaleProvider'

type Item = {
  id: string // FB comment id
  from: string
  message: string
  created_time: string
  reply?: string
  replyPending?: boolean
  posted?: boolean
  postPending?: boolean
  postError?: string
}

// Dedicated TEST page: subscribe (SSE) to a Facebook live video's comments,
// draft an AI reply for each, and (manually, or via the opt-in auto-post
// toggle) publish it back to FB. The server polls FB Graph once per stream and
// pushes only NEW comments. Page token lives server-side in Settings.
export default function FbLiveTestPage() {
  const { locale, t } = useI18n()
  const [running, setRunning] = useState(false)
  const [videoId, setVideoId] = useState('') // optional override; blank = use Settings
  const [product, setProduct] = useState('')
  const [autoReply, setAutoReply] = useState(true)
  const [autoPost, setAutoPost] = useState(false)
  const [items, setItems] = useState<Item[]>([])
  const [status, setStatus] = useState<string>('idle')
  const [error, setError] = useState<string | null>(null)

  // refs so the polling interval closure always sees fresh values
  const seenRef = useRef<Set<string>>(new Set())
  const afterRef = useRef<string | undefined>(undefined)
  const autoReplyRef = useRef(autoReply)
  const autoPostRef = useRef(autoPost)
  const productRef = useRef(product)
  const videoIdRef = useRef(videoId)
  useEffect(() => { autoReplyRef.current = autoReply }, [autoReply])
  useEffect(() => { autoPostRef.current = autoPost }, [autoPost])
  useEffect(() => { productRef.current = product }, [product])
  useEffect(() => { videoIdRef.current = videoId }, [videoId])

  const genReply = useCallback(async (it: Item) => {
    setItems((xs) => xs.map((x) => (x.id === it.id ? { ...x, replyPending: true } : x)))
    try {
      const r = await fetch('/api/ai-reply', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ comment: it.message, product: productRef.current, language: locale }),
      })
      const d = (await r.json()) as { reply?: string; error?: string }
      const reply = d.reply ?? d.error ?? '—'
      setItems((xs) => xs.map((x) => (x.id === it.id ? { ...x, reply, replyPending: false } : x)))
      if (autoPostRef.current && d.reply) void postReply(it.id, d.reply)
    } catch (e) {
      setItems((xs) => xs.map((x) => (x.id === it.id ? { ...x, reply: String(e), replyPending: false } : x)))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locale])

  async function postReply(commentId: string, message: string) {
    setItems((xs) => xs.map((x) => (x.id === commentId ? { ...x, postPending: true, postError: undefined } : x)))
    try {
      const r = await fetch('/api/live/reply', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ commentId, message }),
      })
      const d = (await r.json()) as { ok?: boolean; error?: string }
      if (!r.ok || !d.ok) throw new Error(d.error ?? `HTTP ${r.status}`)
      setItems((xs) => xs.map((x) => (x.id === commentId ? { ...x, posted: true, postPending: false } : x)))
    } catch (e) {
      setItems((xs) => xs.map((x) => (x.id === commentId ? { ...x, postPending: false, postError: e instanceof Error ? e.message : String(e) } : x)))
    }
  }

  // SSE: one long-lived connection — the server pushes only fresh comments.
  useEffect(() => {
    if (!running) return
    setStatus('connecting…')
    const params = new URLSearchParams()
    if (videoIdRef.current.trim()) params.set('video_id', videoIdRef.current.trim())
    const es = new EventSource(`/api/live/comments/stream?${params.toString()}`)
    es.onopen = () => { setError(null); setStatus(`live · ${seenRef.current.size} seen`) }
    es.onmessage = (e) => {
      let d: { comments?: Item[]; error?: string }
      try { d = JSON.parse(e.data) } catch { return }
      if (d.error) { setError(d.error); setStatus('error'); return }
      setError(null)
      const fresh = (d.comments ?? []).filter((c) => !seenRef.current.has(c.id))
      if (fresh.length) {
        fresh.forEach((c) => seenRef.current.add(c.id))
        afterRef.current = fresh[fresh.length - 1].created_time
        setItems((xs) => [...fresh, ...xs])
        if (autoReplyRef.current) fresh.forEach((c) => void genReply(c))
      }
      setStatus(`live · ${seenRef.current.size} seen`)
    }
    // transient drops are fine — EventSource reconnects on its own
    es.onerror = () => setStatus('reconnecting…')
    return () => es.close()
  }, [running, genReply])

  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <Link href="/dashboard" className="text-xs font-mono uppercase tracking-widest text-muted-foreground hover:text-foreground">← back</Link>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">FB Live · comment test</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {t('fb.sub')} (<Link href="/settings" className="text-primary hover:underline">Settings</Link>)
      </p>

      <div className="lux-card mt-6 space-y-4 rounded-2xl border bg-card p-5">
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">Live Video ID <span className="opacity-60">{t('fb.videoIdHint')}</span></label>
          <Input placeholder="e.g. 1234567890123456" value={videoId} onChange={(e) => setVideoId(e.target.value)} disabled={running} />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">{t('fb.product')}</label>
          <Input placeholder={t('fb.productPh')} value={product} onChange={(e) => setProduct(e.target.value)} />
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" className="h-4 w-4" checked={autoReply} onChange={(e) => setAutoReply(e.target.checked)} />
            auto-draft reply
          </label>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" className="h-4 w-4" checked={autoPost} onChange={(e) => setAutoPost(e.target.checked)} />
            <span className={autoPost ? 'text-amber-600 font-medium' : ''}>auto-post to FB ⚠️</span>
          </label>
          <div className="ml-auto">
            {running
              ? <Button variant="destructive" onClick={() => setRunning(false)}>Stop</Button>
              : <Button onClick={() => setRunning(true)}>Start polling</Button>}
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          {t('fb.status')} <span className="font-mono">{status}</span>
          {error && <span className="text-destructive"> · {error}</span>}
        </p>
      </div>

      <div className="mt-6 space-y-3">
        {items.length === 0 && <p className="text-sm text-muted-foreground">{t('fb.empty')}</p>}
        {items.map((it) => (
          <div key={it.id} className="lux-card rounded-xl border bg-card p-4">
            <p className="text-sm">
              <span className="text-muted-foreground">💬 </span>
              {it.from && <span className="font-medium">{it.from}: </span>}
              {it.message}
            </p>
            <div className="mt-2 rounded-lg bg-muted/50 p-2 text-sm">
              <span className="text-primary font-medium">🤖 </span>
              {it.replyPending
                ? <span className="text-muted-foreground">{t('live.thinking')}</span>
                : (it.reply ?? <button onClick={() => void genReply(it)} className="text-primary hover:underline">draft reply</button>)}
            </div>
            {it.reply && !it.replyPending && (
              <div className="mt-2 flex items-center gap-2">
                {it.posted
                  ? <span className="text-xs text-success">✓ posted to FB</span>
                  : <Button size="sm" disabled={it.postPending} onClick={() => void postReply(it.id, it.reply!)}>
                      {it.postPending ? 'posting…' : 'Send to FB'}
                    </Button>}
                {it.postError && <span className="text-xs text-destructive">{it.postError}</span>}
              </div>
            )}
          </div>
        ))}
      </div>
    </main>
  )
}
