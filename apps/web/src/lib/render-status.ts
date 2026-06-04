// Shared by /api/projects/[id]/render-status (one-shot GET) and its /stream
// (SSE) variant: ask the pipeline for the async render job's state and, on a
// terminal state, mirror the result into the generations + projects rows.

import { DEMO_USER_ID } from '@/lib/demo-user'
import { pipelineFetch } from '@/lib/pipeline-client'
import { supabaseAdmin } from '@/lib/supabase-server'

export type RenderStatus = {
  status: string
  pct: number
  source: string | null
  output_url: string | null
  errors: string[]
}

export async function getRenderStatus(
  id: string,
): Promise<{ ok: true; data: RenderStatus } | { ok: false; status: number; message: string }> {
  const result = await pipelineFetch(`/render/status/${encodeURIComponent(id)}`)
  if (!result.ok) {
    const status = result.error.kind === 'unconfigured' ? 503 : 502
    return { ok: false, status, message: result.error.message }
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

  return {
    ok: true,
    data: {
      status: job.status ?? 'unknown',
      pct: job.pct ?? 0,
      source: job.source ?? null,
      output_url: job.output_url ?? null,
      errors: job.errors ?? [],
    },
  }
}
