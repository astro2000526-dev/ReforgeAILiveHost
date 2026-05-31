// GET   /api/projects/:id — single project with avatar joined.
// PATCH /api/projects/:id — update editable fields (currently: avatar_id).

import { NextResponse } from 'next/server'

import { DEMO_USER_ID } from '@/lib/demo-user'
import { supabaseAdmin } from '@/lib/supabase-server'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const { data, error } = await supabaseAdmin
    .from('projects')
    .select(
      `
        id, name, status, language, voice, speech_rate,
        avatar_id, product_info, script_segments,
        created_at, updated_at,
        avatar:avatars (id, name, preview_image_url, region, gender)
      `
    )
    .eq('id', id)
    .eq('user_id', DEMO_USER_ID)
    .maybeSingle()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  if (!data) {
    return NextResponse.json({ error: 'not found' }, { status: 404 })
  }
  return NextResponse.json({ project: data })
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  type Seg = { type: string; text: string; duration_sec?: number }
  let body: { avatar_id?: string; name?: string; script_segments?: Seg[] } = {}
  try {
    body = (await request.json()) as { avatar_id?: string; name?: string; script_segments?: Seg[] }
  } catch {
    return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 })
  }

  const patch: Record<string, unknown> = {}
  if (typeof body.avatar_id === 'string' && body.avatar_id) patch.avatar_id = body.avatar_id
  if (typeof body.name === 'string' && body.name.trim()) patch.name = body.name.trim()
  if (Array.isArray(body.script_segments)) patch.script_segments = body.script_segments
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'nothing to update' }, { status: 400 })
  }

  const { data, error } = await supabaseAdmin
    .from('projects')
    .update(patch)
    .eq('id', id)
    .eq('user_id', DEMO_USER_ID)
    .select('id, avatar_id, name')
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'not found' }, { status: 404 })
  return NextResponse.json({ project: data })
}
