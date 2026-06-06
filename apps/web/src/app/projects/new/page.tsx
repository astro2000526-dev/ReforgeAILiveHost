'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useI18n } from '@/components/LocaleProvider'
import type { Avatar, Segment } from '@/lib/types'

type AvatarOption = Pick<Avatar, 'id' | 'name' | 'preview_image_url' | 'region' | 'gender'>

// label/hint are i18n keys — resolved with t() at render time.
const VOICE_OPTIONS = [
  { id: 'BV001_streaming', label: 'voice.bv001.label', hint: 'voice.bv001.hint', lang: 'zh-CN' },
  { id: 'BV700_streaming', label: 'voice.bv700.label', hint: 'voice.bv700.hint', lang: 'zh-CN' },
  { id: 'BV421_streaming', label: 'voice.bv421.label', hint: 'voice.bv421.hint', lang: 'zh-CN' },
  { id: 'th-TH-PremwadeeNeural', label: 'voice.prem.label', hint: 'voice.prem.hint', lang: 'th-TH' },
  { id: 'th-TH-NiwatNeural', label: 'voice.niwat.label', hint: 'voice.niwat.hint', lang: 'th-TH' },
]

// Script language follows the UI language the user picked in the header.
const LANG_BY_LOCALE: Record<string, string> = {
  en: 'en-US',
  zh: 'zh-CN',
  th: 'th-TH',
}

export default function NewProjectPage() {
  const router = useRouter()
  const { t, locale } = useI18n()

  const [step, setStep] = useState<1 | 2 | 3 | 4>(1)
  const [avatars, setAvatars] = useState<AvatarOption[]>([])
  const [avatarsLoading, setAvatarsLoading] = useState(true)
  const [avatarsError, setAvatarsError] = useState<string | null>(null)
  const [avatarId, setAvatarId] = useState<string>('')

  const [productTitle, setProductTitle] = useState('')
  const [priceNow, setPriceNow] = useState('')
  const [priceOriginal, setPriceOriginal] = useState('')
  const [sellingPointsText, setSellingPointsText] = useState('')

  const [segments, setSegments] = useState<Segment[]>([])
  const [scriptLoading, setScriptLoading] = useState(false)
  const [scriptError, setScriptError] = useState<string | null>(null)

  const [projectName, setProjectName] = useState('')
  const [voice, setVoice] = useState(VOICE_OPTIONS[0].id)
  const [speechRate, setSpeechRate] = useState('+0%')

  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const RATE_OPTIONS = [
    { id: '-10%', label: t('rate.slow') },
    { id: '+0%', label: t('rate.normal') },
    { id: '+10%', label: t('rate.fast') },
  ]

  useEffect(() => {
    let cancelled = false
    fetch('/api/avatars')
      .then(async (r) => {
        if (!r.ok) throw new Error(`avatars HTTP ${r.status}`)
        return r.json() as Promise<{ avatars: AvatarOption[] }>
      })
      .then((data) => {
        if (cancelled) return
        setAvatars(data.avatars ?? [])
        setAvatarsLoading(false)
      })
      .catch((err) => {
        if (cancelled) return
        setAvatarsError(err.message)
        setAvatarsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  async function generateScript() {
    setScriptLoading(true)
    setScriptError(null)
    try {
      const sellingPoints = sellingPointsText
        .split(/[\n,，]/)
        .map((s) => s.trim())
        .filter(Boolean)
      const language = LANG_BY_LOCALE[locale] ?? 'en-US'
      if (language === 'th-TH' && voice.startsWith('BV')) {
        setVoice('th-TH-PremwadeeNeural')
      }
      const r = await fetch('/api/projects/draft/script', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          product_title: productTitle,
          price_now: priceNow ? Number(priceNow) : undefined,
          price_original: priceOriginal ? Number(priceOriginal) : undefined,
          selling_points: sellingPoints.length ? sellingPoints : undefined,
          language,
        }),
      })
      if (!r.ok) throw new Error(`script HTTP ${r.status}`)
      const data = (await r.json()) as { script_segments: Segment[] }
      setSegments(data.script_segments)
      if (!projectName) setProjectName(productTitle || t('wiz.untitled'))
      setStep(3)
    } catch (err) {
      setScriptError(err instanceof Error ? err.message : String(err))
    } finally {
      setScriptLoading(false)
    }
  }

  async function saveProject() {
    setSaving(true)
    setSaveError(null)
    try {
      const sellingPoints = sellingPointsText
        .split(/[\n,，]/)
        .map((s) => s.trim())
        .filter(Boolean)
      const language = LANG_BY_LOCALE[locale] ?? 'en-US'
      const r = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: projectName.trim() || t('wiz.untitled'),
          avatar_id: avatarId,
          language,
          voice,
          speech_rate: speechRate,
          product_info: {
            title: productTitle,
            price_now: priceNow ? Number(priceNow) : undefined,
            price_original: priceOriginal ? Number(priceOriginal) : undefined,
            selling_points: sellingPoints,
          },
          script_segments: segments,
        }),
      })
      const data = (await r.json()) as { project?: { id: string }; error?: string }
      if (!r.ok || !data.project) throw new Error(data.error ?? `HTTP ${r.status}`)
      router.push(`/projects/${data.project.id}`)
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : String(err))
      setSaving(false)
    }
  }

  return (
    <main className="mx-auto max-w-4xl px-6 py-12">
      <header className="mb-8">
        <Link href="/dashboard" className="text-xs font-mono uppercase tracking-widest text-muted-foreground hover:text-foreground">
          {t('common.back')}
        </Link>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">{t('wiz.title')}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t('wiz.subtitle')}</p>
      </header>

      <Stepper current={step} />

      {step === 1 && (
        <section className="mt-8">
          <h2 className="mb-4 text-lg font-medium">{t('wiz.s1.heading')}</h2>
          {avatarsLoading ? (
            <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
          ) : avatarsError ? (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">{avatarsError}</div>
          ) : avatars.length === 0 ? (
            <div className="rounded-md border border-dashed p-6 text-sm text-muted-foreground">
              {t('wiz.s1.empty')}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
              {avatars.map((a) => (
                <button
                  type="button"
                  key={a.id}
                  onClick={() => setAvatarId(a.id)}
                  className={`text-left rounded-lg border p-3 transition-colors hover:bg-muted/40 ${
                    avatarId === a.id ? 'border-primary ring-2 ring-primary/30' : 'border-border'
                  }`}
                >
                  {a.preview_image_url && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={a.preview_image_url}
                      alt={a.name ?? ''}
                      className="mb-3 aspect-[2/3] w-full rounded-md object-cover"
                    />
                  )}
                  <p className="text-sm font-medium">{a.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {a.region ?? '?'} · {a.gender ?? '?'}
                  </p>
                </button>
              ))}
            </div>
          )}
          <div className="mt-8 flex justify-end">
            <Button size="lg" disabled={!avatarId} onClick={() => setStep(2)}>
              {t('common.next')}
            </Button>
          </div>
        </section>
      )}

      {step === 2 && (
        <section className="mt-8 space-y-5">
          <h2 className="text-lg font-medium">{t('wiz.s2.heading')}</h2>
          <p className="text-sm text-muted-foreground">{t('wiz.s2.note')}</p>

          <div className="space-y-2">
            <Label htmlFor="title">{t('wiz.s2.title')}</Label>
            <Input
              id="title"
              placeholder={t('wiz.s2.titlePh')}
              value={productTitle}
              onChange={(e) => setProductTitle(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="price-now">{t('wiz.s2.priceNow')}</Label>
              <Input
                id="price-now"
                type="number"
                inputMode="numeric"
                placeholder="99"
                value={priceNow}
                onChange={(e) => setPriceNow(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="price-original">{t('wiz.s2.priceOrig')}</Label>
              <Input
                id="price-original"
                type="number"
                inputMode="numeric"
                placeholder="199"
                value={priceOriginal}
                onChange={(e) => setPriceOriginal(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="selling-points">{t('wiz.s2.points')}</Label>
            <Textarea
              id="selling-points"
              value={sellingPointsText}
              onChange={(e) => setSellingPointsText(e.target.value)}
              rows={4}
            />
          </div>

          {scriptError && (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{scriptError}</div>
          )}

          <div className="flex justify-between">
            <Button variant="ghost" onClick={() => setStep(1)}>
              {t('common.prev')}
            </Button>
            <Button size="lg" disabled={!productTitle.trim() || scriptLoading} onClick={generateScript}>
              {scriptLoading ? t('wiz.s2.generating') : t('wiz.s2.gen')}
            </Button>
          </div>
        </section>
      )}

      {step === 3 && (
        <section className="mt-8 space-y-5">
          <h2 className="text-lg font-medium">{t('wiz.s3.heading')}</h2>
          <p className="text-sm text-muted-foreground">{t('wiz.s3.note')}</p>

          <div className="space-y-3">
            {segments.map((seg, i) => (
              <div key={i} className="rounded-lg border p-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    {t(`seg.${seg.type}`)}
                  </span>
                  {seg.duration_sec && (
                    <span className="text-xs text-muted-foreground">~{Math.round(seg.duration_sec)} {t('proj.sec')}</span>
                  )}
                </div>
                <Textarea
                  value={seg.text}
                  onChange={(e) => {
                    const next = segments.slice()
                    next[i] = { ...seg, text: e.target.value }
                    setSegments(next)
                  }}
                  rows={2}
                />
              </div>
            ))}
          </div>

          <div className="flex justify-between">
            <Button variant="ghost" onClick={() => setStep(2)}>
              {t('common.prev')}
            </Button>
            <Button size="lg" onClick={() => setStep(4)}>
              {t('common.next')} →
            </Button>
          </div>
        </section>
      )}

      {step === 4 && (
        <section className="mt-8 space-y-6">
          <h2 className="text-lg font-medium">{t('wiz.s4.heading')}</h2>

          <div className="space-y-2">
            <Label htmlFor="project-name">{t('wiz.s4.name')}</Label>
            <Input
              id="project-name"
              placeholder={t('wiz.s4.namePh')}
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label>{t('wiz.s4.voice')}</Label>
            <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
              {VOICE_OPTIONS.map((v) => (
                <button
                  type="button"
                  key={v.id}
                  onClick={() => setVoice(v.id)}
                  className={`text-left rounded-lg border p-3 transition-colors hover:bg-muted/40 ${
                    voice === v.id ? 'border-primary ring-2 ring-primary/30' : 'border-border'
                  }`}
                >
                  <p className="text-sm font-medium">{t(v.label)}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{t(v.hint)}</p>
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label>{t('wiz.s4.rate')}</Label>
            <div className="flex gap-2">
              {RATE_OPTIONS.map((r) => (
                <button
                  type="button"
                  key={r.id}
                  onClick={() => setSpeechRate(r.id)}
                  className={`rounded-lg border px-4 py-2 text-sm transition-colors hover:bg-muted/40 ${
                    speechRate === r.id ? 'border-primary ring-2 ring-primary/30' : 'border-border'
                  }`}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>

          {saveError && (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{saveError}</div>
          )}

          <div className="flex justify-between">
            <Button variant="ghost" onClick={() => setStep(3)} disabled={saving}>
              {t('common.prev')}
            </Button>
            <Button size="lg" onClick={saveProject} disabled={saving || !projectName.trim()}>
              {saving ? t('wiz.s4.saving') : t('wiz.s4.save')}
            </Button>
          </div>
        </section>
      )}
    </main>
  )
}

function Stepper({ current }: { current: 1 | 2 | 3 | 4 }) {
  const { t } = useI18n()
  const steps = [t('wiz.step1'), t('wiz.step2'), t('wiz.step3'), t('wiz.step4')]
  return (
    <ol className="flex flex-wrap items-center gap-2 text-xs">
      {steps.map((label, i) => {
        const n = (i + 1) as 1 | 2 | 3 | 4
        const active = n === current
        const done = n < current
        return (
          <li key={label} className="flex items-center gap-2">
            <span
              className={`flex h-6 w-6 items-center justify-center rounded-full border text-[11px] font-medium ${
                active
                  ? 'border-primary bg-primary text-primary-foreground'
                  : done
                    ? 'border-primary/40 bg-primary/10 text-primary'
                    : 'border-border bg-background text-muted-foreground'
              }`}
            >
              {n}
            </span>
            <span className={active ? 'font-medium' : 'text-muted-foreground'}>{label}</span>
            {i < steps.length - 1 && <span className="text-muted-foreground">›</span>}
          </li>
        )
      })}
    </ol>
  )
}
