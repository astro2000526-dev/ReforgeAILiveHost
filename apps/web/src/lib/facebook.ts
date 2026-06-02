// Facebook Graph API helpers for live-stream comments.
// Server-only — never expose the page token to the browser.
//
// Polling model (MVP): GET /{video_id}/comments on an interval, dedupe by id.
// Reply model: POST /{comment_id}/comments to reply under a viewer's comment.

import 'server-only'

const GRAPH = 'https://graph.facebook.com/v19.0'

export type FbComment = {
  id: string
  message: string
  from: string // commenter display name ('' if not permitted)
  created_time: string // ISO
}

export type FbResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; status: number }

type GraphError = { error?: { message?: string; type?: string; code?: number } }

async function graphError(r: Response): Promise<string> {
  const body = (await r.json().catch(() => ({}))) as GraphError
  return body.error?.message ?? `Graph API HTTP ${r.status}`
}

// Fetch recent comments on a live (or any) video. `after` is an ISO timestamp —
// only comments strictly newer are returned, so the caller can poll cheaply.
export async function fetchLiveComments(
  videoId: string,
  token: string,
  after?: string
): Promise<FbResult<FbComment[]>> {
  if (!videoId || !token) return { ok: false, error: 'missing fb_live_video_id or fb_page_token', status: 400 }

  const url =
    `${GRAPH}/${encodeURIComponent(videoId)}/comments` +
    `?order=reverse_chronological&limit=50` +
    `&fields=${encodeURIComponent('id,message,created_time,from{name}')}` +
    `&access_token=${encodeURIComponent(token)}`

  let r: Response
  try {
    r = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(8000) })
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'network error', status: 502 }
  }
  if (!r.ok) return { ok: false, error: await graphError(r), status: r.status }

  const json = (await r.json()) as {
    data?: { id: string; message?: string; created_time: string; from?: { name?: string } }[]
  }
  const afterMs = after ? Date.parse(after) : 0
  const comments: FbComment[] = (json.data ?? [])
    .filter((c) => (c.message ?? '').trim().length > 0)
    .filter((c) => !afterMs || Date.parse(c.created_time) > afterMs)
    .map((c) => ({
      id: c.id,
      message: (c.message ?? '').trim(),
      from: c.from?.name ?? '',
      created_time: c.created_time,
    }))
    // Graph returns newest-first; hand back oldest-first so the UI appends naturally.
    .reverse()

  return { ok: true, data: comments }
}

// Post a reply under a specific comment.
export async function postCommentReply(
  commentId: string,
  message: string,
  token: string
): Promise<FbResult<{ id: string }>> {
  if (!commentId || !message.trim() || !token)
    return { ok: false, error: 'missing commentId, message, or token', status: 400 }

  const url = `${GRAPH}/${encodeURIComponent(commentId)}/comments`
  let r: Response
  try {
    r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: message.trim(), access_token: token }),
      signal: AbortSignal.timeout(8000),
    })
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'network error', status: 502 }
  }
  if (!r.ok) return { ok: false, error: await graphError(r), status: r.status }

  const json = (await r.json()) as { id?: string }
  return { ok: true, data: { id: json.id ?? '' } }
}
