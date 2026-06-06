// Server-side auto news-clip loop (gallery). Runs inside the web container's
// long-lived Node process so the browser tab can close — state lives in a
// module singleton, the run/stop flag is mirrored to the system_config table
// so a container restart resumes the loop (see src/instrumentation.ts).
//
// The loop body re-uses the existing HTTP routes via self-fetch
// (/api/gallery/run → /api/projects/:id/render → /render-status) — zero
// orchestration logic duplicated from the old client loop.

import 'server-only'

import { gwHeaders, gwUrl } from '@/lib/server/db-gateway'

export type LoopSettings = {
  avatar_id: string
  language: string
  product?: string
  topic?: string
  duration_seconds: number
}

export type LoopPhase = 'idle' | 'news' | 'render' | 'cooldown'

export type LoopState = {
  running: boolean
  phase: LoopPhase
  current_title: string | null
  render_pct: number
  clip_count: number
  last_error: string | null
  started_at: string | null
  settings: LoopSettings | null
}

const STATE_KEY = 'gallery_loop_v1'
// the Next server itself — self-fetch keeps all logic in the existing routes
const SELF = `http://127.0.0.1:${process.env.PORT || 3000}`

const POLL_MS = 3000
const MAX_POLLS = 400            // ≈20 min per clip before declaring it stuck
const ERROR_BACKOFF_MS = 15_000
const NO_NEWS_BACKOFF_MS = 300_000 // all headlines used — wait for fresh news

function initialState(): LoopState {
  return {
    running: false,
    phase: 'idle',
    current_title: null,
    render_pct: 0,
    clip_count: 0,
    last_error: null,
    started_at: null,
    settings: null,
  }
}

// survive HMR in dev + be shared across route modules in prod
type Store = { state: LoopState }
const g = globalThis as unknown as { __galleryLoop?: Store }
function store(): Store {
  if (!g.__galleryLoop) g.__galleryLoop = { state: initialState() }
  return g.__galleryLoop
}

const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms))

// ── persistence (system_config key-value row) ────────────────────────────────

async function persist(running: boolean, settings: LoopSettings | null): Promise<void> {
  try {
    await fetch(gwUrl('/system_config'), {
      method: 'POST',
      headers: {
        ...gwHeaders(),
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates',
      },
      body: JSON.stringify({ key: STATE_KEY, value: { running, settings }, updated_at: new Date().toISOString() }),
      signal: AbortSignal.timeout(4000),
    })
  } catch {
    // persistence is best-effort; the in-memory loop keeps working
  }
}

async function readPersisted(): Promise<{ running?: boolean; settings?: LoopSettings } | null> {
  try {
    const r = await fetch(gwUrl(`/system_config?key=eq.${STATE_KEY}&select=value&limit=1`), {
      headers: gwHeaders(),
      cache: 'no-store',
      signal: AbortSignal.timeout(4000),
    })
    if (!r.ok) return null
    const rows = (await r.json()) as { value?: { running?: boolean; settings?: LoopSettings } }[]
    return rows[0]?.value ?? null
  } catch {
    return null
  }
}

// ── one iteration: news → script → project → render → poll ──────────────────

async function runOnce(s: LoopState, settings: LoopSettings): Promise<void> {
  s.phase = 'news'
  s.current_title = null
  s.render_pct = 0

  const runRes = await fetch(`${SELF}/api/gallery/run`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(settings),
    signal: AbortSignal.timeout(120_000), // news + LLM can be slow
  })
  const run = (await runRes.json()) as { project_id?: string; news_title?: string; error?: string }
  if (runRes.status === 409) throw Object.assign(new Error(run.error ?? 'no fresh news'), { noNews: true })
  if (!runRes.ok || !run.project_id) throw new Error(run.error ?? `run HTTP ${runRes.status}`)
  s.current_title = run.news_title ?? null

  s.phase = 'render'
  const renderRes = await fetch(`${SELF}/api/projects/${run.project_id}/render`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ duration_seconds: settings.duration_seconds }),
    signal: AbortSignal.timeout(30_000),
  })
  const render = (await renderRes.json()) as { ok?: boolean; error?: string }
  if (!renderRes.ok || !render.ok) throw new Error(render.error ?? `render HTTP ${renderRes.status}`)

  for (let i = 0; i < MAX_POLLS; i++) {
    await sleep(POLL_MS)
    if (!s.running) return // stopped — the pipeline finishes this render on its own
    try {
      const sr = await fetch(`${SELF}/api/projects/${run.project_id}/render-status`, {
        cache: 'no-store',
        signal: AbortSignal.timeout(15_000),
      })
      const st = (await sr.json()) as { status?: string; pct?: number; errors?: string[] }
      s.render_pct = st.pct ?? 0
      if (st.status === 'done') {
        s.clip_count += 1
        return
      }
      if (st.status === 'failed') throw new Error((st.errors ?? []).join('; ') || 'render failed')
    } catch (err) {
      if (err instanceof Error && /failed|HTTP/.test(err.message)) throw err
      // transient fetch blip — keep polling
    }
  }
  throw new Error('render timed out')
}

async function loopBody(): Promise<void> {
  const s = store().state
  while (s.running) {
    try {
      s.last_error = null
      await runOnce(s, s.settings as LoopSettings)
    } catch (err) {
      const noNews = !!(err as { noNews?: boolean }).noNews
      s.last_error = err instanceof Error ? err.message : String(err)
      s.phase = 'cooldown'
      const backoff = noNews ? NO_NEWS_BACKOFF_MS : ERROR_BACKOFF_MS
      const until = Date.now() + backoff
      while (s.running && Date.now() < until) await sleep(2000)
    }
  }
  s.phase = 'idle'
  s.current_title = null
  s.render_pct = 0
}

// ── public API ───────────────────────────────────────────────────────────────

export function getLoopState(): LoopState {
  return { ...store().state }
}

export function startLoop(settings: LoopSettings): LoopState {
  const s = store().state
  if (s.running) return { ...s } // already running — idempotent
  s.running = true
  s.settings = settings
  s.clip_count = 0
  s.last_error = null
  s.started_at = new Date().toISOString()
  void persist(true, settings)
  void loopBody()
  return { ...s }
}

export function stopLoop(): LoopState {
  const s = store().state
  s.running = false
  void persist(false, s.settings)
  return { ...s }
}

// Called from instrumentation.ts at server boot — resume a loop that was
// running before the container restarted.
export async function resumeLoopIfNeeded(): Promise<void> {
  const saved = await readPersisted()
  if (saved?.running && saved.settings?.avatar_id) {
    // give the server a moment to start accepting self-fetch requests
    await sleep(3000)
    startLoop(saved.settings)
  }
}
