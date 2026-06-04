// GET /api/projects/:id/render-status/stream — SSE feed of render progress.
// One long-lived connection replaces 2.5s client polling. Emits only when the
// job state changes; closes itself on a terminal state.

import { getRenderStatus } from '@/lib/render-status'
import { sseResponse, sseSleep } from '@/lib/sse'

export const dynamic = 'force-dynamic'

const SAMPLE_MS = 2000
const MAX_MS = 2 * 60 * 60 * 1000 // hard cap: 2h (30-min clips render long)

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  return sseResponse(request.signal, async (send, signal) => {
    const deadline = Date.now() + MAX_MS
    let last = ''
    while (!signal.aborted && Date.now() < deadline) {
      const res = await getRenderStatus(id)
      if (res.ok) {
        const payload = JSON.stringify(res.data)
        if (payload !== last) { last = payload; send(res.data) }
        if (['done', 'failed', 'cancelled'].includes(res.data.status)) return
      } else {
        send({ status: 'error', pct: 0, source: null, output_url: null, errors: [res.message] })
        // pipeline unreachable — keep sampling; it may come back
      }
      if (!(await sseSleep(SAMPLE_MS, signal))) return
    }
  })
}
