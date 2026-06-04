'use client'

import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useI18n } from '@/components/LocaleProvider'
import { UploadTile, compressImage, uploadFile } from '@/components/UploadTile'

const REGIONS = ['TH', 'ID', 'VN', 'MY', 'CN', 'EN']

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
  const [localImg, setLocalImg] = useState<string | null>(null)
  const [localVid, setLocalVid] = useState<string | null>(null)
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

  async function onImg(f: File) {
    setLocalImg(URL.createObjectURL(f)) // instant preview while uploading
    setUploadingImg(true); setError(null)
    try { setImageUrl(await uploadFile(await compressImage(f), 'preview.jpg')); setLocalImg(null) }
    catch (err) { setLocalImg(null); setError(err instanceof Error ? err.message : String(err)) }
    finally { setUploadingImg(false) }
  }
  async function onVid(f: File) {
    setLocalVid(URL.createObjectURL(f))
    setUploadingVid(true); setError(null)
    try { setVideoUrl(await uploadFile(f, f.name)); setLocalVid(null) }
    catch (err) { setLocalVid(null); setError(err instanceof Error ? err.message : String(err)) }
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
            <UploadTile kind="image" url={imageUrl} localUrl={localImg} uploading={uploadingImg} emptyIcon="🎭" onPick={onImg} />
          </div>
          <div className="space-y-2">
            <Label>{t('av.video')}</Label>
            <UploadTile kind="video" url={videoUrl} localUrl={localVid} uploading={uploadingVid} emptyIcon="🎬" onPick={onVid} />
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
