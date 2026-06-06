// Server-side 24/7 live-stream driver loop. Runs inside the web container's
// long-lived Node process (same pattern as src/lib/gallery-loop.ts): state
// lives in a module singleton, the run/stop flag + settings are mirrored to the
// system_config table so a container restart resumes the loop (see
// src/instrumentation.ts).
//
// The loop's job is to keep the GPU pipeline fed so the avatar never goes
// silent. The pipeline (services/pipeline) buffers ~30s of rendered video ahead
// of the RTMP push; whenever that buffer runs low this loop asks Qwen (/llm)
// for the next 2-3 sentence script chunk — continuing the previous context so
// the host keeps talking naturally — and POSTs it to /live/feed.
//
// Talking to the pipeline goes through pipelineFetch ONLY (server-side bearer).

import 'server-only'

import { pipelineFetch } from '@/lib/pipeline-client'
import { gwHeaders, gwUrl } from '@/lib/server/db-gateway'
import { supabaseAdmin } from '@/lib/supabase-server'
import { getSystemConfig } from '@/lib/system-config-server'
import type { AvatarJoin } from '@/lib/types'

// ── public types ─────────────────────────────────────────────────────────────

export type LiveLoopSettings = {
  avatar_id: string
  product?: string
  topic?: string
  language: string            // 'th' | 'zh' | 'en'
  rtmp_url: string
  stream_key: string
  auto_speak_replies: boolean
}

export type LiveLoopPhase = 'idle' | 'starting' | 'scripting' | 'feeding' | 'error'

export type LiveLoopState = {
  running: boolean
  phase: LiveLoopPhase
  session_id: string | null
  pipeline_state: string | null   // pipeline's own state: starting|live|stopping|stopped|failed
  buffered_seconds: number
  queue_len: number
  fed_chunks: number
  replied_count: number           // FB replies posted this session (via /api/live/reply path)
  spoken_count: number            // comments spoken aloud this session (via /api/live/speak)
  last_error: string | null
  started_at: string | null
  settings: LiveLoopSettings | null
}

// ── tuning constants ─────────────────────────────────────────────────────────

const STATE_KEY = 'live_loop_v1'

const TICK_MS = 5000            // loop cadence
const LOW_BUFFER_SEC = 45       // feed a new chunk when projected buffer dips below this
const CHUNK_SEC_EST = 8         // ~seconds of speech per queued chunk (rough)
const RESTART_THROTTLE_MS = 30_000  // min gap between session restarts after a failure
const ERROR_BACKOFF_MS = 8000   // pause after a transient tick error
const RECENT_CHUNKS_KEEP = 3    // last N chunks fed to the LLM as anti-repeat context

const LANG_WORD: Record<string, string> = { th: 'ภาษาไทย', zh: '中文', en: 'English' }
const VOICE_BY_LANG: Record<string, string> = {
  th: 'th-TH-PremwadeeNeural',
  zh: 'BV001_streaming',
  en: 'en-US-JennyNeural',
}

// ── singleton store (survives HMR in dev, shared across route modules) ─────────

type Store = {
  state: LiveLoopState
  recentChunks: string[]        // anti-repeat context, not exported
  lastRestartAt: number
}
const g = globalThis as unknown as { __liveLoop?: Store }

function initialState(): LiveLoopState {
  return {
    running: false,
    phase: 'idle',
    session_id: null,
    pipeline_state: null,
    buffered_seconds: 0,
    queue_len: 0,
    fed_chunks: 0,
    replied_count: 0,
    spoken_count: 0,
    last_error: null,
    started_at: null,
    settings: null,
  }
}

function store(): Store {
  if (!g.__liveLoop) g.__liveLoop = { state: initialState(), recentChunks: [], lastRestartAt: 0 }
  return g.__liveLoop
}

const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms))
const newSessionId = () =>
  `live-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`

// ── persistence (system_config key-value row) ────────────────────────────────

async function persist(running: boolean, settings: LiveLoopSettings | null): Promise<void> {
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
    // best-effort; the in-memory loop keeps working
  }
}

async function readPersisted(): Promise<{ running?: boolean; settings?: LiveLoopSettings } | null> {
  try {
    const r = await fetch(gwUrl(`/system_config?key=eq.${STATE_KEY}&select=value&limit=1`), {
      headers: gwHeaders(),
      cache: 'no-store',
      signal: AbortSignal.timeout(4000),
    })
    if (!r.ok) return null
    const rows = (await r.json()) as { value?: { running?: boolean; settings?: LiveLoopSettings } }[]
    return rows[0]?.value ?? null
  } catch {
    return null
  }
}

// ── avatar lookup (face/voice source for /live/start) ─────────────────────────

type AvatarRow = AvatarJoin & { id: string; voice?: string | null }

async function loadAvatar(avatarId: string): Promise<AvatarRow | null> {
  const { data } = await supabaseAdmin
    .from('avatars')
    .select('id, template_video_url, preview_image_url, bg_remove, background_url, background_type, camera_zoom, frame_position, frame_scale')
    .eq('id', avatarId)
    .maybeSingle<AvatarRow>()
  return data ?? null
}

// ── script generation (Qwen continuous-host loop) ─────────────────────────────

// Build the next 2-3 sentence chunk that continues the live-host monologue.
// Recent chunks are passed back so Qwen doesn't loop the same lines.
async function generateChunk(settings: LiveLoopSettings, recent: string[]): Promise<string> {
  const lang = settings.language in LANG_WORD ? settings.language : 'th'
  const product = settings.product?.trim() || ''
  const topic = settings.topic?.trim() || ''

  const prompt =
    `คุณเป็นแม่ค้าไลฟ์ขายของ กำลังพูดสดต่อเนื่องในไลฟ์ ` +
    `พูดต่อจากที่พูดไปแล้วแบบลื่นไหล เป็นกันเอง ชวนคุย ชวนซื้อแบบไม่ยัดเยียด ` +
    `ตอบเป็น${LANG_WORD[lang]} แค่ 2-3 ประโยคสั้นๆ พูดต่อเนื่องเป็นบทพูดเดียว ` +
    `ห้ามซ้ำประโยคเดิม ห้ามมีหัวข้อ ห้ามมี markdown ตอบเฉพาะบทพูด.\n` +
    (product ? `สินค้าที่ขาย: ${product}\n` : '') +
    (topic ? `ประเด็นที่อยากเน้น: ${topic}\n` : '') +
    (recent.length ? `\nสิ่งที่เพิ่งพูดไป (ห้ามพูดซ้ำ):\n- ${recent.join('\n- ')}\n` : '') +
    `\nพูดต่อ:`

  const ai = await pipelineFetch('/llm', {
    method: 'POST',
    body: JSON.stringify({ prompt, max_tokens: 160 }),
  })
  if (!ai.ok) throw new Error(`llm: ${ai.error.message}`)
  const text = ((ai.data as { text?: string }).text ?? '').trim()
  if (!text) throw new Error('llm returned empty chunk')
  return text
}

// ── pipeline calls ────────────────────────────────────────────────────────────

type PipelineStatus = {
  state?: string
  error?: string | null
  buffered_seconds?: number
  queue_len?: number
}

async function pipelineStatus(sessionId: string): Promise<PipelineStatus | null> {
  const r = await pipelineFetch(`/live/status/${encodeURIComponent(sessionId)}`, { method: 'GET' })
  if (!r.ok) return null
  return (r.data ?? {}) as PipelineStatus
}

// Open a fresh pipeline session: resolve avatar + config, fire /live/start with
// the first script chunk so the stream has something to render immediately.
async function startSession(s: LiveLoopState, settings: LiveLoopSettings): Promise<void> {
  s.phase = 'starting'
  const cfg = await getSystemConfig()
  const avatar = await loadAvatar(settings.avatar_id)
  if (!avatar) throw new Error(`avatar ${settings.avatar_id} not found`)

  const faceSource = avatar.template_video_url || avatar.preview_image_url || null
  const lang = settings.language in VOICE_BY_LANG ? settings.language : 'th'
  const voice = VOICE_BY_LANG[lang]
  const rtmp = settings.rtmp_url?.trim() || cfg.default_rtmp_url

  // First chunk so the live opens with real speech (not silence).
  const first = await generateChunk(settings, [])
  store().recentChunks = [first]

  const sessionId = newSessionId()
  const res = await pipelineFetch('/live/start', {
    method: 'POST',
    body: JSON.stringify({
      session_id: sessionId,
      rtmp_url: rtmp,
      stream_key: settings.stream_key,
      script_texts: [first],
      voice,
      rate: '+0%',
      avatar_image_url: faceSource,
      template_url: avatar.template_video_url ?? null,
      lipsync_url: cfg.lipsync_enabled ? cfg.lipsync_url : null,
      lipsync_model: cfg.lipsync_model || 'wav2lip',
      video_quality: cfg.video_quality ?? '1080p',
      sound_mode: cfg.sound_mode ?? 'normal',
      lip_blend: typeof cfg.lip_blend === 'number' ? cfg.lip_blend : 30,
      azure_key: cfg.azure_speech_key || null,
      azure_region: cfg.azure_speech_region || 'eastus',
      tts_engine: cfg.tts_provider,
    }),
  })
  if (!res.ok) throw new Error(`live/start: ${res.error.message}`)

  s.session_id = sessionId
  s.fed_chunks = 1
  s.pipeline_state = 'starting'
  store().lastRestartAt = Date.now()
}

// Push one chunk of speech into the running session.
async function feedSession(sessionId: string, texts: string[]): Promise<void> {
  const res = await pipelineFetch('/live/feed', {
    method: 'POST',
    body: JSON.stringify({ session_id: sessionId, texts }),
  })
  if (!res.ok) throw new Error(`live/feed: ${res.error.message}`)
}

// ── main loop body ────────────────────────────────────────────────────────────

async function tick(s: LiveLoopState): Promise<void> {
  const settings = s.settings as LiveLoopSettings
  const st = store()

  // No session yet → open one.
  if (!s.session_id) {
    await startSession(s, settings)
    return
  }

  const status = await pipelineStatus(s.session_id)
  if (status) {
    s.pipeline_state = status.state ?? s.pipeline_state
    s.buffered_seconds = Number(status.buffered_seconds) || 0
    s.queue_len = Number(status.queue_len) || 0
  }

  // Pipeline died → restart with a brand-new session id (rate-limited).
  if (status?.state === 'failed' || status?.state === 'stopped') {
    s.last_error = status.error || `pipeline ${status.state}`
    if (Date.now() - st.lastRestartAt < RESTART_THROTTLE_MS) return // wait out the throttle
    s.session_id = null
    s.phase = 'starting'
    await startSession(s, settings)
    return
  }

  // Projected runway = buffered + queued chunks worth of speech.
  const projected = s.buffered_seconds + s.queue_len * CHUNK_SEC_EST
  if (projected < LOW_BUFFER_SEC) {
    s.phase = 'scripting'
    const chunk = await generateChunk(settings, st.recentChunks)
    st.recentChunks = [...st.recentChunks, chunk].slice(-RECENT_CHUNKS_KEEP)
    s.phase = 'feeding'
    await feedSession(s.session_id, [chunk])
    s.fed_chunks += 1
  }
}

async function loopBody(): Promise<void> {
  const s = store().state
  while (s.running) {
    try {
      s.last_error = null
      await tick(s)
      await sleep(TICK_MS)
    } catch (err) {
      s.last_error = err instanceof Error ? err.message : String(err)
      s.phase = 'error'
      const until = Date.now() + ERROR_BACKOFF_MS
      while (s.running && Date.now() < until) await sleep(1500)
    }
  }
  // stopped — tell the pipeline to tear the session down
  if (s.session_id) {
    try { await pipelineFetch(`/live/stop/${encodeURIComponent(s.session_id)}`, { method: 'POST' }) } catch { /* best-effort */ }
  }
  s.phase = 'idle'
  s.session_id = null
  s.pipeline_state = null
  s.buffered_seconds = 0
  s.queue_len = 0
}

// ── public API ───────────────────────────────────────────────────────────────

export function getLiveLoopState(): LiveLoopState {
  return { ...store().state }
}

export function startLiveLoop(settings: LiveLoopSettings): LiveLoopState {
  const st = store()
  const s = st.state
  if (s.running) return { ...s } // idempotent
  s.running = true
  s.settings = settings
  s.session_id = null
  s.pipeline_state = null
  s.buffered_seconds = 0
  s.queue_len = 0
  s.fed_chunks = 0
  s.replied_count = 0
  s.spoken_count = 0
  s.last_error = null
  s.started_at = new Date().toISOString()
  st.recentChunks = []
  st.lastRestartAt = 0
  void persist(true, settings)
  void loopBody()
  return { ...s }
}

export function stopLiveLoop(): LiveLoopState {
  const s = store().state
  s.running = false
  void persist(false, s.settings)
  return { ...s }
}

// Feed an arbitrary line into the running session — used by /api/live/speak so a
// presenter can have the avatar "speak" a reply to a viewer comment. Returns
// false when no live session is active (caller surfaces a 409).
export async function speakText(text: string): Promise<boolean> {
  const s = store().state
  const line = text.trim()
  if (!s.running || !s.session_id || !line) return false
  await feedSession(s.session_id, [line])
  s.fed_chunks += 1
  s.spoken_count += 1
  return true
}

// Bump the FB-reply counter (called from the reply path). No-op when idle.
export function noteReplied(): void {
  const s = store().state
  if (s.running) s.replied_count += 1
}

// Called from instrumentation.ts at server boot — resume a loop that was running
// before the container restarted.
export async function resumeLiveLoopIfNeeded(): Promise<void> {
  const saved = await readPersisted()
  if (saved?.running && saved.settings?.avatar_id) {
    await sleep(3000) // let the server start accepting requests
    startLiveLoop(saved.settings)
  }
}
