// GET  /api/config — read current system config
// POST /api/config — update system config (stored in DB as system_config key-value row)
//
// Uses raw fetch → PostgREST gateway (127.0.0.1:8088) instead of the Supabase JS
// client, because the JS client is ~7s slow on this host while raw HTTP is <50ms.

import { NextResponse } from 'next/server'
import type { SystemConfig } from '@/lib/system-config'
import { SYSTEM_CONFIG_DEFAULTS } from '@/lib/system-config'

export type { SystemConfig }
export { SYSTEM_CONFIG_DEFAULTS }

const CONFIG_KEY = 'system_config_v1'
// PostgREST gateway base. In the compose deploy the web container reaches it as
// http://nginx:8088 (via NEXT_PUBLIC_SUPABASE_URL); host-net deploy uses
// 127.0.0.1:8088. Read from env so it works in both, with a safe fallback.
const GW = ((process.env.SUPABASE_GATEWAY_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://127.0.0.1:8088').replace(/\/+$/, '')) + '/rest/v1'
const SVC_KEY = process.env.SUPABASE_SERVICE_KEY ?? ''

function gwHeaders() {
  return { Authorization: `Bearer ${SVC_KEY}`, apikey: SVC_KEY, 'Content-Type': 'application/json' }
}

async function readConfig(): Promise<SystemConfig> {
  try {
    const r = await fetch(
      `${GW}/system_config?key=eq.${CONFIG_KEY}&select=value&limit=1`,
      { headers: gwHeaders(), cache: 'no-store', signal: AbortSignal.timeout(4000) }
    )
    if (!r.ok) return SYSTEM_CONFIG_DEFAULTS
    const rows = (await r.json()) as { value: Partial<SystemConfig> }[]
    // merge over defaults so a row written before newer fields existed never
    // leaves a field undefined (callers do e.g. cfg.playback_speed.toFixed()).
    return { ...SYSTEM_CONFIG_DEFAULTS, ...(rows[0]?.value ?? {}) }
  } catch {
    return SYSTEM_CONFIG_DEFAULTS
  }
}

export async function GET() {
  const config = await readConfig()
  return NextResponse.json({ config })
}

export async function POST(request: Request) {
  let body: Partial<SystemConfig> = {}
  try {
    body = (await request.json()) as Partial<SystemConfig>
  } catch {
    return NextResponse.json({ error: 'invalid JSON' }, { status: 400 })
  }

  const current = await readConfig()
  const merged: SystemConfig = { ...current, ...body }

  const r = await fetch(`${GW}/system_config`, {
    method: 'POST',
    headers: { ...gwHeaders(), Prefer: 'resolution=merge-duplicates' },
    body: JSON.stringify({ key: CONFIG_KEY, value: merged, updated_at: new Date().toISOString() }),
    signal: AbortSignal.timeout(5000),
  })

  if (!r.ok) {
    const msg = await r.text().catch(() => `HTTP ${r.status}`)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
  return NextResponse.json({ config: merged })
}
