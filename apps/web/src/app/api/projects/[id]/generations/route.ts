// DELETE /api/projects/:id/generations  body: { ids: string[] }
// Removes the given render versions (generations) for this project.
// (Output mp4 files stay on disk — they're harmless and cleaned separately.)

import { NextResponse } from 'next/server'
import { DEMO_USER_ID } from '@/lib/demo-user'
import { supabaseAdmin } from '@/lib/supabase-server'

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  let body: { ids?: string[] } = {}
  try { body = (await request.json()) as { ids?: string[] } } catch { /* ok */ }
  const ids = (body.ids ?? []).filter(Boolean)
  if (ids.length === 0) return NextResponse.json({ error: 'no ids' }, { status: 400 })

  // confirm the project is the demo user's before deleting its generations
  const { data: proj } = await supabaseAdmin
    .from('projects').select('id').eq('id', id).eq('user_id', DEMO_USER_ID).maybeSingle()
  if (!proj) return NextResponse.json({ error: 'not found' }, { status: 404 })

  const { error } = await supabaseAdmin
    .from('generations').delete().eq('project_id', id).in('id', ids)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, deleted: ids.length })
}
