// GET /api/system/status/stream — SSE feed for the /status page.
// One long-lived connection replaces 5s client polling: the server samples
// the snapshot every 5s and pushes it down the stream.

import { getSystemStatus } from '@/lib/system-status'
import { sseResponse, sseSleep } from '@/lib/sse'

export const dynamic = 'force-dynamic'

const SAMPLE_MS = 5000

export async function GET(request: Request) {
  return sseResponse(request.signal, async (send, signal) => {
    while (!signal.aborted) {
      send(await getSystemStatus())
      if (!(await sseSleep(SAMPLE_MS, signal))) return
    }
  })
}
