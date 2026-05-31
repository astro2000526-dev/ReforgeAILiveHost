// POST /api/uploads — proxy a browser file upload to the pipeline /upload
// endpoint (which stores it and returns a public /files URL). Keeps the
// PIPELINE_TOKEN server-side; the browser never sees it.

import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  const base = process.env.PIPELINE_API_URL?.trim()
  const token = process.env.PIPELINE_TOKEN?.trim()
  if (!base) {
    return NextResponse.json({ error: 'PIPELINE_API_URL not configured' }, { status: 503 })
  }
  if (!token) {
    return NextResponse.json({ error: 'PIPELINE_TOKEN not configured' }, { status: 503 })
  }

  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return NextResponse.json({ error: 'expected multipart/form-data' }, { status: 400 })
  }
  const file = form.get('file')
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'missing file field' }, { status: 400 })
  }

  const fd = new FormData()
  fd.append('file', file, file.name)

  let r: Response
  try {
    r = await fetch(`${base.replace(/\/$/, '')}/upload`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: fd,
    })
  } catch (err) {
    return NextResponse.json(
      { error: `pipeline unreachable: ${err instanceof Error ? err.message : String(err)}` },
      { status: 502 }
    )
  }

  const data = (await r.json().catch(() => ({}))) as { url?: string; error?: string }
  if (!r.ok) {
    return NextResponse.json({ error: data.error ?? `upload failed (HTTP ${r.status})` }, { status: 502 })
  }
  return NextResponse.json({ url: data.url ?? null })
}
