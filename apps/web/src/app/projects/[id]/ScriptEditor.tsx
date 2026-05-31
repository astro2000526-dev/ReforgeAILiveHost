'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { useI18n } from '@/components/LocaleProvider'

type Segment = { type: string; text: string; duration_sec?: number }

export function ScriptEditor({
  projectId,
  initial,
}: {
  projectId: string
  initial: Segment[]
}) {
  const router = useRouter()
  const { t } = useI18n()
  const [segments, setSegments] = useState<Segment[]>(initial)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [genAi, setGenAi] = useState(false)

  async function aiGenerate() {
    setGenAi(true)
    setError(null)
    try {
      const r = await fetch(`/api/projects/${projectId}/ai-script`, { method: 'POST' })
      const d = (await r.json()) as { script_segments?: Segment[]; error?: string }
      if (!r.ok || !d.script_segments) throw new Error(d.error ?? `HTTP ${r.status}`)
      setSegments(d.script_segments)
      setEditing(true)
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setGenAi(false)
    }
  }

  function update(i: number, text: string) {
    const next = segments.slice()
    next[i] = { ...next[i], text }
    setSegments(next)
  }
  function addSeg() {
    setSegments([...segments, { type: 'extra', text: '', duration_sec: 30 }])
  }
  function removeSeg(i: number) {
    setSegments(segments.filter((_, k) => k !== i))
  }

  async function save() {
    setSaving(true)
    setError(null)
    setSaved(false)
    try {
      const r = await fetch(`/api/projects/${projectId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ script_segments: segments }),
      })
      const d = (await r.json()) as { error?: string }
      if (!r.ok) throw new Error(d.error ?? `HTTP ${r.status}`)
      setSaved(true)
      setEditing(false)
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  if (!editing) {
    return (
      <div className="space-y-3">
        {segments.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('proj.emptyScript')}</p>
        ) : (
          segments.map((seg, i) => (
            <div key={i} className="rounded-md border bg-muted/30 p-3">
              <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
                <span className="font-medium uppercase tracking-wider">{t(`seg.${seg.type}`)}</span>
                {seg.duration_sec && <span>~{Math.round(seg.duration_sec)} {t('proj.sec')}</span>}
              </div>
              <p className="text-sm leading-relaxed">{seg.text}</p>
            </div>
          ))
        )}
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => setEditing(true)}>✎ {t('script.edit')}</Button>
          <Button size="sm" variant="outline" disabled={genAi} onClick={aiGenerate}>
            {genAi ? `🤖 ${t('av.saving')}` : `🤖 ${t('script.ai')}`}
          </Button>
        </div>
        {error && <p className="text-xs text-red-600">{error}</p>}
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {segments.map((seg, i) => (
        <div key={i} className="rounded-md border p-2">
          <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
            <span className="font-medium uppercase tracking-wider">{t(`seg.${seg.type}`)}</span>
            <button onClick={() => removeSeg(i)} className="text-red-500 hover:text-red-700">✕</button>
          </div>
          <Textarea value={seg.text} onChange={(e) => update(i, e.target.value)} rows={2} />
        </div>
      ))}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="ghost" onClick={addSeg}>+ {t('script.add')}</Button>
        <div className="flex-1" />
        <Button size="sm" variant="ghost" onClick={() => { setSegments(initial); setEditing(false) }} disabled={saving}>{t('av.cancel')}</Button>
        <Button size="sm" disabled={saving} onClick={save}>{saving ? t('av.saving') : t('script.save')}</Button>
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
      {saved && <p className="text-xs text-emerald-600">✓</p>}
    </div>
  )
}
