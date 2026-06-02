'use client'

import Link from 'next/link'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useI18n } from '@/components/LocaleProvider'

type Item = { id: number; comment: string; reply?: string; pending?: boolean }

// Scaffold: AI comment → auto-reply. Real platform comment pulling (FB/TikTok)
// plugs into `addComment` later; for now comments are added manually / mock.
export default function LivePage() {
  const { t } = useI18n()
  const [product, setProduct] = useState('')
  const [draft, setDraft] = useState('')
  const [items, setItems] = useState<Item[]>([])
  const [auto, setAuto] = useState(true)
  let nid = items.length

  async function reply(it: Item) {
    setItems((xs) => xs.map((x) => (x.id === it.id ? { ...x, pending: true } : x)))
    try {
      const r = await fetch('/api/ai-reply', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ comment: it.comment, product }),
      })
      const d = (await r.json()) as { reply?: string; error?: string }
      setItems((xs) => xs.map((x) => (x.id === it.id ? { ...x, reply: d.reply ?? d.error ?? '—', pending: false } : x)))
    } catch (e) {
      setItems((xs) => xs.map((x) => (x.id === it.id ? { ...x, reply: String(e), pending: false } : x)))
    }
  }

  function addComment() {
    const c = draft.trim(); if (!c) return
    const it: Item = { id: ++nid + Date.now(), comment: c }
    setItems((xs) => [it, ...xs])
    setDraft('')
    if (auto) reply(it)
  }

  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <Link href="/dashboard" className="text-xs font-mono uppercase tracking-widest text-muted-foreground hover:text-foreground">{t('common.back')}</Link>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">{t('live.title')}</h1>
      <p className="mt-1 text-sm text-muted-foreground">{t('live.sub')}</p>
      <Link href="/live/fb-test" className="mt-2 inline-block text-xs text-primary hover:underline">
        → ทดสอบอ่านคอมเมนต์ Facebook Live (auto-reply)
      </Link>

      <div className="lux-card mt-6 space-y-4 rounded-2xl border bg-card p-5">
        <Input placeholder={t('live.product')} value={product} onChange={(e) => setProduct(e.target.value)} />
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input type="checkbox" className="h-4 w-4" checked={auto} onChange={(e) => setAuto(e.target.checked)} />
          {t('live.auto')}
        </label>
        <div className="flex gap-2">
          <Input placeholder={t('live.commentPh')} value={draft}
            onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addComment()} />
          <Button onClick={addComment}>{t('live.add')}</Button>
        </div>
      </div>

      <div className="mt-6 space-y-3">
        {items.length === 0 && <p className="text-sm text-muted-foreground">{t('live.empty')}</p>}
        {items.map((it) => (
          <div key={it.id} className="lux-card rounded-xl border bg-card p-4">
            <p className="text-sm"><span className="text-muted-foreground">💬 </span>{it.comment}</p>
            <div className="mt-2 rounded-lg bg-muted/50 p-2 text-sm">
              <span className="text-primary font-medium">🤖 </span>
              {it.pending ? <span className="text-muted-foreground">{t('live.thinking')}</span> : (it.reply ?? '')}
              {!it.pending && !it.reply && (
                <button onClick={() => reply(it)} className="text-primary hover:underline ml-1">{t('live.reply')}</button>
              )}
            </div>
          </div>
        ))}
      </div>
    </main>
  )
}
