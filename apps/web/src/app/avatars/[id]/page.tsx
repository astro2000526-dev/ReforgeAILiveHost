'use client'

import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useI18n } from '@/components/LocaleProvider'
import { UploadTile, compressImage, uploadFile } from '@/components/UploadTile'
import { FRAME_POSITIONS, REGIONS } from '@/lib/constants'

// 9-grid anchor → flexbox alignment for the live preview box.
function posFlexStyle(pos: string): React.CSSProperties {
  const p = (pos || 'center').toLowerCase()
  return {
    justifyContent: p.includes('left') ? 'flex-start' : p.includes('right') ? 'flex-end' : 'center',
    alignItems: p.includes('top') ? 'flex-start' : p.includes('bottom') ? 'flex-end' : 'center',
  }
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
  const [localImg, setLocalImg] = useState<string | null>(null)
  const [localVid, setLocalVid] = useState<string | null>(null)
  // Background & camera (per-presenter render settings)
  const [bgRemove, setBgRemove] = useState(false)
  const [bgUrl, setBgUrl] = useState('')
  const [bgType, setBgType] = useState<'image' | 'video'>('image')
  const [zoom, setZoom] = useState(1.0)
  const [framePos, setFramePos] = useState<string>('center')
  const [frameScale, setFrameScale] = useState(1.0)
  const [uploadingBg, setUploadingBg] = useState(false)
  const [localBg, setLocalBg] = useState<string | null>(null)
  const [localBgType, setLocalBgType] = useState<'image' | 'video'>('image')
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
          setBgRemove(!!a.bg_remove)
          setBgUrl(a.background_url ?? '')
          setBgType(a.background_type === 'video' ? 'video' : 'image')
          setZoom(Number(a.camera_zoom) || 1.0)
          setFramePos(a.frame_position || 'center')
          setFrameScale(Number(a.frame_scale) || 1.0)
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
  async function onBg(f: File) {
    const isVid = f.type.startsWith('video')
    setLocalBg(URL.createObjectURL(f)); setLocalBgType(isVid ? 'video' : 'image')
    setUploadingBg(true); setError(null)
    try {
      const blob = isVid ? f : await compressImage(f)
      setBgUrl(await uploadFile(blob, isVid ? f.name : 'background.jpg'))
      setBgType(isVid ? 'video' : 'image')
      setLocalBg(null)
    } catch (err) { setLocalBg(null); setError(err instanceof Error ? err.message : String(err)) }
    finally { setUploadingBg(false) }
  }

  async function save() {
    setSaving(true); setError(null); setSaved(false)
    try {
      const r = await fetch(`/api/avatars/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(), region, gender, description: details.trim() || null,
          preview_image_url: imageUrl || null, template_video_url: videoUrl || '',
          bg_remove: bgRemove, background_url: bgUrl || null,
          background_type: bgUrl ? bgType : null, camera_zoom: zoom,
          frame_position: framePos, frame_scale: frameScale,
        }),
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

        {/* --- Background & camera (per-presenter render settings) --- */}
        <div className="space-y-4 rounded-xl border p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <Label>{t('av.bgTitle')}</Label>
              <p className="mt-1 text-[11px] text-muted-foreground">{t('av.bgRemoveHint')}</p>
            </div>
            <label className="flex shrink-0 cursor-pointer items-center gap-2 text-sm">
              <input type="checkbox" checked={bgRemove} onChange={(e) => setBgRemove(e.target.checked)} className="h-4 w-4 accent-foreground" />
              {t('av.bgRemove')}
            </label>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-xs">{t('av.bgMedia')}</Label>
              <BgTile
                url={bgUrl} type={bgType} localUrl={localBg} localType={localBgType}
                uploading={uploadingBg} onPick={onBg} pickLabel={t('av.tapUpload')} uploadingLabel={t('av.uploading')}
              />
              {bgUrl && (
                <button type="button" onClick={() => setBgUrl('')} className="text-xs text-muted-foreground underline hover:text-foreground">
                  ✕ {t('av.bgClear')}
                </button>
              )}
              <p className="text-[11px] text-muted-foreground">{t('av.bgHint')}</p>
            </div>
            <div className="space-y-2">
              <Label className="text-xs">{t('av.previewApprox')}</Label>
              <div className="relative aspect-[2/3] w-full overflow-hidden rounded-xl border bg-black">
                {bgRemove && (localBg ?? bgUrl) && (
                  (localBg ? localBgType : bgType) === 'video' ? (
                    <video src={localBg ?? bgUrl} className="absolute inset-0 h-full w-full object-cover" muted loop autoPlay playsInline />
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={localBg ?? bgUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
                  )
                )}
                {imageUrl ? (
                  <div className="absolute inset-0 flex" style={posFlexStyle(framePos)}>
                    <div style={{ width: `${frameScale * 100}%`, height: `${frameScale * 100}%` }} className="relative overflow-hidden">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={imageUrl} alt="" className={`h-full w-full ${bgRemove ? 'object-contain' : 'object-cover'}`} style={{ transform: `scale(${zoom})`, transformOrigin: 'center' }} />
                    </div>
                  </div>
                ) : (
                  <span className="absolute inset-0 flex items-center justify-center text-3xl">🎭</span>
                )}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-xs">{t('av.framePos')}</Label>
              <div className="grid w-28 grid-cols-3 gap-1">
                {FRAME_POSITIONS.map((p) => (
                  <button
                    key={p} type="button" title={p} aria-label={p}
                    onClick={() => setFramePos(p)}
                    className={`h-8 rounded-md border text-xs transition-colors ${framePos === p ? 'border-foreground bg-foreground text-background' : 'border-input bg-muted/40 hover:bg-muted'}`}
                  >
                    {framePos === p ? '●' : '·'}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-xs">{t('av.frameScale')} — {Math.round(frameScale * 100)}%</Label>
              <input
                type="range" min={0.2} max={1} step={0.05} value={frameScale}
                onChange={(e) => setFrameScale(Number(e.target.value))}
                className="w-full accent-foreground"
              />
              <p className="text-[11px] text-muted-foreground">{t('av.frameHint')}</p>
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-xs">{t('av.zoom')} — {zoom.toFixed(2)}×</Label>
            <input
              type="range" min={1} max={2.5} step={0.05} value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
              className="w-full accent-foreground"
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label>{t('av.details')}</Label>
          <Textarea rows={3} value={details} onChange={(e) => setDetails(e.target.value)} />
        </div>

        {error && <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-2 text-xs text-destructive break-all">{error}</div>}
        {saved && <p className="text-sm text-success">✓ {t('av.uploaded')}</p>}

        <div className="flex gap-2">
          <Button className="flex-1" size="lg" disabled={saving || uploadingImg || uploadingVid || uploadingBg || !name.trim()} onClick={save}>
            {saving ? t('av.updating') : t('av.update')}
          </Button>
          <Link href="/avatars" className="inline-flex items-center rounded-lg border px-4 text-sm hover:bg-muted">{t('av.cancel')}</Link>
        </div>
      </div>
    </main>
  )
}

// Background upload tile — accepts BOTH image and video; the picked file's
// mime type decides background_type. Same tap-to-upload UX as UploadTile.
function BgTile({
  url, type, localUrl, localType, uploading, onPick, pickLabel, uploadingLabel,
}: {
  url: string
  type: 'image' | 'video'
  localUrl: string | null
  localType: 'image' | 'video'
  uploading: boolean
  onPick: (f: File) => void
  pickLabel: string
  uploadingLabel: string
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const shown = localUrl ?? url
  const shownType = localUrl ? localType : type
  return (
    <div className="relative">
      <input
        ref={inputRef}
        type="file"
        accept="image/*,video/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) onPick(f)
          e.target.value = ''
        }}
      />
      {shown ? (
        <button type="button" onClick={() => inputRef.current?.click()} className="group relative block w-full">
          {shownType === 'video' ? (
            <video src={shown} className="aspect-[2/3] w-full rounded-xl border object-cover bg-black" muted loop autoPlay playsInline />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={shown} alt="" className="aspect-[2/3] w-full rounded-xl border object-cover" />
          )}
          <span className="absolute inset-0 flex items-end justify-center rounded-xl bg-gradient-to-t from-black/50 to-transparent opacity-0 transition-opacity group-hover:opacity-100">
            <span className="mb-2 rounded-md bg-black/60 px-2 py-1 text-xs text-white">🖼️ {pickLabel}</span>
          </span>
        </button>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="flex aspect-[2/3] w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-input bg-muted/50 text-muted-foreground transition-colors hover:border-foreground/40 hover:bg-muted hover:text-foreground"
        >
          <span className="text-3xl">🖼️</span>
          <span className="text-xs font-medium">＋ {pickLabel}</span>
        </button>
      )}
      {uploading && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 rounded-xl bg-background/70 backdrop-blur-sm">
          <span className="h-6 w-6 animate-spin rounded-full border-2 border-foreground border-t-transparent" />
          <span className="text-xs font-medium">{uploadingLabel}</span>
        </div>
      )}
    </div>
  )
}
