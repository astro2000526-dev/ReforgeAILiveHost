// GET  /api/config — read current system config
// POST /api/config — update system config (stored in DB as system_config key-value row)
//
// Uses raw fetch → PostgREST gateway (127.0.0.1:8088) instead of the Supabase JS
// client, because the JS client is ~7s slow on this host while raw HTTP is <50ms.

import { NextResponse } from 'next/server'
import type { SystemConfig } from '@/lib/system-config'
import { gwHeaders, gwUrl } from '@/lib/server/db-gateway'
import { getSystemConfig } from '@/lib/system-config-server'

const CONFIG_KEY = 'system_config_v1'

export async function GET() {
  const config = await getSystemConfig()
  return NextResponse.json({ config })
}

export async function POST(request: Request) {
  let body: Partial<SystemConfig> = {}
  try {
    body = (await request.json()) as Partial<SystemConfig>
  } catch {
    return NextResponse.json({ error: 'invalid JSON' }, { status: 400 })
  }

  const current = await getSystemConfig()
  const merged: SystemConfig = { ...current, ...body }

  const r = await fetch(gwUrl('/system_config'), {
    method: 'POST',
    headers: { ...gwHeaders(), 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates' },
    body: JSON.stringify({ key: CONFIG_KEY, value: merged, updated_at: new Date().toISOString() }),
    signal: AbortSignal.timeout(5000),
  })

  if (!r.ok) {
    const msg = await r.text().catch(() => `HTTP ${r.status}`)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
  return NextResponse.json({ config: merged })
}
