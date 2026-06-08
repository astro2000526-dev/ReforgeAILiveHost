// POST /api/live/speak  { text }
// Makes the live presenter "speak" a line in the running stream — used to voice
// an AI reply to a viewer comment. Feeds the text into the active pipeline
// session via the live-loop singleton. 409 when no live session is running.

import { NextResponse } from 'next/server'

import { speakText } from '@/lib/live-loop'

export const dynamic = 'force-dynamic'

type Body = { text?: string }

export async function POST(request: Request) {
  let body: Body = {}
  try { body = (await request.json()) as Body } catch { /* validated below */ }
  const text = (body.text ?? '').trim()
  if (!text) return NextResponse.json({ error: 'text is required' }, { status: 400 })

  try {
    const ok = await speakText(text)
    if (!ok) return NextResponse.json({ error: 'no live session running' }, { status: 409 })
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 })
  }
}
