// GET /api/system/status
// One-shot snapshot for the /status page (shared logic in lib/system-status).
// Live updates come from ./stream (SSE).

import { NextResponse } from 'next/server'
import { getSystemStatus } from '@/lib/system-status'

export const dynamic = 'force-dynamic'

export async function GET() {
  return NextResponse.json(await getSystemStatus())
}
