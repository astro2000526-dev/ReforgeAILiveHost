// POST /api/ai-reply — generate a live-host reply to a viewer comment via Qwen.
// Body: { comment, product?, language?, preset_id? }
// preset_id loads a reply_presets row whose instruction/data/QA shape the
// prompt; a missing/inactive preset falls back to the default persona.

import { NextResponse } from 'next/server'
import { pipelineFetch } from '@/lib/pipeline-client'
import { buildReplyPrompt } from '@/lib/reply-presets'
import { supabaseAdmin } from '@/lib/supabase-server'
import type { ReplyPreset } from '@/lib/types'

type Body = { comment?: string; product?: string; language?: string; preset_id?: string }

export async function POST(request: Request) {
  let body: Body = {}
  try { body = (await request.json()) as Body } catch { /* ok */ }
  const comment = (body.comment ?? '').trim()
  if (!comment) return NextResponse.json({ error: 'comment is required' }, { status: 400 })

  let preset: Pick<ReplyPreset, 'instruction' | 'data' | 'qa'> | null = null
  if (body.preset_id?.trim()) {
    const { data } = await supabaseAdmin
      .from('reply_presets')
      .select('instruction, data, qa')
      .eq('id', body.preset_id.trim())
      .eq('is_active', true)
      .maybeSingle<Pick<ReplyPreset, 'instruction' | 'data' | 'qa'>>()
    preset = data ?? null // not found → default persona
  }

  const langWord = (body.language ?? 'th').startsWith('en') ? 'English'
    : (body.language ?? 'th').startsWith('zh') ? '中文' : 'ภาษาไทย'
  const prompt = buildReplyPrompt({ comment, langWord, product: body.product, preset })

  const ai = await pipelineFetch('/llm', {
    method: 'POST',
    body: JSON.stringify({ prompt, max_tokens: 160 }),
  })
  if (!ai.ok) {
    const status = ai.error.kind === 'unconfigured' ? 503 : 502
    return NextResponse.json({ error: ai.error.message }, { status })
  }
  const d = ai.data as { text?: string }
  return NextResponse.json({ reply: (d.text ?? '').trim() })
}
