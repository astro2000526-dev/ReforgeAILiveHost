// /api/live/loop — control + inspect the server-side 24/7 live-stream loop.
//   GET  → current LiveLoopState (one-shot; live stream at ./stream)
//   POST → { action: 'start', avatar_id, rtmp_url, stream_key, product?, topic?,
//            language?, auto_speak_replies? }
//        | { action: 'stop' }
// The loop runs in the web container's Node process — closing the browser does
// NOT stop it; every client sees the same shared state.

import { NextResponse } from 'next/server'

import {
  getLiveLoopState,
  startLiveLoop,
  stopLiveLoop,
  type LiveLoopSettings,
} from '@/lib/live-loop'

export const dynamic = 'force-dynamic'

export async function GET() {
  return NextResponse.json({ state: getLiveLoopState() })
}

type Body = Partial<LiveLoopSettings> & { action?: 'start' | 'stop' }

export async function POST(request: Request) {
  let body: Body = {}
  try { body = (await request.json()) as Body } catch { /* validated below */ }

  if (body.action === 'stop') {
    return NextResponse.json({ state: stopLiveLoop() })
  }
  if (body.action === 'start') {
    if (!body.avatar_id) {
      return NextResponse.json({ error: 'avatar_id is required' }, { status: 400 })
    }
    if (!body.stream_key?.trim()) {
      return NextResponse.json({ error: 'stream_key is required' }, { status: 400 })
    }
    const settings: LiveLoopSettings = {
      avatar_id: body.avatar_id,
      product: body.product?.trim() || undefined,
      topic: body.topic?.trim() || undefined,
      language: ['th', 'zh', 'en'].includes(body.language ?? '') ? (body.language as string) : 'th',
      rtmp_url: body.rtmp_url?.trim() || '',
      stream_key: body.stream_key.trim(),
      auto_speak_replies: !!body.auto_speak_replies,
    }
    return NextResponse.json({ state: startLiveLoop(settings) })
  }
  return NextResponse.json({ error: "action must be 'start' or 'stop'" }, { status: 400 })
}
