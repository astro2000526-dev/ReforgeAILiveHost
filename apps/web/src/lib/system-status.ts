// Shared by /api/system/status (one-shot GET) and its /stream (SSE) variant.
// Aggregates pipeline resources/tasks + Supabase task rows for the /status page.
// Pipeline being down is a normal state here — surface it, don't 502.

import { DEMO_USER_ID } from '@/lib/demo-user'
import { pipelineFetch } from '@/lib/pipeline-client'
import { supabaseAdmin } from '@/lib/supabase-server'

export async function getSystemStatus(): Promise<Record<string, unknown>> {
  // Each DB query is guarded the same way the pipeline call is: a network-layer
  // reject degrades to { data: null } instead of rejecting the whole Promise.all
  // and 500-ing the GET route (DB-down should degrade, not error — symmetric with
  // the "pipeline down is normal" contract above). The inline two-arg .then keeps
  // each query's row typing intact.
  const [pipeline, projects, generations, streams] = await Promise.all([
    pipelineFetch('/system/status').catch((e: unknown) => ({
      ok: false as const,
      error: { kind: 'http' as const, status: 0, message: e instanceof Error ? e.message : 'pipeline unreachable' },
    })),
    supabaseAdmin
      .from('projects')
      .select('id, name, status')
      .eq('user_id', DEMO_USER_ID)
      .then((r) => r, () => ({ data: null })),
    supabaseAdmin
      .from('generations')
      .select('id, project_id, status, progress, error_message, created_at, finished_at')
      .order('created_at', { ascending: false })
      .limit(20)
      .then((r) => r, () => ({ data: null })),
    supabaseAdmin
      .from('streams')
      .select('id, project_id, status, started_at, duration_seconds, created_at')
      .order('created_at', { ascending: false })
      .limit(20)
      .then((r) => r, () => ({ data: null })),
  ])

  const projectName = new Map((projects.data ?? []).map((p) => [p.id, p.name]))
  const byStatus: Record<string, number> = {}
  for (const p of projects.data ?? []) byStatus[p.status] = (byStatus[p.status] ?? 0) + 1

  return {
    pipeline: pipeline.ok ? pipeline.data : null,
    pipelineError: pipeline.ok ? null : pipeline.error.message,
    projects: { total: projects.data?.length ?? 0, byStatus },
    generations: (generations.data ?? []).map((g) => ({
      ...g,
      project_name: projectName.get(g.project_id) ?? null,
    })),
    streams: (streams.data ?? []).map((s) => ({
      ...s,
      project_name: projectName.get(s.project_id) ?? null,
    })),
    fetchedAt: new Date().toISOString(),
  }
}
