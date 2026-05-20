// POST /api/streams/start
//
// Body: { project_id, rtmp_url, stream_key }
// - Creates a `streams` row (status=live)
// - Forwards to FastAPI /stream/start with the project's generated video URL
//
// MVP gap: we don't yet have a Supabase Storage upload step that populates
// projects.output_video_url. Until that exists we look for a local pipeline
// output path in `generations` (newest row); the FastAPI side already accepts
// a local path for dev.

import { NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'

import { DEMO_USER_ID } from '@/lib/demo-user'
import { pipelineFetch } from '@/lib/pipeline-client'
import { supabaseAdmin } from '@/lib/supabase-server'

type Body = { project_id?: string; rtmp_url?: string; stream_key?: string }

export async function POST(request: Request) {
  let body: Body
  try {
    body = (await request.json()) as Body
  } catch {
    return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 })
  }
  if (!body.project_id || !body.rtmp_url || !body.stream_key) {
    return NextResponse.json(
      { error: 'project_id, rtmp_url and stream_key are required' },
      { status: 400 }
    )
  }

  // Confirm the project belongs to the demo user and is ready.
  const { data: project, error: projectErr } = await supabaseAdmin
    .from('projects')
    .select('id, status')
    .eq('id', body.project_id)
    .eq('user_id', DEMO_USER_ID)
    .maybeSingle()

  if (projectErr) return NextResponse.json({ error: projectErr.message }, { status: 500 })
  if (!project) return NextResponse.json({ error: 'project not found' }, { status: 404 })
  if (project.status !== 'ready') {
    return NextResponse.json({ error: '项目还没生成完成，无法推流' }, { status: 409 })
  }

  // Resolve a video URL/path. Prefer the latest successful generation's
  // output_video_url; fall back to the convention used by the local FastAPI
  // pipeline (services/pipeline/output/<project_id>.mp4).
  const { data: gen } = await supabaseAdmin
    .from('generations')
    .select('output_video_url')
    .eq('project_id', body.project_id)
    .eq('status', 'done')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const videoUrl =
    gen?.output_video_url ?? `services/pipeline/output/${body.project_id}.mp4`

  const streamId = randomUUID()

  const { error: streamErr } = await supabaseAdmin.from('streams').insert({
    id: streamId,
    project_id: body.project_id,
    rtmp_url: body.rtmp_url,
    stream_key: body.stream_key,
    status: 'live',
    started_at: new Date().toISOString(),
  })
  if (streamErr) {
    return NextResponse.json({ error: streamErr.message }, { status: 500 })
  }

  const result = await pipelineFetch('/stream/start', {
    method: 'POST',
    body: JSON.stringify({
      stream_id: streamId,
      video_url: videoUrl,
      rtmp_url: body.rtmp_url,
      stream_key: body.stream_key,
    }),
  })

  if (!result.ok) {
    await supabaseAdmin
      .from('streams')
      .update({
        status: 'error',
        error_message: result.error.message,
        stopped_at: new Date().toISOString(),
      })
      .eq('id', streamId)
    const status = result.error.kind === 'unconfigured' ? 503 : 502
    return NextResponse.json({ error: result.error.message }, { status })
  }

  return NextResponse.json({ stream_id: streamId, status: 'live' })
}
