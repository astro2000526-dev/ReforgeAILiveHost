'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { useI18n } from '@/components/LocaleProvider'

type VMeta = {
  duration_seconds?: number; mode?: string; voice_clone?: boolean
  playback_speed?: number; voice?: string; script_text?: string
} | null
type Version = { id: string; output_video_url: string | null; created_at: string; meta: VMeta }

export function VersionList({ projectId, versions }: { projectId: string; versions: Version[] }) {
  const { t } = useI18n()
  const router = useRouter()
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const toggle = (id: string) =>
    setSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  const allSelected = versions.length > 0 && sel.size === versions.length
  const toggleAll = () => setSel(allSelected ? new Set() : new Set(versions.map((v) => v.id)))

  async function remove(ids: string[]) {
    if (ids.length === 0) return
    if (!confirm(t('ver.confirm').replace('{n}', String(ids.length)))) return
    setBusy(true); setErr(null)
    try {
      const r = await fetch(`/api/projects/${projectId}/generations`, {
        method: 'DELETE', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids }),
      })
      if (!r.ok) { const d = await r.json().catch(() => ({})); throw new Error(d.error || `HTTP ${r.status}`) }
      setSel(new Set())
      router.refresh()
    } catch (e) {
      setErr(String(e instanceof Error ? e.message : e))
    } finally { setBusy(false) }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
          <input type="checkbox" className="h-3.5 w-3.5" checked={allSelected} onChange={toggleAll} />
          {t('ver.selectAll')}
        </label>
        {sel.size > 0 && (
          <Button size="sm" variant="destructive" disabled={busy}
            onClick={() => remove([...sel])}>
            🗑 {t('ver.deleteSelected')} ({sel.size})
          </Button>
        )}
      </div>
      {err && <p className="text-xs text-destructive">{err}</p>}

      {versions.map((v, i) => {
        const m = v.meta ?? {}
        const tags = [
          m.duration_seconds != null ? `${m.duration_seconds}s` : null,
          m.mode === 'ai' ? 'AI lip-sync' : m.mode === 'loop' ? 'loop' : null,
          m.voice_clone ? '🎙️clone' : null,
          m.playback_speed && m.playback_speed !== 1 ? `${m.playback_speed}x` : null,
          m.voice || null,
        ].filter(Boolean)
        return (
          <div key={v.id} className={`rounded-md border px-3 py-2 text-xs transition-colors ${sel.has(v.id) ? 'border-primary bg-primary/5' : 'bg-muted/30'}`}>
            <div className="flex items-center gap-2">
              <input type="checkbox" className="h-3.5 w-3.5 shrink-0" checked={sel.has(v.id)} onChange={() => toggle(v.id)} />
              <span className="font-medium">{i === 0 ? `★ ${t('ver.latest')}` : `v${versions.length - i}`}</span>
              <span className="text-muted-foreground">{new Date(v.created_at).toLocaleString()}</span>
              <span className="ml-auto flex items-center gap-2 shrink-0">
                {v.output_video_url && <a href={`${v.output_video_url}?t=${v.id.slice(0, 8)}`} target="_blank" rel="noreferrer" className="text-primary hover:underline">{t('ver.open')} ▶</a>}
                <button onClick={() => remove([v.id])} disabled={busy} className="text-destructive hover:opacity-70" title={t('ver.deleteOne')}>🗑</button>
              </span>
            </div>
            {tags.length > 0 && (
              <div className="mt-1 flex flex-wrap gap-1 pl-6">
                {tags.map((tg, k) => <span key={k} className="rounded bg-background px-1.5 py-0.5 text-[10px] text-muted-foreground border">{tg}</span>)}
              </div>
            )}
            {m.script_text && <p className="mt-1 line-clamp-2 pl-6 text-[10px] text-muted-foreground">{m.script_text}</p>}
          </div>
        )
      })}
    </div>
  )
}
