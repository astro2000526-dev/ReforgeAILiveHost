// PATCH /api/avatars/:id — update avatar fields
// DELETE /api/avatars/:id — soft-delete (set is_active=false)

import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-server'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const { data, error } = await supabaseAdmin
    .from('avatars')
    .select('id,name,preview_image_url,template_video_url,region,gender,description,display_order,is_active')
    .eq('id', id)
    .maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'not found' }, { status: 404 })
  return NextResponse.json({ avatar: data })
}

type Body = {
  name?: string
  region?: string | null
  gender?: string | null
  description?: string | null
  preview_image_url?: string | null
  template_video_url?: string | null
  display_order?: number
}

const REGIONS = ['TH', 'ID', 'VN', 'MY', 'CN', 'EN']
const GENDERS = ['female', 'male', 'other']

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
  if (body.name?.trim())                                          patch.name = body.name.trim()
  if (body.region !== undefined) patch.region = body.region && REGIONS.includes(body.region) ? body.region : null
  if (body.gender !== undefined) patch.gender = body.gender && GENDERS.includes(body.gender) ? body.gender : null
  if (body.description !== undefined)                             patch.description = body.description ?? null
  if (body.preview_image_url !== undefined)                       patch.preview_image_url = body.preview_image_url ?? null
  if (body.template_video_url !== undefined)                      patch.template_video_url = body.template_video_url ?? ''
  if (typeof body.display_order === 'number')                     patch.display_order = body.display_order

  if (!Object.keys(patch).length)
    return NextResponse.json({ error: 'nothing to update' }, { status: 400 })

  const { data, error } = await supabaseAdmin
    .from('avatars').update(patch).eq('id', id)
    .select('id,name,preview_image_url,template_video_url,region,gender,description,display_order,is_active')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ avatar: data })
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const { error } = await supabaseAdmin
    .from('avatars').update({ is_active: false }).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
