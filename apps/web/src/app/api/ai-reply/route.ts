// POST /api/ai-reply — generate a live-host reply to a viewer comment via Qwen.
// Body: { comment, product?, language? }

import { NextResponse } from 'next/server'
import { pipelineFetch } from '@/lib/pipeline-client'

type Body = { comment?: string; product?: string; language?: string }

export async function POST(request: Request) {
  let body: Body = {}
  try { body = (await request.json()) as Body } catch { /* ok */ }
  const comment = (body.comment ?? '').trim()
  if (!comment) return NextResponse.json({ error: 'comment is required' }, { status: 400 })

  const langWord = (body.language ?? 'th').startsWith('en') ? 'English'
    : (body.language ?? 'th').startsWith('zh') ? '中文' : 'ภาษาไทย'
  const prompt =
    `คุณเป็นพิธีกรไลฟ์ขายของ ตอบคอมเมนต์ผู้ชมสั้นๆ สุภาพ เป็นกันเอง ${langWord} ` +
    `1-2 ประโยค ชวนซื้อแบบไม่ยัดเยียด` +
    (body.product ? ` (สินค้า: ${body.product})` : '') +
    `. ตอบเฉพาะข้อความ ไม่ต้องมีคำอธิบาย.\n\nคอมเมนต์: "${comment}"\nตอบ:`

  const ai = await pipelineFetch('/llm', {
    method: 'POST',
    body: JSON.stringify({ prompt, max_tokens: 120 }),
  })
  if (!ai.ok) {
    const status = ai.error.kind === 'unconfigured' ? 503 : 502
    return NextResponse.json({ error: ai.error.message }, { status })
  }
  const d = ai.data as { text?: string }
  return NextResponse.json({ reply: (d.text ?? '').trim() })
}
