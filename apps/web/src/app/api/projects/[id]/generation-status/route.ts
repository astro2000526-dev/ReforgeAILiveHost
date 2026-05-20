// GET /api/projects/:id/generation-status
//
// Polled by the project detail page every 3s while status='generating'.
// Proxies the FastAPI /generate/:id endpoint and, on terminal state, writes
// the result back into Supabase:
//   - generations row: status, progress, output_video_url, error_message, finished_at
//   - projects row:    status ('ready' or 'failed')
//
// Idempotency: only updates rows that are still in a non-terminal state, so
// repeated polls after completion don't churn the DB.

import { NextResponse } from 'next/server'

import { DEMO_USER_ID } from '@/lib/demo-user'
import { pipelineFetch } from '@/lib/pipeline-client'
import { supabaseAdmin } from '@/lib/supabase-server'

type PipelineStatus = {
  project_id: string
  status: string
  stage?: string
  progress?: number
  output_path?: string | null
  output_url?: string | null
  message?: string | null
}

async function findCurrentGeneration(projectId: string) {
  const { data } = await supabaseAdmin
    .from('generations')
    .select('id, status, output_video_url')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  return data
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const result = await pipelineFetch(`/generate/${encodeURIComponent(id)}`)
  if (!result.ok) {
    const status = result.error.kind === 'unconfigured' ? 503 : 502
    return NextResponse.json({ error: result.error.message }, { status })
  }

  const body = result.data as PipelineStatus
  const gen = await findCurrentGeneration(id)
  const isTerminal = body.status === 'done' || body.status === 'failed'

  if (gen && !['done', 'failed'].includes(gen.status)) {
    if (isTerminal) {
      await supabaseAdmin
        .from('generations')
        .update({
          status: body.status === 'done' ? 'done' : 'failed',
          progress: body.progress ?? (body.status === 'done' ? 100 : null),
          output_video_url: body.output_url ?? null,
          error_message: body.status === 'failed' ? body.message ?? null : null,
          finished_at: new Date().toISOString(),
        })
        .eq('id', gen.id)
      await supabaseAdmin
        .from('projects')
        .update({ status: body.status === 'done' ? 'ready' : 'failed' })
        .eq('id', id)
        .eq('user_id', DEMO_USER_ID)
    } else if (typeof body.progress === 'number') {
      // Best-effort progress mirror — failures here don't matter.
      await supabaseAdmin
        .from('generations')
        .update({ progress: body.progress })
        .eq('id', gen.id)
    }
  }

  return NextResponse.json(body)
}
