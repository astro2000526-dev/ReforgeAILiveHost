// POST /api/projects/:id/generate
//
// Lifecycle:
//   1. Load project + joined avatar from Supabase
//   2. Create a `generations` row (status='queued') with a fresh UUID
//   3. Flip project.status to 'generating'
//   4. POST to FastAPI /generate with the generation_id so the Storage upload
//      can namespace its object key per-run
//
// The client polls /generation-status to advance the lifecycle.

import { NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'

import { DEMO_USER_ID } from '@/lib/demo-user'
import { pipelineFetch } from '@/lib/pipeline-client'
import { supabaseAdmin } from '@/lib/supabase-server'

type Segment = { type: string; text: string; duration_sec?: number }

type Row = {
  id: string
  voice: string | null
  speech_rate: string | null
  script_segments: Segment[] | null
  avatar: { template_video_url: string | null } | { template_video_url: string | null }[] | null
}

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const { data, error } = await supabaseAdmin
    .from('projects')
    .select(
      `
        id, voice, speech_rate, script_segments,
        avatar:avatars (template_video_url)
      `
    )
    .eq('id', id)
    .eq('user_id', DEMO_USER_ID)
    .maybeSingle<Row>()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'project not found' }, { status: 404 })

  const avatar = Array.isArray(data.avatar) ? data.avatar[0] : data.avatar
  if (!avatar?.template_video_url) {
    return NextResponse.json({ error: '数字人没有模板视频 URL' }, { status: 400 })
  }
  const segments = data.script_segments ?? []
  if (segments.length === 0) {
    return NextResponse.json({ error: '脚本为空，无法生成' }, { status: 400 })
  }

  const generationId = randomUUID()

  // Create the generations row first so the client (and any later poll) can
  // resolve the generation_id from project_id alone.
  const { error: genErr } = await supabaseAdmin.from('generations').insert({
    id: generationId,
    project_id: id,
    status: 'queued',
    progress: 0,
    started_at: new Date().toISOString(),
  })
  if (genErr) {
    return NextResponse.json({ error: genErr.message }, { status: 500 })
  }

  const { error: updateError } = await supabaseAdmin
    .from('projects')
    .update({ status: 'generating' })
    .eq('id', id)
  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 })
  }

  const result = await pipelineFetch('/generate', {
    method: 'POST',
    body: JSON.stringify({
      project_id: id,
      generation_id: generationId,
      avatar_template_url: avatar.template_video_url,
      script_segments: segments,
      voice: data.voice ?? 'BV001_streaming',
      rate: data.speech_rate ?? '+0%',
    }),
  })

  if (!result.ok) {
    // Roll back so the user can retry once the pipeline is reachable.
    await supabaseAdmin
      .from('generations')
      .update({
        status: 'failed',
        error_message: result.error.message,
        finished_at: new Date().toISOString(),
      })
      .eq('id', generationId)
    await supabaseAdmin.from('projects').update({ status: 'draft' }).eq('id', id)
    const status = result.error.kind === 'unconfigured' ? 503 : 502
    return NextResponse.json({ error: result.error.message }, { status })
  }

  return NextResponse.json({
    status: 'queued',
    generation_id: generationId,
    pipeline: result.data,
  })
}
