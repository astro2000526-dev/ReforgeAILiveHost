import Link from 'next/link'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { buttonVariants } from '@/components/ui/button'
import { DEMO_USER_ID } from '@/lib/demo-user'
import { supabaseAdmin } from '@/lib/supabase-server'

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

export const dynamic = 'force-dynamic'

export default async function DashboardPage() {
  const { data: projects, error } = await supabaseAdmin
    .from('projects')
    .select('id, name, status, language, voice, created_at')
    .eq('user_id', DEMO_USER_ID)
    .order('created_at', { ascending: false })

  return (
    <main className="mx-auto max-w-5xl px-6 py-12">
      <header className="mb-10 flex items-end justify-between gap-4">
        <div>
          <p className="text-xs font-mono uppercase tracking-widest text-muted-foreground">
            Reforge AI Live
          </p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">我的直播项目</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            每个项目对应一段可循环推流的 AI 数字人直播视频
          </p>
        </div>
        <Link href="/projects/new" className={buttonVariants({ size: 'lg' })}>
          + 新建项目
        </Link>
      </header>

      {error ? (
        <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          加载项目失败：{error.message}
        </div>
      ) : !projects || projects.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {projects.map((p) => (
            <Link key={p.id} href={`/projects/${p.id}`} className="block">
              <Card className="h-full transition-colors hover:bg-muted/40">
                <CardHeader>
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="text-base">{p.name}</CardTitle>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
                        STATUS_STYLE[p.status] ?? 'bg-zinc-100 text-zinc-700'
                      }`}
                    >
                      {STATUS_LABEL[p.status] ?? p.status}
                    </span>
                  </div>
                  <CardDescription className="text-xs">
                    {p.language} · {p.voice}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-xs text-muted-foreground">
                    {new Date(p.created_at).toLocaleString('zh-CN')}
                  </p>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </main>
  )
}

function EmptyState() {
  return (
    <div className="rounded-lg border border-dashed border-zinc-300 bg-zinc-50/50 p-12 text-center">
      <h2 className="text-lg font-medium">还没有项目</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        新建一个，5 步内就能生成第一段 AI 数字人直播视频。
      </p>
      <Link
        href="/projects/new"
        className={`${buttonVariants({ size: 'lg' })} mt-6`}
      >
        + 新建项目
      </Link>
    </div>
  )
}
