// POST /api/projects/:id/ai-script — regenerate the script via local Qwen,
// using the project's product info, and save it back to the project.

import { NextResponse } from 'next/server'
import { DEMO_USER_ID } from '@/lib/demo-user'
import { pipelineFetch } from '@/lib/pipeline-client'
import { supabaseAdmin } from '@/lib/supabase-server'

type ProductInfo = { title?: string; price_now?: number; price_original?: number; selling_points?: string[] }
type Row = { id: string; language: string | null; product_info: ProductInfo | null }

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const { data, error } = await supabaseAdmin
    .from('projects')
    .select('id, language, product_info')
    .eq('id', id)
    .eq('user_id', DEMO_USER_ID)
    .maybeSingle<Row>()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'not found' }, { status: 404 })

  const p = data.product_info ?? {}
  const ai = await pipelineFetch('/script', {
    method: 'POST',
    body: JSON.stringify({
      product_title: p.title ?? '',
      selling_points: p.selling_points ?? [],
      price_now: p.price_now ?? null,
      price_original: p.price_original ?? null,
      language: (data.language ?? 'th-TH').slice(0, 2),
    }),
  })
  if (!ai.ok) {
    const status = ai.error.kind === 'unconfigured' ? 503 : 502
    return NextResponse.json({ error: ai.error.message }, { status })
  }
  const d = ai.data as { script_segments?: { type: string; text: string; duration_sec?: number }[] }
  const segments = d.script_segments ?? []
  if (segments.length === 0) return NextResponse.json({ error: 'LLM returned empty script' }, { status: 502 })

  await supabaseAdmin.from('projects').update({ script_segments: segments }).eq('id', id).eq('user_id', DEMO_USER_ID)
  return NextResponse.json({ ok: true, script_segments: segments })
}
