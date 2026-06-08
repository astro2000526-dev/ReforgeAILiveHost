// POST /api/live/reply  { commentId, message }
// Posts a reply under a Facebook comment. Page token read server-side from
// system_config. This is OUTWARD-FACING — it publishes publicly to the live —
// so the UI only calls it on an explicit user action (or an opt-in auto toggle).

import { NextResponse } from 'next/server'
import { postCommentReply } from '@/lib/facebook'
import { noteReplied } from '@/lib/live-loop'
import { getSystemConfig } from '@/lib/system-config-server'

type Body = { commentId?: string; message?: string }

export async function POST(request: Request) {
  let body: Body = {}
  try { body = (await request.json()) as Body } catch { /* ok */ }
  const commentId = (body.commentId ?? '').trim()
  const message = (body.message ?? '').trim()
  if (!commentId || !message) return NextResponse.json({ error: 'commentId and message are required' }, { status: 400 })

  const cfg = await getSystemConfig()
  const token = cfg.fb_page_token?.trim()
  if (!token) return NextResponse.json({ error: 'set fb_page_token in Settings' }, { status: 503 })

  const res = await postCommentReply(commentId, message, token)
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.status })

  noteReplied() // bump live-loop session counter (no-op when loop idle)
  return NextResponse.json({ ok: true, id: res.data.id })
}
