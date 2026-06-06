// GET /api/system/lipsync-health
// Server-side proxy for the lip-sync service health check. Keeps the
// GPU/lipsync URL out of the browser — the settings page hits this route
// instead of fetching cfg.lipsync_url directly.

import { NextResponse } from 'next/server'
import { getSystemConfig } from '@/lib/system-config-server'

export const dynamic = 'force-dynamic'

export async function GET() {
  const cfg = await getSystemConfig()
  if (!cfg.lipsync_url) {
    return NextResponse.json({ ok: false, error: 'lipsync_url not configured' }, { status: 503 })
  }
  try {
    const r = await fetch(`${cfg.lipsync_url.replace(/\/$/, '')}/health`, {
      signal: AbortSignal.timeout(5000),
      cache: 'no-store',
    })
    return NextResponse.json({ ok: r.ok, status: r.status })
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 502 })
  }
}
