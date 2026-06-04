// GET /api/news — fetch latest headlines from Google News RSS (no API key).
// Query: ?lang=th|zh|en  &q=<optional topic keywords>
// Returns: { articles: [{ title, link, source, pub_date, description }] }

import { NextResponse } from 'next/server'
import { fetchNews } from '@/lib/news'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const lang = searchParams.get('lang') ?? 'th'
  const q = searchParams.get('q') ?? undefined
  try {
    const articles = await fetchNews(lang, q)
    return NextResponse.json({ articles })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 502 })
  }
}
