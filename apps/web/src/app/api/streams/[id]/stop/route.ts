// POST /api/streams/:id/stop
//
// Tells FastAPI to kill the ffmpeg push process and marks the stream stopped
// in Supabase. Safe to call even if the pipeline service is no longer the
// same instance — we still mark the DB row stopped so the UI clears up.

import { NextResponse } from 'next/server'

import { pipelineFetch } from '@/lib/pipeline-client'
import { supabaseAdmin } from '@/lib/supabase-server'

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const result = await pipelineFetch(
    `/stream/stop?stream_id=${encodeURIComponent(id)}`,
    { method: 'POST' }
  )

  // We always try to update the DB row, even if the pipeline call failed
  // (e.g. process was already dead) — the user wants the UI to reflect
  // "stopped". Errors from the pipeline are surfaced separately.
  await supabaseAdmin
    .from('streams')
    .update({ status: 'stopped', stopped_at: new Date().toISOString() })
    .eq('id', id)

  if (!result.ok) {
    const status = result.error.kind === 'unconfigured' ? 503 : 502
    return NextResponse.json({ error: result.error.message }, { status })
  }

  return NextResponse.json({ stream_id: id, status: 'stopped' })
}
