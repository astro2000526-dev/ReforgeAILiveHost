// GET /api/gallery/clips — list clips produced by the auto news-clip loop.
// Joins projects tagged product_info.source='auto-news' with their latest
// finished generation. Returns newest first.

import { NextResponse } from 'next/server'

import { DEMO_USER_ID } from '@/lib/demo-user'
import { supabaseAdmin } from '@/lib/supabase-server'

type GenRow = {
  id: string
  status: string
  progress: number | null
  output_video_url: string | null
  created_at: string
}
type ProjectRow = {
  id: string
  name: string
  status: string
  product_url: string | null
  product_info: { news_source?: string | null; topic?: string | null } | null
  created_at: string
  generations: GenRow[] | null
}

export async function GET() {
  const { data, error } = await supabaseAdmin
    .from('projects')
    .select('id, name, status, product_url, product_info, created_at, generations (id, status, progress, output_video_url, created_at)')
    .eq('user_id', DEMO_USER_ID)
    .eq('product_info->>source', 'auto-news')
    .order('created_at', { ascending: false })
    .limit(100)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const clips = ((data ?? []) as ProjectRow[]).map((p) => {
    const gens = (p.generations ?? []).slice().sort((a, b) => b.created_at.localeCompare(a.created_at))
    const done = gens.find((g) => g.status === 'done' && g.output_video_url)
    const latest = gens[0] ?? null
    return {
      project_id: p.id,
      title: p.name,
      news_link: p.product_url,
      news_source: p.product_info?.news_source ?? null,
      created_at: p.created_at,
      status: done ? 'done' : latest?.status ?? p.status,
      progress: latest?.progress ?? 0,
      video_url: done?.output_video_url ?? null,
    }
  })

  return NextResponse.json({ clips })
}
