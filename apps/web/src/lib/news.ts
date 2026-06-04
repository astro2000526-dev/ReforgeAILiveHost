// Google News RSS fetcher — no API key needed.
// Used by /api/news (browse) and /api/gallery/run (auto news clip loop).

export type NewsArticle = {
  title: string
  link: string
  source: string | null
  pub_date: string | null
  description: string | null
}

const FEEDS: Record<string, string> = {
  th: 'hl=th&gl=TH&ceid=TH:th',
  zh: 'hl=zh-CN&gl=CN&ceid=CN:zh-Hans',
  en: 'hl=en-US&gl=US&ceid=US:en',
}

function tag(xml: string, name: string): string | null {
  const m = xml.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`))
  if (!m) return null
  return m[1]
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    // unescape entities FIRST — feeds ship escaped HTML (&lt;ol&gt;…) inside
    // description; stripping tags before unescaping leaves the HTML intact.
    // &amp; goes first: the feed double-escapes (&amp;nbsp;).
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function parseRss(xml: string, limit = 20): NewsArticle[] {
  const items = xml.match(/<item>[\s\S]*?<\/item>/g) ?? []
  return items.slice(0, limit).map((it) => ({
    title: tag(it, 'title') ?? '',
    link: tag(it, 'link') ?? '',
    source: tag(it, 'source'),
    pub_date: tag(it, 'pubDate'),
    description: tag(it, 'description'),
  })).filter((a) => a.title && a.link)
}

export async function fetchNews(lang: string, q?: string): Promise<NewsArticle[]> {
  const locale = FEEDS[lang] ?? FEEDS.th
  const url = q
    ? `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&${locale}`
    : `https://news.google.com/rss?${locale}`
  const r = await fetch(url, {
    cache: 'no-store',
    signal: AbortSignal.timeout(10000),
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ReforgeAI/1.0)' },
  })
  if (!r.ok) throw new Error(`news feed HTTP ${r.status}`)
  return parseRss(await r.text())
}
