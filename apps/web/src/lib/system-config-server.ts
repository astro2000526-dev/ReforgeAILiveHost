// Server-only reader for the system_config row (FB token, keys, etc.).
// Mirrors the raw-PostgREST approach in app/api/config/route.ts (the Supabase JS
// client is ~7s slow on this host; raw HTTP is <50ms).

import 'server-only'
import type { SystemConfig } from '@/lib/system-config'
import { SYSTEM_CONFIG_DEFAULTS } from '@/lib/system-config'

const CONFIG_KEY = 'system_config_v1'
const GW =
  ((process.env.SUPABASE_GATEWAY_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://127.0.0.1:8088').replace(/\/+$/, '')) +
  '/rest/v1'
const SVC_KEY = process.env.SUPABASE_SERVICE_KEY ?? ''

export async function getSystemConfig(): Promise<SystemConfig> {
  try {
    const r = await fetch(
      `${GW}/system_config?key=eq.${CONFIG_KEY}&select=value&limit=1`,
      {
        headers: { Authorization: `Bearer ${SVC_KEY}`, apikey: SVC_KEY },
        cache: 'no-store',
        signal: AbortSignal.timeout(4000),
      }
    )
    if (!r.ok) return SYSTEM_CONFIG_DEFAULTS
    const rows = (await r.json()) as { value: Partial<SystemConfig> }[]
    return { ...SYSTEM_CONFIG_DEFAULTS, ...(rows[0]?.value ?? {}) }
  } catch {
    return SYSTEM_CONFIG_DEFAULTS
  }
}
