// /api/avatars
//   GET  — list active avatars (wizard step 1 + management page)
//   POST — create a new avatar (management page)

import { NextResponse } from 'next/server'

import { supabaseAdmin } from '@/lib/supabase-server'

export async function GET() {
  const { data, error } = await supabaseAdmin
    .from('avatars')
    .select('id, name, preview_image_url, template_video_url, region, gender, display_order, description, is_active')
    .eq('is_active', true)
    .order('display_order', { ascending: true })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ avatars: data ?? [] })
}

type CreateAvatarBody = {
  name?: string
  preview_image_url?: string | null
  template_video_url?: string | null
  region?: string | null
  gender?: string | null
  description?: string | null
  display_order?: number
}

const REGIONS = ['TH', 'ID', 'VN', 'MY', 'CN', 'EN']
const GENDERS = ['female', 'male', 'other']

export async function POST(request: Request) {
  let body: CreateAvatarBody = {}
  try {
    body = (await request.json()) as CreateAvatarBody
  } catch {
    return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 })
  }

  if (!body.name?.trim()) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 })
  }

  const region = body.region && REGIONS.includes(body.region) ? body.region : null
  const gender = body.gender && GENDERS.includes(body.gender) ? body.gender : null

  const { data, error } = await supabaseAdmin
    .from('avatars')
    .insert({
      name: body.name.trim(),
      // template_video_url is NOT NULL in the schema; default to '' when the
      // user hasn't uploaded a video yet (render falls back to a test pattern).
      template_video_url: body.template_video_url ?? '',
      preview_image_url: body.preview_image_url ?? null,
      region,
      gender,
      description: body.description ?? null,
      display_order: body.display_order ?? 100,
      is_active: true,
    })
    .select('id, name, preview_image_url, template_video_url, region, gender, description')
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ avatar: data })
}
