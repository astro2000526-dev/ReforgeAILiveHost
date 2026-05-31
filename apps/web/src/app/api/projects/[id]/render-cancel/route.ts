// POST /api/projects/:id/render-cancel — cancel an in-flight render.
import { NextResponse } from 'next/server'
import { DEMO_USER_ID } from '@/lib/demo-user'
import { pipelineFetch } from '@/lib/pipeline-client'
import { supabaseAdmin } from '@/lib/supabase-server'

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const result = await pipelineFetch(`/render/cancel/${encodeURIComponent(id)}`, { method: 'POST' })
  // free the project state regardless
  await supabaseAdmin.from('projects').update({ status: 'draft' }).eq('id', id).eq('user_id', DEMO_USER_ID)
  if (!result.ok) {
    return NextResponse.json({ ok: true, note: result.error.message })
  }
  return NextResponse.json({ ok: true })
}
