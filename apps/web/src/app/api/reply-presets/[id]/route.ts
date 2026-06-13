// GET    /api/reply-presets/:id — fetch one preset
// PATCH  /api/reply-presets/:id — update preset fields
// DELETE /api/reply-presets/:id — soft-delete (set is_active=false)

import { NextResponse } from 'next/server'

import { sanitizeQA } from '@/lib/reply-presets'
import { isMissingRelation } from '@/lib/server/schema-drift'
import { supabaseAdmin } from '@/lib/supabase-server'
import type { QAPair } from '@/lib/types'

const SELECT = 'id, name, instruction, data, qa, is_active, created_at, updated_at'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const { data, error } = await supabaseAdmin
    .from('reply_presets')
    .select(SELECT)
    .eq('id', id)
    .maybeSingle()
  if (error && isMissingRelation(error)) return NextResponse.json({ error: 'not found' }, { status: 404 })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'not found' }, { status: 404 })
  return NextResponse.json({ preset: data })
}

type Body = {
  name?: string
  instruction?: string
  data?: string
  qa?: QAPair[]
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  let body: Body = {}
  try { body = (await request.json()) as Body } catch {
    return NextResponse.json({ error: 'invalid JSON' }, { status: 400 })
  }

  const patch: Record<string, unknown> = {}
  if (body.name?.trim())              patch.name = body.name.trim()
  if (body.instruction !== undefined) patch.instruction = body.instruction?.trim() ?? ''
  if (body.data !== undefined)        patch.data = body.data?.trim() ?? ''
  if (body.qa !== undefined)          patch.qa = sanitizeQA(body.qa)

  if (!Object.keys(patch).length)
    return NextResponse.json({ error: 'nothing to update' }, { status: 400 })
  patch.updated_at = new Date().toISOString()

  const { data, error } = await supabaseAdmin
    .from('reply_presets').update(patch).eq('id', id)
    .select(SELECT)
    .maybeSingle()

  if (error && isMissingRelation(error))
    return NextResponse.json({ error: 'preset storage not provisioned — apply DB migration 0007_reply_presets' }, { status: 503 })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'not found' }, { status: 404 })
  return NextResponse.json({ preset: data })
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const { error } = await supabaseAdmin
    .from('reply_presets').update({ is_active: false }).eq('id', id)
  // No table (0007 not applied) → nothing to delete; treat as success.
  if (error && !isMissingRelation(error)) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
