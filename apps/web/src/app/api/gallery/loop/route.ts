// /api/gallery/loop — control + inspect the server-side auto news-clip loop.
//   GET  → current LoopState (one-shot; live stream at ./stream)
//   POST → { action: 'start', avatar_id, language?, product?, topic?, duration_seconds? }
//        | { action: 'stop' }
// The loop runs in the web container's Node process — closing the browser
// does NOT stop it; every client sees the same shared state.

import { NextResponse } from 'next/server'

import { getLoopState, startLoop, stopLoop, type LoopSettings } from '@/lib/gallery-loop'

export const dynamic = 'force-dynamic'

export async function GET() {
  return NextResponse.json({ state: getLoopState() })
}

type Body = Partial<LoopSettings> & { action?: 'start' | 'stop' }

export async function POST(request: Request) {
  let body: Body = {}
  try { body = (await request.json()) as Body } catch { /* validated below */ }

  if (body.action === 'stop') {
    return NextResponse.json({ state: stopLoop() })
  }
  if (body.action === 'start') {
    if (!body.avatar_id) {
      return NextResponse.json({ error: 'avatar_id is required' }, { status: 400 })
    }
    const settings: LoopSettings = {
      avatar_id: body.avatar_id,
      language: ['th', 'zh', 'en'].includes(body.language ?? '') ? (body.language as string) : 'th',
      product: body.product?.trim() || undefined,
      topic: body.topic?.trim() || undefined,
      duration_seconds: Math.max(10, Math.min(Number(body.duration_seconds) || 45, 300)),
    }
    return NextResponse.json({ state: startLoop(settings) })
  }
  return NextResponse.json({ error: "action must be 'start' or 'stop'" }, { status: 400 })
}
