// POST /api/projects/:id/ai-script — generate a script PROPOSAL via local Qwen.
//
// Reads the FULL project context (product info + the existing script + the
// presenter/avatar persona) and asks Qwen to improve/rewrite consistently.
// Does NOT save — returns the proposed segments so the editor can show them and
// the user decides whether to keep + Save.

import { NextResponse } from 'next/server'
import { DEMO_USER_ID } from '@/lib/demo-user'
import { pipelineFetch } from '@/lib/pipeline-client'
import { supabaseAdmin } from '@/lib/supabase-server'

type ProductInfo = { title?: string; price_now?: number; price_original?: number; selling_points?: string[] }
type Segment = { type: string; text: string; duration_sec?: number }
type Avatar = { name?: string | null; description?: string | null }
type Row = {
  id: string
  language: string | null
  product_info: ProductInfo | null
  script_segments: Segment[] | null
  avatars: Avatar | Avatar[] | null
}

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const { data, error } = await supabaseAdmin
    .from('projects')
    .select('id, language, product_info, script_segments, avatars(name, description)')
    .eq('id', id)
    .eq('user_id', DEMO_USER_ID)
    .maybeSingle<Row>()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'not found' }, { status: 404 })

  const p = data.product_info ?? {}
  const av = (Array.isArray(data.avatars) ? data.avatars[0] : data.avatars) ?? {}
  // The script the user already has — Qwen should build on this, not ignore it.
  const existing = (data.script_segments ?? [])
    .map((s) => s.text)
    .filter(Boolean)
    .join('\n')

  const ai = await pipelineFetch('/script', {
    method: 'POST',
    body: JSON.stringify({
      product_title: p.title ?? '',
      selling_points: p.selling_points ?? [],
      price_now: p.price_now ?? null,
      price_original: p.price_original ?? null,
      language: (data.language ?? 'th-TH').slice(0, 2),
      existing_script: existing,            // full current script as context
      avatar_name: av.name ?? '',           // presenter persona
      avatar_desc: av.description ?? '',
    }),
  })
  if (!ai.ok) {
    const status = ai.error.kind === 'unconfigured' ? 503 : 502
    return NextResponse.json({ error: ai.error.message }, { status })
  }
  const d = ai.data as { script_segments?: Segment[] }
  const segments = d.script_segments ?? []
  if (segments.length === 0) return NextResponse.json({ error: 'LLM returned empty script' }, { status: 502 })

  // NO auto-save — return the proposal; the editor shows it and the user Saves.
  return NextResponse.json({ ok: true, script_segments: segments })
}
