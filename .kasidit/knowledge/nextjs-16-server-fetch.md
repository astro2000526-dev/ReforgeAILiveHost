---
topic: Next.js 16 server-side fetch with Authorization header
source: https://nextjs.org/docs/app/getting-started/fetching-data
fetched: 2026-05-28
stack: next 16.2.6, react 19.2.4
---

# Next.js 16 — Server-side fetch with Bearer token

## What changed vs Next.js 14 (important)

1. **`fetch` is NOT cached by default** in Next.js 16. Older versions auto-cached. To opt back in, use `'use cache'` directive or `<Suspense>` streaming.
2. **`params` and `searchParams` are now `Promise`** in route handlers + pages. Always `await params`.
3. `cache: 'no-store'` still works — but is now a no-op default (kept for clarity).

## Server-side fetch (Route Handler / Server Component)

```ts
// Pattern used in apps/web/src/lib/pipeline-client.ts
const PIPELINE_URL = process.env.PIPELINE_API_URL!
const PIPELINE_TOKEN = process.env.PIPELINE_TOKEN!

await fetch(`${PIPELINE_URL}/generate`, {
  method: 'POST',
  cache: 'no-store',  // explicit; matches new default
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${PIPELINE_TOKEN}`,
  },
  body: JSON.stringify(payload),
})
```

## Why env vars work server-side only

- `process.env.PIPELINE_TOKEN` — server only, never sent to browser.
- `NEXT_PUBLIC_*` prefix → exposed to client bundle.
- Don't add `NEXT_PUBLIC_` to PIPELINE_TOKEN — it must stay server-side.

## Pattern for our `pipelineFetch` helper

```ts
// apps/web/src/lib/pipeline-client.ts
export async function pipelineFetch(path: string, init?: RequestInit) {
  const base = process.env.PIPELINE_API_URL?.trim()
  const token = process.env.PIPELINE_TOKEN?.trim()
  if (!base) return { ok: false, error: { kind: 'unconfigured', message: '...' } }

  const r = await fetch(`${base.replace(/\/$/, '')}${path}`, {
    cache: 'no-store',
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
      ...(init?.headers ?? {}),
    },
  })
  // ...
}
```

## Route handler signature (params is Promise)

```ts
// app/api/projects/[id]/route.ts
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params  // ← await required in Next.js 16
  // ...
}
```

## Notes

- Identical `fetch` calls within one React tree are **memoized per request** — call in the consuming component, no prop drilling.
- For long-running pipeline calls (>30s), wrap in `<Suspense>` so the rest of the page streams while pipeline works.
