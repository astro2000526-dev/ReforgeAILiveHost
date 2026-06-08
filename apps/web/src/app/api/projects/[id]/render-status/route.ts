// GET /api/projects/:id/render-status
// One-shot render job state (shared logic in lib/render-status — also mirrors
// terminal states into DB). Live progress comes from ./stream (SSE).

import { NextResponse } from 'next/server'
import { getRenderStatus } from '@/lib/render-status'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const res = await getRenderStatus(id)
  if (!res.ok) return NextResponse.json({ error: res.message }, { status: res.status })
  return NextResponse.json(res.data)
}
