'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useI18n } from '@/components/LocaleProvider'
import { UploadTile, compressImage, uploadFile } from '@/components/UploadTile'
import { REGIONS } from '@/lib/constants'
import type { Avatar } from '@/lib/types'

// ─── inline form state (shared by create + edit) ─────────────────────────────
function emptyForm(): FormState {
  return { name: '', region: 'TH', gender: 'female', details: '', imageUrl: '', videoUrl: '', order: 100 }
}
type FormState = { name: string; region: string; gender: string; details: string; imageUrl: string; videoUrl: string; order: number }

export default function AvatarsPage() {
  const { t } = useI18n()
  const [avatars, setAvatars] = useState<Avatar[]>([])
  const [loading, setLoading] = useState(true)
  const [editId, setEditId] = useState<string | null>(null)   // null = create mode
  const [form, setForm] = useState<FormState>(emptyForm())
  const [uploadingImg, setUploadingImg] = useState(false)
  const [uploadingVid, setUploadingVid] = useState(false)
  const [localImg, setLocalImg] = useState<string | null>(null)
  const [localVid, setLocalVid] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [dragId, setDragId] = useState<string | null>(null)
  const [savingOrder, setSavingOrder] = useState(false)

  async function load() {
    setLoading(true)
    try {
      const r = await fetch('/api/avatars', { cache: 'no-store' })
      const d = (await r.json()) as { avatars: Avatar[] }
      setAvatars(d.avatars ?? [])
    } finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])

  function cancelEdit() { setEditId(null); setForm(emptyForm()); setError(null) }

  // ── drag-to-sort ────────────────────────────────────────────────────────
  // HTML5 DnD: dragging a card over another swaps it into that slot
  // (optimistic), drop persists display_order = (index+1)*10 for every card
  // whose slot changed.
  function onDragOverCard(overId: string) {
    if (!dragId || dragId === overId) return
    setAvatars((xs) => {
      const from = xs.findIndex((a) => a.id === dragId)
      const to = xs.findIndex((a) => a.id === overId)
      if (from < 0 || to < 0) return xs
      const next = [...xs]
      const [moved] = next.splice(from, 1)
      next.splice(to, 0, moved)
      return next
    })
  }

  async function persistOrder() {
    setDragId(null)
    setSavingOrder(true)
    try {
      const changed = avatars
        .map((a, i) => ({ id: a.id, order: (i + 1) * 10, prev: a.display_order }))
        .filter((x) => x.prev !== x.order)
      await Promise.all(changed.map((x) =>
        fetch(`/api/avatars/${x.id}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ display_order: x.order }),
        })
      ))
      // sync local copy so further drags diff correctly
      setAvatars((xs) => xs.map((a, i) => ({ ...a, display_order: (i + 1) * 10 })))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      await load() // restore server truth on failure
    } finally { setSavingOrder(false) }
  }
  void setEditId  // editId stays for create-mode display; edit moved to /avatars/[id]

  async function onPickImage(f: File) {
    setLocalImg(URL.createObjectURL(f)) // instant preview while uploading
    setUploadingImg(true); setError(null)
    try { const url = await uploadFile(await compressImage(f), 'preview.jpg'); setForm(p => ({ ...p, imageUrl: url })); setLocalImg(null) }
    catch (err) { setLocalImg(null); setError(err instanceof Error ? err.message : String(err)) }
    finally { setUploadingImg(false) }
  }

  async function onPickVideo(f: File) {
    setLocalVid(URL.createObjectURL(f))
    setUploadingVid(true); setError(null)
    try { const url = await uploadFile(f, f.name); setForm(p => ({ ...p, videoUrl: url })); setLocalVid(null) }
    catch (err) { setLocalVid(null); setError(err instanceof Error ? err.message : String(err)) }
    finally { setUploadingVid(false) }
  }

  async function save() {
    setSaving(true); setError(null)
    const body = {
      name: form.name.trim(),
      region: form.region || null,
      gender: form.gender || null,
      description: form.details.trim() || null,
      preview_image_url: form.imageUrl || null,
      template_video_url: form.videoUrl || '',
      display_order: form.order,
    }
    try {
      let r: Response
      if (editId) {
        r = await fetch(`/api/avatars/${editId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      } else {
        r = await fetch('/api/avatars', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      }
      const d = (await r.json()) as { avatar?: Avatar; error?: string }
      if (!r.ok) throw new Error(d.error ?? `HTTP ${r.status}`)
      cancelEdit(); await load()
    } catch (err) { setError(err instanceof Error ? err.message : String(err)) }
    finally { setSaving(false) }
  }

  async function deactivate(id: string) {
    if (!confirm('Deactivate this presenter?')) return
    setDeleting(id)
    try {
      await fetch(`/api/avatars/${id}`, { method: 'DELETE' })
      await load()
    } finally { setDeleting(null) }
  }

  const formPanel = (
    <div className="space-y-4 rounded-lg border p-5">
      <h2 className="text-lg font-medium">{editId ? t('av.edit') : t('av.add')}</h2>

      <div className="space-y-2">
        <Label>{t('av.name')}</Label>
        <Input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} />
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="space-y-2">
          <Label>{t('av.region')}</Label>
          <select value={form.region} onChange={e => setForm(p => ({ ...p, region: e.target.value }))}
            className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
            {REGIONS.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
        <div className="space-y-2">
          <Label>{t('av.gender')}</Label>
          <select value={form.gender} onChange={e => setForm(p => ({ ...p, gender: e.target.value }))}
            className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
            <option value="female">{t('av.gender.female')}</option>
            <option value="male">{t('av.gender.male')}</option>
            <option value="other">{t('av.gender.other')}</option>
          </select>
        </div>
        <div className="space-y-2">
          <Label>{t('av.order')}</Label>
          <Input type="number" value={form.order} onChange={e => setForm(p => ({ ...p, order: Number(e.target.value) || 100 }))} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>{t('av.image')} <span className="text-muted-foreground text-xs">({t('av.optional')})</span></Label>
          <UploadTile kind="image" url={form.imageUrl} localUrl={localImg} uploading={uploadingImg} emptyIcon="🎭" onPick={onPickImage} />
          {form.imageUrl && !uploadingImg && <p className="text-xs text-emerald-600">{t('av.uploaded')}</p>}
        </div>
        <div className="space-y-2">
          <Label>{t('av.video')} <span className="text-muted-foreground text-xs">({t('av.optional')})</span></Label>
          <UploadTile kind="video" url={form.videoUrl} localUrl={localVid} uploading={uploadingVid} emptyIcon="🎬" onPick={onPickVideo} />
          {form.videoUrl && !uploadingVid && <p className="text-xs text-emerald-600 break-all">{t('av.uploaded')}</p>}
        </div>
      </div>
      <p className="text-[11px] text-muted-foreground">{t('av.videoHint')}</p>

      <div className="space-y-2">
        <Label>{t('av.details')} <span className="text-muted-foreground text-xs">({t('av.optional')})</span></Label>
        <Textarea rows={3} value={form.details} onChange={e => setForm(p => ({ ...p, details: e.target.value }))} />
      </div>

      {error && <div className="rounded-md border border-red-200 bg-red-50 p-2 text-xs text-red-800 break-all">{error}</div>}

      <div className="flex gap-2">
        <Button className="flex-1" disabled={saving || uploadingImg || uploadingVid || !form.name.trim()} onClick={save}>
          {saving ? t('av.updating') : editId ? t('av.update') : t('av.save')}
        </Button>
        {editId && (
          <Button variant="outline" onClick={cancelEdit} disabled={saving}>{t('av.cancel')}</Button>
        )}
      </div>
    </div>
  )

  return (
    <main className="mx-auto max-w-5xl px-6 py-12">
      <header className="mb-8">
        <Link href="/dashboard" className="text-xs font-mono uppercase tracking-widest text-muted-foreground hover:text-foreground">
          {t('common.back')}
        </Link>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">{t('av.title')}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t('av.subtitle')}</p>
      </header>

      <div className="grid gap-8 lg:grid-cols-[380px_1fr]">
        {formPanel}

        <section>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-medium">{t('av.existing')}</h2>
            <span className="text-xs text-muted-foreground">
              {savingOrder ? t('av.orderSaving') : t('av.dragSort')}
            </span>
            {editId && (
              <Button size="sm" variant="outline" onClick={cancelEdit}>{t('av.add')} (new)</Button>
            )}
          </div>
          {loading ? (
            <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
          ) : avatars.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('av.none')}</p>
          ) : (
            <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
              {avatars.map((a) => (
                <div
                  key={a.id}
                  draggable
                  onDragStart={(e) => { setDragId(a.id); e.dataTransfer.effectAllowed = 'move' }}
                  onDragOver={(e) => { e.preventDefault(); onDragOverCard(a.id) }}
                  onDragEnd={() => void persistOrder()}
                  onDrop={(e) => e.preventDefault()}
                  className={`cursor-grab active:cursor-grabbing rounded-lg border p-3 transition-colors ${
                    dragId === a.id ? 'opacity-50 ring-2 ring-primary/50' :
                    editId === a.id ? 'border-primary ring-2 ring-primary/30' : 'hover:bg-muted/30'
                  }`}
                >
                  {a.preview_image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={a.preview_image_url} alt={a.name ?? ''} draggable={false} className="mb-2 aspect-[2/3] w-full rounded-md object-cover" />
                  ) : (
                    <div className="mb-2 flex aspect-[2/3] w-full items-center justify-center rounded-md bg-muted text-3xl text-muted-foreground">🎭</div>
                  )}
                  <p className="text-sm font-medium truncate">{a.name}</p>
                  <p className="text-xs text-muted-foreground">{a.region ?? '?'} · {a.gender ?? '?'}</p>
                  {a.template_video_url
                    ? <p className="mt-1 text-[11px] text-emerald-600">● {t('av.hasVideo')}</p>
                    : <p className="mt-1 text-[11px] text-amber-600">○ {t('av.noVideo')}</p>
                  }
                  {a.description && <p className="mt-1 line-clamp-2 text-[11px] text-muted-foreground">{a.description}</p>}
                  <div className="mt-3 flex gap-1.5">
                    <Link href={`/avatars/${a.id}`}
                      className="flex-1 inline-flex items-center justify-center rounded-md border px-2 py-1 text-xs hover:bg-muted">
                      {t('av.edit')}
                    </Link>
                    <Button size="sm" variant="ghost" className="text-xs text-red-500 hover:text-red-700 hover:bg-red-50"
                      disabled={deleting === a.id} onClick={() => deactivate(a.id)}>
                      {deleting === a.id ? '…' : '✕'}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  )
}
