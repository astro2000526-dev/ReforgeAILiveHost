// Server-Sent Events helper for Next.js route handlers.
//
// Why SSE and not raw WebSocket: `next start` route handlers cannot perform a
// WS upgrade. SSE gives the same one-way push (server → browser) over plain
// HTTP, reconnects automatically via the browser's EventSource, and passes
// through nginx untouched (X-Accel-Buffering: no disables proxy buffering).

export const SSE_HEADERS = {
  'Content-Type': 'text/event-stream; charset=utf-8',
  'Cache-Control': 'no-cache, no-transform',
  Connection: 'keep-alive',
  'X-Accel-Buffering': 'no',
} as const

/** Sleep that resolves early (false) when the signal aborts. */
export function sseSleep(ms: number, signal: AbortSignal): Promise<boolean> {
  return new Promise((res) => {
    if (signal.aborted) return res(false)
    const id = setTimeout(() => { cleanup(); res(true) }, ms)
    const onAbort = () => { cleanup(); res(false) }
    const cleanup = () => { clearTimeout(id); signal.removeEventListener('abort', onAbort) }
    signal.addEventListener('abort', onAbort, { once: true })
  })
}

/**
 * Build an SSE Response. `run` receives a `send` that emits one `data:` event
 * and must exit when `signal` aborts (client disconnected). A comment
 * heartbeat goes out every 20s so nginx's proxy_read_timeout never trips.
 */
export function sseResponse(
  signal: AbortSignal,
  run: (send: (data: unknown) => void, signal: AbortSignal) => Promise<void>,
): Response {
  const enc = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let open = true
      const safeEnqueue = (chunk: Uint8Array) => {
        if (!open) return
        try { controller.enqueue(chunk) } catch { open = false }
      }
      const send = (data: unknown) => safeEnqueue(enc.encode(`data: ${JSON.stringify(data)}\n\n`))
      const hb = setInterval(() => safeEnqueue(enc.encode(':hb\n\n')), 20_000)
      try {
        await run(send, signal)
      } catch {
        // stream errors just end the connection; EventSource will reconnect
      } finally {
        clearInterval(hb)
        open = false
        try { controller.close() } catch { /* already closed */ }
      }
    },
  })
  return new Response(stream, { headers: SSE_HEADERS })
}
