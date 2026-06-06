// GET /api/live/loop/stream — SSE live feed of the shared live-loop state.
// Every open Live Console subscribes here so a start/stop or buffer change by
// the loop is pushed to all clients instantly (1s tick, sent only on change).

import { getLiveLoopState } from '@/lib/live-loop'
import { sseResponse, sseSleep } from '@/lib/sse'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  return sseResponse(request.signal, async (send, signal) => {
    let last = ''
    while (!signal.aborted) {
      const state = getLiveLoopState()
      const json = JSON.stringify(state)
      if (json !== last) {
        last = json
        send(state)
      }
      if (!(await sseSleep(1000, signal))) return
    }
  })
}
