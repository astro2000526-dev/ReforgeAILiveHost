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
    return { ...SYSTEM_CONFIG_DEFAULTS, ...(rows[0]?.value ?? {}) }
  } catch {
    return SYSTEM_CONFIG_DEFAULTS
  }
}
