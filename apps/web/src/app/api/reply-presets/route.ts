// /api/reply-presets
//   GET  — list active reply presets (presets page + live console dropdown)
//   POST — create a new preset (presets page)

import { NextResponse } from 'next/server'

import { sanitizeQA } from '@/lib/reply-presets'
import { isMissingRelation } from '@/lib/server/schema-drift'
import { supabaseAdmin } from '@/lib/supabase-server'
import type { QAPair } from '@/lib/types'

const SELECT = 'id, name, instruction, data, qa, is_active, created_at, updated_at'

export async function GET() {
  const { data, error } = await supabaseAdmin
    .from('reply_presets')
    .select(SELECT)
    .eq('is_active', true)
    .order('created_at', { ascending: false })

  // DB hasn't run 0007 yet → no presets table: degrade to an empty list so the
  // presets page + live-console dropdown still load instead of 500-ing.
  if (error && isMissingRelation(error)) return NextResponse.json({ presets: [] })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ presets: data ?? [] })
}

type CreateBody = {
  name?: string
  instruction?: string
  data?: string
  qa?: QAPair[]
}

export async function POST(request: Request) {
  let body: CreateBody = {}
  try { body = (await request.json()) as CreateBody } catch {
    return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 })
  }

  if (!body.name?.trim()) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 })
  }

  const { data, error } = await supabaseAdmin
    .from('reply_presets')
    .insert({
      name: body.name.trim(),
      instruction: body.instruction?.trim() ?? '',
      data: body.data?.trim() ?? '',
      qa: sanitizeQA(body.qa),
      is_active: true,
    })
    .select(SELECT)
    .single()

  if (error && isMissingRelation(error))
    return NextResponse.json({ error: 'preset storage not provisioned — apply DB migration 0007_reply_presets' }, { status: 503 })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ preset: data })
}
