// GET /api/news — fetch latest headlines.
// Provider: Brave Search News API when a key is set in Settings, otherwise
// Google News RSS (free fallback).
// Query: ?lang=th|zh|en  &q=<optional topic keywords>
// Returns: { articles: [...], provider: 'brave' | 'google-rss' }

import { NextResponse } from 'next/server'
import { fetchNewsSmart } from '@/lib/news'
import { getSystemConfig } from '@/lib/system-config-server'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const lang = searchParams.get('lang') ?? 'th'
  const q = searchParams.get('q') ?? undefined
  try {
    const cfg = await getSystemConfig()
    const { articles, provider } = await fetchNewsSmart(lang, q, cfg.brave_api_key)
    return NextResponse.json({ articles, provider })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 502 })
  }
}
