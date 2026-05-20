// GET /api/projects/:id — single project with avatar joined.

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
