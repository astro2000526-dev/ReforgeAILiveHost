'use client'

import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useI18n } from '@/components/LocaleProvider'

const REGIONS = ['TH', 'ID', 'VN', 'MY', 'CN', 'EN']

// Canvas-compress an image to Full-HD (1920 long edge) JPEG before upload.
async function compressImage(file: File): Promise<Blob> {
  if (!file.type.startsWith('image/')) return file
  const bmp = await createImageBitmap(file).catch(() => null)
  if (!bmp) return file
  const s = Math.min(1, 1920 / Math.max(bmp.width, bmp.height))
  const c = document.createElement('canvas')
  c.width = Math.round(bmp.width * s)
  c.height = Math.round(bmp.height * s)
  c.getContext('2d')?.drawImage(bmp, 0, 0, c.width, c.height)
  return (await new Promise<Blob | null>((res) => c.toBlob(res, 'image/jpeg', 0.9))) ?? file
}

async function uploadFile(blob: Blob, filename: string): Promise<string> {
  const fd = new FormData()
  fd.append('file', blob, filename)
  const r = await fetch('/api/uploads', { method: 'POST', body: fd })
  const d = (await r.json()) as { url?: string; error?: string }
  if (!r.ok || !d.url) throw new Error(d.error ?? `upload HTTP ${r.status}`)
  return d.url
}

export default function AvatarEditPage() {
  const { t } = useI18n()
  const router = useRouter()
  const params = useParams<{ id: string }>()
  const id = params.id

  const [loading, setLoading] = useState(true)
  const [name, setName] = useState('')
  const [region, setRegion] = useState('TH')
  const [gender, setGender] = useState('female')
  const [details, setDetails] = useState('')
  const [imageUrl, setImageUrl] = useState('')
  const [videoUrl, setVideoUrl] = useState('')
  const [uploadingImg, setUploadingImg] = useState(false)
  const [uploadingVid, setUploadingVid] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    fetch(`/api/avatars/${id}`)
      .then((r) => r.json())
      .then((d) => {
        const a = d.avatar
        if (a) {
          setName(a.name ?? '')
          setRegion(a.region ?? 'TH')
          setGender(a.gender ?? 'female')
          setDetails(a.description ?? '')
          setImageUrl(a.preview_image_url ?? '')
          setVideoUrl(a.template_video_url ?? '')
        }
      })
      .finally(() => setLoading(false))
  }, [id])

  async function onImg(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; if (!f) return
    setUploadingImg(true); setError(null)
    try { setImageUrl(await uploadFile(await compressImage(f), 'preview.jpg')) }
    catch (err) { setError(err instanceof Error ? err.message : String(err)) }
    finally { setUploadingImg(false) }
  }
  async function onVid(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; if (!f) return
    setUploadingVid(true); setError(null)
    try { setVideoUrl(await uploadFile(f, f.name)) }
    catch (err) { setError(err instanceof Error ? err.message : String(err)) }
    finally { setUploadingVid(false) }
  }

  async function save() {
    setSaving(true); setError(null); setSaved(false)
    try {
      const r = await fetch(`/api/avatars/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), region, gender, description: details.trim() || null, preview_image_url: imageUrl || null, template_video_url: videoUrl || '' }),
      })
      const d = (await r.json()) as { error?: string }
      if (!r.ok) throw new Error(d.error ?? `HTTP ${r.status}`)
      setSaved(true)
      setTimeout(() => router.push('/avatars'), 600)
    } catch (err) { setError(err instanceof Error ? err.message : String(err)) }
    finally { setSaving(false) }
  }

  if (loading) return <main className="mx-auto max-w-2xl px-6 py-12"><p className="text-muted-foreground">{t('common.loading')}</p></main>

  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <Link href="/avatars" className="text-xs font-mono uppercase tracking-widest text-muted-foreground hover:text-foreground">← {t('nav.avatars')}</Link>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">{t('av.edit')} — {name || '…'}</h1>

      <div className="lux-card mt-6 space-y-5 rounded-2xl border bg-card p-6">
        <div className="space-y-2">
          <Label>{t('av.name')}</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label>{t('av.region')}</Label>
            <select value={region} onChange={(e) => setRegion(e.target.value)} className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm">
              {REGIONS.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          <div className="space-y-2">
            <Label>{t('av.gender')}</Label>
            <select value={gender} onChange={(e) => setGender(e.target.value)} className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm">
              <option value="female">{t('av.gender.female')}</option>
              <option value="male">{t('av.gender.male')}</option>
              <option value="other">{t('av.gender.other')}</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>{t('av.image')}</Label>
            {imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={imageUrl} alt="" className="aspect-[2/3] w-full rounded-xl object-cover border" />
            ) : <div className="flex aspect-[2/3] w-full items-center justify-center rounded-xl bg-muted text-3xl">🎭</div>}
            <input type="file" accept="image/*" onChange={onImg} className="block w-full text-xs" />
            {uploadingImg && <p className="text-xs text-amber-600">{t('av.uploading')} (FullHD)</p>}
          </div>
          <div className="space-y-2">
            <Label>{t('av.video')}</Label>
            {videoUrl ? (
              <video src={videoUrl} className="aspect-[2/3] w-full rounded-xl object-cover border bg-black" muted playsInline controls />
            ) : <div className="flex aspect-[2/3] w-full items-center justify-center rounded-xl bg-muted text-3xl">🎬</div>}
            <input type="file" accept="video/*" onChange={onVid} className="block w-full text-xs" />
            {uploadingVid && <p className="text-xs text-amber-600">{t('av.uploading')}</p>}
          </div>
        </div>
        <p className="text-[11px] text-muted-foreground">{t('av.videoHint')}</p>

        <div className="space-y-2">
          <Label>{t('av.details')}</Label>
          <Textarea rows={3} value={details} onChange={(e) => setDetails(e.target.value)} />
        </div>

        {error && <div className="rounded-lg border border-red-200 bg-red-50 p-2 text-xs text-red-800 break-all">{error}</div>}
        {saved && <p className="text-sm text-emerald-600">✓ {t('av.uploaded')}</p>}

        <div className="flex gap-2">
          <Button className="flex-1" size="lg" disabled={saving || uploadingImg || uploadingVid || !name.trim()} onClick={save}>
            {saving ? t('av.updating') : t('av.update')}
          </Button>
          <Link href="/avatars" className="inline-flex items-center rounded-lg border px-4 text-sm hover:bg-muted">{t('av.cancel')}</Link>
        </div>
      </div>
    </main>
  )
}
