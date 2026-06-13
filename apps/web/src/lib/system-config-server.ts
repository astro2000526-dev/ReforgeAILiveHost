// Server-only reader for the system_config row (FB token, keys, etc.).
// Mirrors the raw-PostgREST approach in app/api/config/route.ts (the Supabase JS
// client is ~7s slow on this host; raw HTTP is <50ms).

import 'server-only'
import type { SystemConfig } from '@/lib/system-config'
import { SYSTEM_CONFIG_DEFAULTS } from '@/lib/system-config'
import { gwHeaders, gwUrl } from '@/lib/server/db-gateway'

const CONFIG_KEY = 'system_config_v1'

export async function getSystemConfig(): Promise<SystemConfig> {
  try {
    const r = await fetch(
      gwUrl(`/system_config?key=eq.${CONFIG_KEY}&select=value&limit=1`),
      {
        headers: gwHeaders(),
        cache: 'no-store',
        signal: AbortSignal.timeout(4000),
      }
    )
    if (!r.ok) return SYSTEM_CONFIG_DEFAULTS
    const rows = (await r.json()) as { value: Partial<SystemConfig> }[]
    return coerceConfig({ ...SYSTEM_CONFIG_DEFAULTS, ...(rows[0]?.value ?? {}) })
  } catch {
    return SYSTEM_CONFIG_DEFAULTS
  }
}

// The defaults-merge only fills MISSING keys, not WRONG-TYPED ones. A legacy or
// externally-written row could store a numeric field as a string (e.g.
// playback_speed:'1'), which then crashes the client (cfg.playback_speed.toFixed).
// Force the numeric/enum fields to valid types + ranges here, the single read path.
function coerceConfig(c: SystemConfig): SystemConfig {
  const num = (v: unknown, def: number, lo: number, hi: number) => {
    const n = Number(v)
    return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : def
  }
  const oneOf = <T extends string>(v: unknown, allowed: readonly T[], def: T): T =>
    (allowed as readonly string[]).includes(v as string) ? (v as T) : def
  return {
    ...c,
    playback_speed: num(c.playback_speed, 1.0, 0.5, 1.5),
    lip_blend: num(c.lip_blend, 30, 0, 100),
    tts_pitch: num(c.tts_pitch, 0, -12, 12),
    default_duration: num(c.default_duration, 30, 1, 3600),
    tts_provider: oneOf(c.tts_provider, ['edge-tts', 'azure', 'google', 'volcengine'], 'edge-tts'),
    video_quality: oneOf(c.video_quality, ['1080p', '720p', '480p'], '1080p'),
    sound_mode: oneOf(c.sound_mode, ['normal', 'boost', 'soft'], 'normal'),
    render_mode: oneOf(c.render_mode, ['loop', 'ai'], 'loop'),
    lipsync_model: oneOf(c.lipsync_model, ['mock', 'musetalk', 'wav2lip'], 'mock'),
  }
}
