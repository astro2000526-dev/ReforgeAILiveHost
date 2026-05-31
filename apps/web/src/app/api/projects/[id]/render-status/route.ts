// GET /api/projects/:id/render-status
// Polls the pipeline's async render job. On terminal state, mirrors the result
// into the generations + projects rows.

import { NextResponse } from 'next/server'
import { DEMO_USER_ID } from '@/lib/demo-user'
import { pipelineFetch } from '@/lib/pipeline-client'
import { supabaseAdmin } from '@/lib/supabase-server'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const result = await pipelineFetch(`/render/status/${encodeURIComponent(id)}`)
  if (!result.ok) {
    const status = result.error.kind === 'unconfigured' ? 503 : 502
    return NextResponse.json({ error: result.error.message }, { status })
  }

  const job = result.data as {
    status?: string
    pct?: number
    source?: string
    output_url?: string | null
    errors?: string[]
  }
  const terminal = job.status === 'done' || job.status === 'failed'

  if (terminal) {
    // mirror into DB (best-effort)
    const { data: gen } = await supabaseAdmin
      .from('generations')
      .select('id, status')
      .eq('project_id', id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (gen && !['done', 'failed'].includes(gen.status)) {
      await supabaseAdmin
        .from('generations')
        .update({
          status: job.status === 'done' ? 'done' : 'failed',
          progress: job.status === 'done' ? 100 : null,
          output_video_url: job.output_url ?? null,
          error_message: (job.errors ?? []).join('; ') || null,
          finished_at: new Date().toISOString(),
        })
        .eq('id', gen.id)
      await supabaseAdmin
        .from('projects')
        .update({ status: job.status === 'done' ? 'ready' : 'failed' })
        .eq('id', id)
        .eq('user_id', DEMO_USER_ID)
    }
  }

  return NextResponse.json({
    status: job.status ?? 'unknown',
    pct: job.pct ?? 0,
    source: job.source ?? null,
    output_url: job.output_url ?? null,
    errors: job.errors ?? [],
  })
}
