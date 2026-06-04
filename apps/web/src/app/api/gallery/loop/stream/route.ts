// GET /api/gallery/loop/stream — SSE live feed of the shared loop state.
// Every open gallery page subscribes here, so a start/stop by any user is
// pushed to all of them instantly (1s tick, events sent only on change).

import { getLoopState } from '@/lib/gallery-loop'
import { sseResponse, sseSleep } from '@/lib/sse'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  return sseResponse(request.signal, async (send, signal) => {
    let last = ''
    while (!signal.aborted) {
      const state = getLoopState()
      const json = JSON.stringify(state)
      if (json !== last) {
        last = json
        send(state)
      }
      if (!(await sseSleep(1000, signal))) return
    }
  })
}
