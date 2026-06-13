// GET /api/system/status/stream — SSE feed for the /status page.
// One long-lived connection replaces 5s client polling: the server samples
// the snapshot every 5s and pushes it down the stream.

import { getSystemStatus } from '@/lib/system-status'
import { sseResponse, sseSleep } from '@/lib/sse'

export const dynamic = 'force-dynamic'

const SAMPLE_MS = 5000
const MAX_MS = 2 * 60 * 60 * 1000   // cap the connection at 2h (mirror render-status/stream)

export async function GET(request: Request) {
  return sseResponse(request.signal, async (send, signal) => {
    const deadline = Date.now() + MAX_MS
    while (!signal.aborted && Date.now() < deadline) {
      send(await getSystemStatus())
      if (!(await sseSleep(SAMPLE_MS, signal))) return
    }
  })
}
