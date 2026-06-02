// GET /api/live/comments?after=<ISO>&video_id=<optional override>
// Polls a Facebook live video's comments. Page token is read server-side from
// system_config and never sent to the browser. `video_id` may be overridden via
// query (it is not secret) for quick testing; the token always comes from config.

import { NextResponse } from 'next/server'
import { fetchLiveComments } from '@/lib/facebook'
import { getSystemConfig } from '@/lib/system-config-server'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const url = new URL(request.url)
  const after = url.searchParams.get('after') ?? undefined
  const videoOverride = url.searchParams.get('video_id')?.trim()

  const cfg = await getSystemConfig()
  const token = cfg.fb_page_token?.trim()
  const videoId = (videoOverride || cfg.fb_live_video_id || '').trim()

  if (!token) return NextResponse.json({ error: 'set fb_page_token in Settings' }, { status: 503 })
  if (!videoId) return NextResponse.json({ error: 'set fb_live_video_id in Settings (or pass ?video_id=)' }, { status: 400 })

  const res = await fetchLiveComments(videoId, token, after)
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.status })

  return NextResponse.json({ comments: res.data })
}
