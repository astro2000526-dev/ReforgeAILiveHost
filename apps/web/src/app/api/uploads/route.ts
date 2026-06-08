// POST /api/uploads — proxy a browser file upload to the pipeline /upload
// endpoint (which stores it and returns a public /files URL). Keeps the
// PIPELINE_TOKEN server-side; the browser never sees it. All access to the
// pipeline goes through the single forwarder (lib/pipeline-client).

import { NextResponse } from 'next/server'
import { pipelineFetchForm } from '@/lib/pipeline-client'

export async function POST(request: Request) {
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

  const res = await pipelineFetchForm('/upload', fd)
  if (!res.ok) {
    const status = res.error.kind === 'unconfigured' ? 503 : 502
    return NextResponse.json({ error: res.error.message }, { status })
  }

  const data = (res.data ?? {}) as { url?: string }
  return NextResponse.json({ url: data.url ?? null })
}
