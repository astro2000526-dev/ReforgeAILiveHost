// PATCH /api/avatars/:id — update avatar fields
// DELETE /api/avatars/:id — soft-delete (set is_active=false)

import { NextResponse } from 'next/server'
import { BG_TYPES, FRAME_POSITIONS, GENDERS, REGIONS } from '@/lib/constants'
import { supabaseAdmin } from '@/lib/supabase-server'
import {
  AVATAR_FULL_COLS, AVATAR_BASE_COLS, AVATAR_EXT_KEYS,
  isMissingColumn, withAvatarDefaults,
} from '@/lib/server/schema-drift'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const run = (cols: string) =>
    supabaseAdmin.from('avatars').select(cols).eq('id', id).maybeSingle()

  // Tolerate a DB behind 0005/0006: fall back to base columns + defaults.
  let { data, error } = await run(AVATAR_FULL_COLS)
  if (error && isMissingColumn(error)) ({ data, error } = await run(AVATAR_BASE_COLS))

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'not found' }, { status: 404 })
  return NextResponse.json({ avatar: withAvatarDefaults(data as unknown as Record<string, unknown>) })
}

type Body = {
  name?: string
  region?: string | null
  gender?: string | null
  description?: string | null
  preview_image_url?: string | null
  template_video_url?: string | null
  display_order?: number
  bg_remove?: boolean
  background_url?: string | null
  background_type?: string | null
  camera_zoom?: number
  frame_position?: string
  frame_scale?: number
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
  if (body.name?.trim())                                          patch.name = body.name.trim()
  if (body.region !== undefined) patch.region = body.region && (REGIONS as readonly string[]).includes(body.region) ? body.region : null
  if (body.gender !== undefined) patch.gender = body.gender && (GENDERS as readonly string[]).includes(body.gender) ? body.gender : null
  if (body.description !== undefined)                             patch.description = body.description ?? null
  if (body.preview_image_url !== undefined)                       patch.preview_image_url = body.preview_image_url ?? null
  if (body.template_video_url !== undefined)                      patch.template_video_url = body.template_video_url ?? ''
  if (typeof body.display_order === 'number')                     patch.display_order = body.display_order
  if (typeof body.bg_remove === 'boolean')                        patch.bg_remove = body.bg_remove
  if (body.background_url !== undefined)                          patch.background_url = body.background_url ?? null
  if (body.background_type !== undefined) patch.background_type = body.background_type && (BG_TYPES as readonly string[]).includes(body.background_type) ? body.background_type : null
  if (typeof body.camera_zoom === 'number')                       patch.camera_zoom = Math.min(3, Math.max(1, body.camera_zoom))
  if (body.frame_position !== undefined && (FRAME_POSITIONS as readonly string[]).includes(body.frame_position)) patch.frame_position = body.frame_position
  if (typeof body.frame_scale === 'number')                       patch.frame_scale = Math.min(1, Math.max(0.2, body.frame_scale))

  if (!Object.keys(patch).length)
    return NextResponse.json({ error: 'nothing to update' }, { status: 400 })

  const runUpdate = (p: Record<string, unknown>, cols: string) =>
    supabaseAdmin.from('avatars').update(p).eq('id', id).select(cols).maybeSingle()

  let { data, error } = await runUpdate(patch, AVATAR_FULL_COLS)
  // DB behind 0005/0006: drop the not-yet-existing columns from the patch and
  // retry with base columns so the editable base fields still save.
  if (error && isMissingColumn(error)) {
    const basePatch: Record<string, unknown> = { ...patch }
    for (const k of AVATAR_EXT_KEYS) delete basePatch[k]
    if (Object.keys(basePatch).length) {
      ;({ data, error } = await runUpdate(basePatch, AVATAR_BASE_COLS))
    } else {
      // Patch touched only not-yet-existing columns → no-op; return current row.
      ;({ data, error } = await supabaseAdmin
        .from('avatars').select(AVATAR_BASE_COLS).eq('id', id).maybeSingle())
    }
  }

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'not found' }, { status: 404 })
  return NextResponse.json({ avatar: withAvatarDefaults(data as unknown as Record<string, unknown>) })
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
