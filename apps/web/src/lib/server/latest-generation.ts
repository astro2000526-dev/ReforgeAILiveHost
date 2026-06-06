// Shared query: the most-recent `generations` row for a project.
//
// Used by the render-status reader and the generation-status route, which both
// fetch "the current generation" (newest row, any status) to mirror a terminal
// pipeline result back into it. Selects the superset of columns both call sites
// need (`output_video_url` is unused by the render-status path but harmless).
//
// NOTE: streams/start deliberately does NOT use this — it needs the newest row
// *filtered to status='done'*, which is different semantics.

import 'server-only'

import { supabaseAdmin } from '@/lib/supabase-server'

export type LatestGeneration = {
  id: string
  status: string
  output_video_url: string | null
}

export async function latestGeneration(projectId: string): Promise<LatestGeneration | null> {
  const { data } = await supabaseAdmin
    .from('generations')
    .select('id, status, output_video_url')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  return (data as LatestGeneration | null) ?? null
}
