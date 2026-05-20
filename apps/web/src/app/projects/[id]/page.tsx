import Link from 'next/link'
import { notFound } from 'next/navigation'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { DEMO_USER_ID } from '@/lib/demo-user'
import { supabaseAdmin } from '@/lib/supabase-server'

import { ProjectActionPanel } from './ProjectActionPanel'

const STATUS_LABEL: Record<string, string> = {
  draft: '草稿',
  generating: '生成中',
  ready: '已就绪',
  failed: '失败',
}

const STATUS_STYLE: Record<string, string> = {
  draft: 'bg-zinc-100 text-zinc-700',
  generating: 'bg-amber-100 text-amber-800',
  ready: 'bg-emerald-100 text-emerald-800',
  failed: 'bg-red-100 text-red-700',
}

const SEGMENT_LABEL: Record<string, string> = {
  intro: '开场',
  pain: '痛点',
  product: '产品介绍',
  demo: '演示',
  price: '价格',
  cta: '促单',
}

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

async function latestVideoUrl(projectId: string): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from('generations')
    .select('output_video_url')
    .eq('project_id', projectId)
    .eq('status', 'done')
    .not('output_video_url', 'is', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  return data?.output_video_url ?? null
}

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

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
          加载项目失败：{error.message}
        </div>
      </main>
    )
  }

  if (!data) notFound()

  const avatar = Array.isArray(data.avatar) ? data.avatar[0] ?? null : data.avatar
  const product = data.product_info ?? {}
  const segments = data.script_segments ?? []
  const videoUrl = data.status === 'ready' ? await latestVideoUrl(data.id) : null

  return (
    <main className="mx-auto max-w-4xl px-6 py-12">
      <Link
        href="/dashboard"
        className="text-xs font-mono uppercase tracking-widest text-muted-foreground hover:text-foreground"
      >
        ← 返回控制台
      </Link>

      <header className="mt-3 mb-8 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">{data.name}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {data.language ?? '—'} · {data.voice ?? '—'} · {data.speech_rate ?? '+0%'} ·{' '}
            {new Date(data.created_at).toLocaleString('zh-CN')}
          </p>
        </div>
        <span
          className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium ${
            STATUS_STYLE[data.status] ?? 'bg-zinc-100 text-zinc-700'
          }`}
        >
          {STATUS_LABEL[data.status] ?? data.status}
        </span>
      </header>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          {videoUrl && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">生成的视频</CardTitle>
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

          <Card>
            <CardHeader>
              <CardTitle className="text-base">商品信息</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div>
                <span className="text-muted-foreground">标题：</span>
                {product.title ?? '—'}
              </div>
              <div className="flex gap-4">
                <div>
                  <span className="text-muted-foreground">现价：</span>
                  {product.price_now != null ? `¥${product.price_now}` : '—'}
                </div>
                <div>
                  <span className="text-muted-foreground">原价：</span>
                  {product.price_original != null ? `¥${product.price_original}` : '—'}
                </div>
              </div>
              {product.selling_points && product.selling_points.length > 0 && (
                <div>
                  <span className="text-muted-foreground">卖点：</span>
                  {product.selling_points.join(' · ')}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">脚本（{segments.length} 段）</CardTitle>
              <CardDescription>预估时长 ~{Math.round(segments.reduce((s, x) => s + (x.duration_sec ?? 30), 0))} 秒</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {segments.length === 0 ? (
                <p className="text-sm text-muted-foreground">脚本为空</p>
              ) : (
                segments.map((seg, i) => (
                  <div key={i} className="rounded-md border bg-muted/30 p-3">
                    <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
                      <span className="font-medium uppercase tracking-wider">
                        {SEGMENT_LABEL[seg.type] ?? seg.type}
                      </span>
                      {seg.duration_sec && <span>~{Math.round(seg.duration_sec)} 秒</span>}
                    </div>
                    <p className="text-sm leading-relaxed">{seg.text}</p>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>

        <aside className="space-y-6">
          {avatar && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">数字人</CardTitle>
              </CardHeader>
              <CardContent>
                {avatar.preview_image_url && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={avatar.preview_image_url}
                    alt={avatar.name ?? ''}
                    className="mb-3 aspect-[2/3] w-full rounded-md object-cover"
                  />
                )}
                <p className="text-sm font-medium">{avatar.name}</p>
                <p className="text-xs text-muted-foreground">
                  {avatar.region ?? '?'} · {avatar.gender ?? '?'}
                </p>
              </CardContent>
            </Card>
          )}

          <ProjectActionPanel
            projectId={data.id}
            initialStatus={data.status}
          />
        </aside>
      </div>
    </main>
  )
}
