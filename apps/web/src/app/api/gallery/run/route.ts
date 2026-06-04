// POST /api/gallery/run — one iteration of the auto news-clip loop:
//   1. Fetch latest headlines (Google News RSS), skip articles already used
//   2. Ask Qwen /llm to write a short sales-pitch script that narrates the news
//      and ties it into the seller's product
//   3. Create a project tagged product_info.source='auto-news'
// The client then fires the existing POST /api/projects/:id/render and polls
// /render-status — zero render logic duplicated here.
//
// Body: { avatar_id, language?, product?, topic?, duration_seconds? }
// Returns: { project_id, news_title, news_link, script_text }

import { NextResponse } from 'next/server'

import { DEMO_USER_ID } from '@/lib/demo-user'
import { fetchNewsSmart } from '@/lib/news'
import { pipelineFetch } from '@/lib/pipeline-client'
import { supabaseAdmin } from '@/lib/supabase-server'
import { getSystemConfig } from '@/lib/system-config-server'

type Body = {
  avatar_id?: string
  language?: string      // 'th' | 'zh' | 'en'
  product?: string       // what we're selling (free text)
  topic?: string         // optional news search keywords
  duration_seconds?: number
}

const VOICE_BY_LANG: Record<string, { voice: string; language: string }> = {
  th: { voice: 'th-TH-PremwadeeNeural', language: 'th-TH' },
  zh: { voice: 'BV001_streaming', language: 'zh-CN' },
  en: { voice: 'en-US-JennyNeural', language: 'en-US' },
}

const LANG_WORD: Record<string, string> = { th: 'ภาษาไทย', zh: '中文', en: 'English' }

export async function POST(request: Request) {
  let body: Body = {}
  try { body = (await request.json()) as Body } catch { /* defaults below */ }

  if (!body.avatar_id) {
    return NextResponse.json({ error: 'avatar_id is required' }, { status: 400 })
  }
  const lang = ['th', 'zh', 'en'].includes(body.language ?? '') ? (body.language as string) : 'th'
  const duration = Math.max(10, Math.min(Number(body.duration_seconds) || 45, 300))

  // ── 1. news (Brave API when key set, else Google News RSS) ────────────────
  let articles
  try {
    const cfg = await getSystemConfig()
    ;({ articles } = await fetchNewsSmart(lang, body.topic?.trim() || undefined, cfg.brave_api_key))
  } catch (err) {
    return NextResponse.json({ error: `news fetch failed: ${err instanceof Error ? err.message : String(err)}` }, { status: 502 })
  }
  if (!articles.length) {
    return NextResponse.json({ error: 'no news articles found' }, { status: 404 })
  }

  // skip headlines already turned into clips (dedup on product_url = news link)
  const links = articles.map((a) => a.link)
  const { data: used } = await supabaseAdmin
    .from('projects')
    .select('product_url')
    .eq('user_id', DEMO_USER_ID)
    .in('product_url', links)
  const usedSet = new Set((used ?? []).map((r: { product_url: string | null }) => r.product_url))
  const article = articles.find((a) => !usedSet.has(a.link))
  if (!article) {
    return NextResponse.json({ error: 'all current headlines already used — try a different topic' }, { status: 409 })
  }

  // ── 2. script via Qwen ─────────────────────────────────────────────────────
  // ~2.5 words/sec speaking rate → keep the script matched to clip duration
  const targetWords = Math.round(duration * 2.5)
  const product = body.product?.trim() || ''
  const prompt =
    `คุณเป็นพิธีกรไลฟ์ขายของ เล่าข่าวสั้นๆ ให้น่าสนใจ แล้วเชื่อมโยงเข้ากับการขายสินค้าแบบเนียนๆ ไม่ยัดเยียด ` +
    `ตอบเป็น${LANG_WORD[lang]} ความยาวประมาณ ${targetWords} คำ พูดต่อเนื่องเป็นบทพูดเดียว ` +
    `ห้ามมีหัวข้อ ห้ามมี markdown ตอบเฉพาะบทพูด.\n\n` +
    `ข่าว: "${article.title}"` +
    (article.description ? `\nรายละเอียด: ${article.description.slice(0, 500)}` : '') +
    (product ? `\nสินค้าที่ขาย: ${product}` : '\nสินค้าที่ขาย: เลือกสินค้าที่เข้ากับข่าวนี้เอง') +
    `\n\nบทพูด:`

  const ai = await pipelineFetch('/llm', {
    method: 'POST',
    body: JSON.stringify({ prompt, max_tokens: 800 }),
  })
  if (!ai.ok) {
    const status = ai.error.kind === 'unconfigured' ? 503 : 502
    return NextResponse.json({ error: `script generation failed: ${ai.error.message}` }, { status })
  }
  const scriptText = ((ai.data as { text?: string }).text ?? '').trim()
  if (!scriptText) {
    return NextResponse.json({ error: 'LLM returned empty script' }, { status: 502 })
  }

  // ── 3. project row ─────────────────────────────────────────────────────────
  const v = VOICE_BY_LANG[lang]
  const { data: project, error } = await supabaseAdmin
    .from('projects')
    .insert({
      user_id: DEMO_USER_ID,
      name: article.title.slice(0, 120),
      avatar_id: body.avatar_id,
      product_url: article.link,
      product_info: {
        source: 'auto-news',
        title: product || article.title,
        news_title: article.title,
        news_source: article.source,
        topic: body.topic?.trim() || null,
      },
      script_segments: [{ type: 'news_pitch', text: scriptText }],
      language: v.language,
      voice: v.voice,
      speech_rate: '+0%',
      status: 'draft',
    })
    .select('id')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({
    project_id: project.id,
    news_title: article.title,
    news_link: article.link,
    script_text: scriptText,
  })
}
