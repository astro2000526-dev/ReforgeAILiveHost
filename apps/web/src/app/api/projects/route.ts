// /api/projects
//   GET  — list projects for the current (demo) user
//   POST — create a new project from the wizard

import { NextResponse } from 'next/server'

import { getCurrentUserId } from '@/lib/current-user'
import { supabaseAdmin } from '@/lib/supabase-server'

export async function GET() {
  const userId = await getCurrentUserId()
  const { data, error } = await supabaseAdmin
    .from('projects')
    .select('id, name, status, language, voice, avatar_id, created_at, updated_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ projects: data ?? [] })
}

type CreateProjectBody = {
  name: string
  avatar_id: string
  product_info: {
    title: string
    price_now?: number
    price_original?: number
    selling_points?: string[]
  }
  script_segments: Array<{
    type: string
    text: string
    duration_sec?: number
  }>
  language: string
  voice: string
  speech_rate?: string
}

export async function POST(request: Request) {
  let body: Partial<CreateProjectBody> = {}
  try { body = (await request.json()) as Partial<CreateProjectBody> } catch {
    return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 })
  }

  if (!body.name || !body.avatar_id || !body.language || !body.voice) {
    return NextResponse.json(
      { error: 'name, avatar_id, language and voice are required' },
      { status: 400 }
    )
  }

  const userId = await getCurrentUserId()
  const { data, error } = await supabaseAdmin
    .from('projects')
    .insert({
      user_id: userId,
      name: body.name,
      avatar_id: body.avatar_id,
      product_info: body.product_info ?? {},
      script_segments: body.script_segments ?? [],
      language: body.language,
      voice: body.voice,
      speech_rate: body.speech_rate ?? '+0%',
      status: 'draft',
    })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ project: data }, { status: 201 })
}
