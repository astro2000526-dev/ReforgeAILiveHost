// News fetchers for /api/news (browse) and /api/gallery/run (auto news clip loop).
// Primary: Brave Search News API (key from Settings). Fallback: Google News RSS
// (no key needed) — used when no key is set or the Brave call fails.

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

// ── Brave Search News API ────────────────────────────────────────────────────

const BRAVE_SEARCH_LANG: Record<string, string> = { th: 'th', zh: 'zh-hans', en: 'en' }
const BRAVE_DEFAULT_Q: Record<string, string> = { th: 'ข่าวล่าสุด', zh: '今日新闻', en: 'top news today' }

type BraveNewsResult = {
  title?: string
  url?: string
  description?: string
  age?: string
  page_age?: string
  meta_url?: { hostname?: string }
}

export async function fetchBraveNews(apiKey: string, lang: string, q?: string): Promise<NewsArticle[]> {
  const query = q?.trim() || BRAVE_DEFAULT_Q[lang] || BRAVE_DEFAULT_Q.en
  const params = new URLSearchParams({
    q: query,
    count: '20',
    search_lang: BRAVE_SEARCH_LANG[lang] ?? 'en',
    spellcheck: '0',
  })
  // bias toward fresh headlines when browsing without a topic; a topic search
  // keeps the full window so niche queries still return results
  if (!q?.trim()) params.set('freshness', 'pd')

  const r = await fetch(`https://api.search.brave.com/res/v1/news/search?${params}`, {
    headers: { 'X-Subscription-Token': apiKey, Accept: 'application/json' },
    cache: 'no-store',
    signal: AbortSignal.timeout(10000),
  })
  if (!r.ok) throw new Error(`brave news HTTP ${r.status}`)
  const d = (await r.json()) as { results?: BraveNewsResult[] }
  return (d.results ?? []).map((x) => ({
    title: (x.title ?? '').replace(/<[^>]+>/g, '').trim(),
    link: x.url ?? '',
    source: x.meta_url?.hostname ?? null,
    pub_date: x.page_age ?? x.age ?? null,
    description: x.description ? x.description.replace(/<[^>]+>/g, '').trim() : null,
  })).filter((a) => a.title && a.link)
}

// ── provider routing ─────────────────────────────────────────────────────────

export async function fetchNewsSmart(
  lang: string,
  q: string | undefined,
  braveKey: string
): Promise<{ articles: NewsArticle[]; provider: 'brave' | 'google-rss' }> {
  if (braveKey) {
    try {
      return { articles: await fetchBraveNews(braveKey, lang, q), provider: 'brave' }
    } catch {
      // bad key / quota / outage — degrade to the free feed instead of dying
    }
  }
  return { articles: await fetchNews(lang, q), provider: 'google-rss' }
}
