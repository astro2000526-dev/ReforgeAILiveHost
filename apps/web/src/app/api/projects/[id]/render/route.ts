// POST /api/projects/:id/render
//
// Lightweight, stream-only render path (no TTS / no MuseTalk):
//   1. Load project + avatar template URL
//   2. Create a `generations` row
//   3. Ask the pipeline /render to build an N-second clip (loops the real
//      template if reachable, else a test pattern) and return any warnings
//   4. Mark the generation done + flip the project to 'ready'
//
// Body: { duration_seconds?: number }
// Returns: { ok, output_url, source, errors }  — `errors` are non-fatal
// warnings (e.g. a 404 template) the UI surfaces so the user can decide.

import { NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'

import { DEMO_USER_ID } from '@/lib/demo-user'
import { pipelineFetch } from '@/lib/pipeline-client'
import { supabaseAdmin } from '@/lib/supabase-server'
import { SYSTEM_CONFIG_DEFAULTS, type SystemConfig } from '@/lib/system-config'

type AvatarJoin = {
  template_video_url: string | null
  preview_image_url: string | null
}
type Segment = { type: string; text: string }
type Row = {
  id: string
  name: string
  voice: string | null
  speech_rate: string | null
  script_segments: Segment[] | null
  avatar: AvatarJoin | AvatarJoin[] | null
}

const GW = 'http://127.0.0.1:8088/rest/v1'
const SVC_KEY = process.env.SUPABASE_SERVICE_KEY ?? ''

async function loadConfig(): Promise<SystemConfig> {
  try {
    const r = await fetch(`${GW}/system_config?key=eq.system_config_v1&select=value&limit=1`, {
      headers: { Authorization: `Bearer ${SVC_KEY}`, apikey: SVC_KEY },
      cache: 'no-store',
      signal: AbortSignal.timeout(4000),
    })
    if (!r.ok) return SYSTEM_CONFIG_DEFAULTS
    const rows = (await r.json()) as { value: SystemConfig }[]
    return rows[0]?.value ?? SYSTEM_CONFIG_DEFAULTS
  } catch {
    return SYSTEM_CONFIG_DEFAULTS
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  let body: { duration_seconds?: number } = {}
  try {
    body = (await request.json()) as { duration_seconds?: number }
  } catch {
    // empty body ok — defaults below
  }
  const duration = Math.max(1, Math.min(Number(body.duration_seconds) || 30, 3600))

  const { data, error } = await supabaseAdmin
    .from('projects')
    .select(`id, name, voice, speech_rate, script_segments, avatar:avatars (template_video_url, preview_image_url)`)
    .eq('id', id)
    .eq('user_id', DEMO_USER_ID)
    .maybeSingle<Row>()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'project not found' }, { status: 404 })

  const avatar = Array.isArray(data.avatar) ? data.avatar[0] : data.avatar
  const generationId = randomUUID()
  const cfg = await loadConfig()

  // AI mode needs lip-sync enabled + a script + an avatar face source.
  // Prefer the VIDEO (natural head motion); fall back to the still image.
  const scriptText = (data.script_segments ?? []).map((s) => s.text).join(' ').trim()
  const faceSource = avatar?.template_video_url || avatar?.preview_image_url || null
  const useAi =
    cfg.render_mode === 'ai' &&
    cfg.lipsync_enabled &&
    !!scriptText &&
    !!faceSource

  await supabaseAdmin.from('generations').insert({
    id: generationId,
    project_id: id,
    status: 'queued',
    progress: 0,
    started_at: new Date().toISOString(),
    meta: {
      duration_seconds: duration,
      mode: useAi ? 'ai' : 'loop',
      voice: data.voice ?? cfg.tts_voice,
      voice_clone: useAi ? !!cfg.voice_clone : false,
      playback_speed: typeof cfg.playback_speed === 'number' ? cfg.playback_speed : 1.0,
      tts_provider: cfg.tts_provider,
      video_quality: cfg.video_quality ?? '1080p',
      sound_mode: cfg.sound_mode ?? 'normal',
      lip_blend: typeof cfg.lip_blend === 'number' ? cfg.lip_blend : 30,
      script_text: scriptText.slice(0, 2000),
    },
  })

  // Fire the render and return immediately — the pipeline runs it in the
  // background (AI lip-sync on a video can take 1-2 min). The client polls
  // GET /render-status to track progress. Avoids the nginx 504 timeout.
  const result = await pipelineFetch('/render', {
    method: 'POST',
    body: JSON.stringify({
      project_id: id,
      duration_seconds: duration,
      title: data.name,
      template_url: avatar?.template_video_url ?? null,
      mode: useAi ? 'ai' : 'loop',
      script_text: useAi ? scriptText : null,
      avatar_image_url: useAi ? faceSource : null,
      lipsync_url: useAi ? cfg.lipsync_url : null,
      voice: data.voice ?? cfg.tts_voice,
      rate: data.speech_rate ?? '+0%',
      voice_clone: useAi ? !!cfg.voice_clone : false,
      playback_speed: typeof cfg.playback_speed === 'number' ? cfg.playback_speed : 1.0,
      output_name: generationId,   // versioned output — old renders are kept
      video_quality: cfg.video_quality ?? '1080p',
      sound_mode: cfg.sound_mode ?? 'normal',
      lip_blend: typeof cfg.lip_blend === 'number' ? cfg.lip_blend : 30,
    }),
  })

  if (!result.ok) {
    await supabaseAdmin
      .from('generations')
      .update({ status: 'failed', error_message: result.error.message, finished_at: new Date().toISOString() })
      .eq('id', generationId)
    const status = result.error.kind === 'unconfigured' ? 503 : 502
    return NextResponse.json({ error: result.error.message }, { status })
  }

  await supabaseAdmin.from('projects').update({ status: 'generating' }).eq('id', id).eq('user_id', DEMO_USER_ID)
  return NextResponse.json({ ok: true, status: 'queued', mode: useAi ? 'ai' : 'loop', generation_id: generationId })
}
