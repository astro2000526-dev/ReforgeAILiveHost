import Link from 'next/link'
import { notFound } from 'next/navigation'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { DEMO_USER_ID } from '@/lib/demo-user'
import { supabaseAdmin } from '@/lib/supabase-server'
import { getLocale } from '@/lib/locale-server'
import { translate, type Locale } from '@/lib/i18n'

import { PresenterCard } from './PresenterCard'
import { ProjectActionPanel } from './ProjectActionPanel'
import { ScriptEditor } from './ScriptEditor'
import { VersionList } from './VersionList'

const STATUS_KEY: Record<string, string> = {
  draft: 'status.draft',
  generating: 'status.generating',
  ready: 'status.ready',
  failed: 'status.failed',
}

const STATUS_STYLE: Record<string, string> = {
  draft: 'bg-zinc-100 text-zinc-700',
  generating: 'bg-amber-100 text-amber-800',
  ready: 'bg-emerald-100 text-emerald-800',
  failed: 'bg-red-100 text-red-700',
}

const LOCALE_TAG: Record<Locale, string> = { en: 'en-US', zh: 'zh-CN', th: 'th-TH' }

export const dynamic = 'force-dynamic'

type AvatarRow = {
  id: string
  name: string | null
  preview_image_url: string | null
  region: string | null
  gender: string | null
}

type ProductInfo = {
  title?: string
  price_now?: number
  price_original?: number
  selling_points?: string[]
}

type Segment = { type: string; text: string; duration_sec?: number }

type ProjectRow = {
  id: string
  name: string
  status: string
  language: string | null
  voice: string | null
  speech_rate: string | null
  product_info: ProductInfo | null
  script_segments: Segment[] | null
  created_at: string
  avatar: AvatarRow | AvatarRow[] | null
}

type VMeta = { duration_seconds?: number; mode?: string; voice?: string; voice_clone?: boolean; playback_speed?: number; tts_provider?: string; script_text?: string }
type Version = { id: string; output_video_url: string | null; created_at: string; meta: VMeta | null }

async function listVersions(projectId: string): Promise<Version[]> {
  const { data } = await supabaseAdmin
    .from('generations')
    .select('id, output_video_url, created_at, meta')
    .eq('project_id', projectId)
    .eq('status', 'done')
    .not('output_video_url', 'is', null)
    .order('created_at', { ascending: false })
    .limit(50)
  return (data as Version[]) ?? []
}

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const locale = await getLocale()
  const t = (k: string) => translate(locale, k)

  const { data, error } = await supabaseAdmin
    .from('projects')
    .select(
      `
        id, name, status, language, voice, speech_rate,
        product_info, script_segments, created_at,
        avatar:avatars (id, name, preview_image_url, region, gender)
      `
    )
    .eq('id', id)
    .eq('user_id', DEMO_USER_ID)
    .maybeSingle<ProjectRow>()

  if (error) {
    return (
      <main className="mx-auto max-w-4xl px-6 py-12">
        <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          {t('dash.loadFailed')}{error.message}
        </div>
      </main>
    )
  }

  if (!data) notFound()

  const avatar = Array.isArray(data.avatar) ? data.avatar[0] ?? null : data.avatar
  const product = data.product_info ?? {}
  const segments = data.script_segments ?? []
  const versions = await listVersions(data.id)
  const videoUrl = versions[0]?.output_video_url ?? null
  const estDur = Math.round(segments.reduce((s, x) => s + (x.duration_sec ?? 30), 0))

  return (
    <main className="mx-auto max-w-4xl px-6 py-12">
      <Link
        href="/dashboard"
        className="text-xs font-mono uppercase tracking-widest text-muted-foreground hover:text-foreground"
      >
        {t('common.back')}
      </Link>

      <header className="mt-3 mb-8 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">{data.name}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {data.language ?? '—'} · {data.voice ?? '—'} · {data.speech_rate ?? '+0%'} ·{' '}
            {new Date(data.created_at).toLocaleString(LOCALE_TAG[locale])}
          </p>
        </div>
        <span
          className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium ${
            STATUS_STYLE[data.status] ?? 'bg-zinc-100 text-zinc-700'
          }`}
        >
          {STATUS_KEY[data.status] ? t(STATUS_KEY[data.status]) : data.status}
        </span>
      </header>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          {videoUrl && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">{t('proj.video')}</CardTitle>
                <CardDescription className="break-all">{videoUrl}</CardDescription>
              </CardHeader>
              <CardContent>
                <video
                  src={videoUrl}
                  controls
                  className="aspect-video w-full rounded-md bg-black"
                />
              </CardContent>
            </Card>
          )}

          {versions.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Versions ({versions.length})</CardTitle>
                <CardDescription>{t('ver.desc')}</CardDescription>
              </CardHeader>
              <CardContent>
                <VersionList projectId={data.id} versions={versions} />
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t('proj.product')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div>
                <span className="text-muted-foreground">{t('proj.title')} </span>
                {product.title ?? '—'}
              </div>
              <div className="flex gap-4">
                <div>
                  <span className="text-muted-foreground">{t('proj.priceNow')} </span>
                  {product.price_now != null ? `¥${product.price_now}` : '—'}
                </div>
                <div>
                  <span className="text-muted-foreground">{t('proj.priceOrig')} </span>
                  {product.price_original != null ? `¥${product.price_original}` : '—'}
                </div>
              </div>
              {product.selling_points && product.selling_points.length > 0 && (
                <div>
                  <span className="text-muted-foreground">{t('proj.points')} </span>
                  {product.selling_points.join(' · ')}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t('proj.script')}（{segments.length} {t('proj.segments')}）</CardTitle>
              <CardDescription>{t('proj.estDur')} ~{estDur} {t('proj.sec')}</CardDescription>
            </CardHeader>
            <CardContent>
              <ScriptEditor projectId={data.id} initial={segments} />
            </CardContent>
          </Card>
        </div>

        <aside className="space-y-6">
          <PresenterCard projectId={data.id} current={avatar} />

          <ProjectActionPanel
            projectId={data.id}
            initialStatus={data.status}
          />
        </aside>
      </div>
    </main>
  )
}
