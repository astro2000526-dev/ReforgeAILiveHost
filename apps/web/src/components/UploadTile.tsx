'use client'

import { useRef } from 'react'

import { useI18n } from './LocaleProvider'

// Canvas-compress an image to Full-HD (1920 long edge) JPEG before upload.
export async function compressImage(file: File): Promise<Blob> {
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

export async function uploadFile(blob: Blob, filename: string): Promise<string> {
  const fd = new FormData()
  fd.append('file', blob, filename)
  const r = await fetch('/api/uploads', { method: 'POST', body: fd })
  const d = (await r.json()) as { url?: string; error?: string }
  if (!r.ok || !d.url) throw new Error(d.error ?? `upload HTTP ${r.status}`)
  return d.url
}

// Tap-to-upload tile: the preview itself is the button. Picking a file shows
// it immediately (object URL) and uploads in the background.
export function UploadTile({
  kind, url, localUrl, uploading, emptyIcon, onPick,
}: {
  kind: 'image' | 'video'
  url: string
  localUrl: string | null
  uploading: boolean
  emptyIcon: string
  onPick: (f: File) => void
}) {
  const { t } = useI18n()
  const inputRef = useRef<HTMLInputElement>(null)
  const shown = localUrl ?? url
  const open = () => inputRef.current?.click()
  return (
    <div className="relative">
      <input
        ref={inputRef}
        type="file"
        accept={`${kind}/*`}
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) onPick(f)
          e.target.value = '' // allow re-picking the same file
        }}
      />
      {shown ? (
        kind === 'image' ? (
          <button type="button" onClick={open} className="group relative block w-full" aria-label={t('av.change')}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={shown} alt="" className="aspect-[2/3] w-full rounded-xl object-cover border" />
            <span className="absolute inset-0 flex items-end justify-center rounded-xl bg-gradient-to-t from-black/50 to-transparent opacity-0 transition-opacity group-hover:opacity-100">
              <span className="mb-2 rounded-md bg-black/60 px-2 py-1 text-xs text-white">📷 {t('av.change')}</span>
            </span>
          </button>
        ) : (
          <div className="relative">
            <video src={shown} className="aspect-[2/3] w-full rounded-xl object-cover border bg-black" muted playsInline controls />
            <button
              type="button"
              onClick={open}
              className="absolute right-2 top-2 rounded-md bg-black/60 px-2 py-1 text-xs text-white backdrop-blur hover:bg-black/80"
            >
              🎬 {t('av.change')}
            </button>
          </div>
        )
      ) : (
        <button
          type="button"
          onClick={open}
          className="flex aspect-[2/3] w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-input bg-muted/50 text-muted-foreground transition-colors hover:border-foreground/40 hover:bg-muted hover:text-foreground"
        >
          <span className="text-3xl">{emptyIcon}</span>
          <span className="text-xs font-medium">＋ {t('av.tapUpload')}</span>
        </button>
      )}
      {uploading && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 rounded-xl bg-background/70 backdrop-blur-sm">
          <span className="h-6 w-6 animate-spin rounded-full border-2 border-foreground border-t-transparent" />
          <span className="text-xs font-medium">{t('av.uploading')}</span>
        </div>
      )}
    </div>
  )
}
