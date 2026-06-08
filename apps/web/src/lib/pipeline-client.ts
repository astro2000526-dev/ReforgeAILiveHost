// Forwarder helpers to talk to the FastAPI pipeline service.
//
// PIPELINE_API_URL is set in apps/web/.env.local once the FastAPI service is
// running. While it's unset (e.g. local dev before the GPU box is up),
// these helpers return a typed error so the API routes can surface a clear
// message instead of a generic 500.
//
// PIPELINE_TOKEN is the shared secret the GPU service expects in
// `Authorization: Bearer ...`. Server-side env only — never NEXT_PUBLIC_.

export type PipelineConfigError = { kind: 'unconfigured'; message: string }
export type PipelineHttpError = { kind: 'http'; status: number; message: string }
export type PipelineError = PipelineConfigError | PipelineHttpError

export function pipelineBaseUrl(): string | null {
  return process.env.PIPELINE_API_URL?.trim() || null
}

export function pipelineToken(): string | null {
  return process.env.PIPELINE_TOKEN?.trim() || null
}

export async function pipelineFetch(
  path: string,
  init?: RequestInit
): Promise<{ ok: true; data: unknown } | { ok: false; error: PipelineError }> {
  const base = pipelineBaseUrl()
  if (!base) {
    return {
      ok: false,
      error: {
        kind: 'unconfigured',
        message:
          'PIPELINE_API_URL 未配置。先启动 FastAPI（uvicorn app.main:app --port 8000）并在 apps/web/.env.local 设置 PIPELINE_API_URL=http://localhost:8000。',
      },
    }
  }
  const token = pipelineToken()
  if (!token) {
    return {
      ok: false,
      error: {
        kind: 'unconfigured',
        message:
          'PIPELINE_TOKEN 未配置。在 apps/web/.env.local 设置 PIPELINE_TOKEN，并与 services/pipeline/.env 中的同名变量保持一致。',
      },
    }
  }
  const r = await fetch(`${base.replace(/\/$/, '')}${path}`, {
    cache: 'no-store',
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(init?.headers ?? {}),
    },
  })
  const text = await r.text()
  let data: unknown = null
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    data = text
  }
  if (!r.ok) {
    return {
      ok: false,
      error: {
        kind: 'http',
        status: r.status,
        message:
          typeof data === 'object' && data && 'detail' in data
            ? String((data as { detail: unknown }).detail)
            : text.slice(0, 300) || `pipeline HTTP ${r.status}`,
      },
    }
  }
  return { ok: true, data }
}

// Multipart variant of pipelineFetch for file uploads. Same return shape and
// unconfigured-error messages. Critically, we do NOT set Content-Type — fetch
// must derive the multipart boundary from the FormData body itself.
export async function pipelineFetchForm(
  path: string,
  form: FormData
): Promise<{ ok: true; data: unknown } | { ok: false; error: PipelineError }> {
  const base = pipelineBaseUrl()
  if (!base) {
    return {
      ok: false,
      error: {
        kind: 'unconfigured',
        message:
          'PIPELINE_API_URL 未配置。先启动 FastAPI（uvicorn app.main:app --port 8000）并在 apps/web/.env.local 设置 PIPELINE_API_URL=http://localhost:8000。',
      },
    }
  }
  const token = pipelineToken()
  if (!token) {
    return {
      ok: false,
      error: {
        kind: 'unconfigured',
        message:
          'PIPELINE_TOKEN 未配置。在 apps/web/.env.local 设置 PIPELINE_TOKEN，并与 services/pipeline/.env 中的同名变量保持一致。',
      },
    }
  }
  const r = await fetch(`${base.replace(/\/$/, '')}${path}`, {
    method: 'POST',
    cache: 'no-store',
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: form,
  })
  const text = await r.text()
  let data: unknown = null
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    data = text
  }
  if (!r.ok) {
    return {
      ok: false,
      error: {
        kind: 'http',
        status: r.status,
        message:
          typeof data === 'object' && data && 'detail' in data
            ? String((data as { detail: unknown }).detail)
            : text.slice(0, 300) || `pipeline HTTP ${r.status}`,
      },
    }
  }
  return { ok: true, data }
}
