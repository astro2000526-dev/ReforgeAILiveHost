// GET /api/live/comments/stream?video_id=<optional override> — SSE feed of
// fresh Facebook Live comments. One long-lived connection replaces 4s client
// polling; the server polls FB Graph and pushes only NEW comments. Page token
// stays server-side (system_config), exactly like the one-shot route.

import { fetchLiveComments } from '@/lib/facebook'
import { getSystemConfig } from '@/lib/system-config-server'
import { sseResponse, sseSleep } from '@/lib/sse'

export const dynamic = 'force-dynamic'

const SAMPLE_MS = 4000

export async function GET(request: Request) {
  const url = new URL(request.url)
  const videoOverride = url.searchParams.get('video_id')?.trim()

  return sseResponse(request.signal, async (send, signal) => {
    const cfg = await getSystemConfig()
    const token = cfg.fb_page_token?.trim()
    const videoId = (videoOverride || cfg.fb_live_video_id || '').trim()

    if (!token) { send({ error: 'set fb_page_token in Settings' }); return }
    if (!videoId) { send({ error: 'set fb_live_video_id in Settings (or pass ?video_id=)' }); return }

    const seen = new Set<string>()
    let after: string | undefined

    while (!signal.aborted) {
      const res = await fetchLiveComments(videoId, token, after)
      if (res.ok) {
        const fresh = res.data.filter((c) => !seen.has(c.id))
        if (fresh.length) {
          fresh.forEach((c) => seen.add(c.id))
          after = fresh[fresh.length - 1].created_time
          send({ comments: fresh })
        }
      } else {
        send({ error: res.error })
      }
      if (!(await sseSleep(SAMPLE_MS, signal))) return
    }
  })
}
