// GET /api/gallery/clips — list rendered clips.
//
// scope=news (default, BACKWARD COMPATIBLE):
//   Joins projects tagged product_info.source='auto-news' with their latest
//   finished generation. Returns newest first. Shape unchanged — gallery-loop.ts
//   and the news control panel depend on it exactly.
//
// scope=all:
//   One card per project of the demo user (any source), using its latest
//   generation. Adds project_name + source ('auto-news' | 'manual') so the
//   gallery UI can group/filter. Newest project first, limit 100.

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
  product_info: { source?: string | null; news_source?: string | null; topic?: string | null } | null
  created_at: string
  generations: GenRow[] | null
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const scope = searchParams.get('scope') === 'all' ? 'all' : 'news'

  let query = supabaseAdmin
    .from('projects')
    .select('id, name, status, product_url, product_info, created_at, generations (id, status, progress, output_video_url, created_at)')
    .eq('user_id', DEMO_USER_ID)
    .order('created_at', { ascending: false })
    .limit(100)

  if (scope === 'news') {
    query = query.eq('product_info->>source', 'auto-news')
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const rows = (data ?? []) as ProjectRow[]

  if (scope === 'news') {
    // unchanged shape — do not add fields here
    const clips = rows.map((p) => {
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

  // scope === 'all' — every project, latest generation, with grouping fields
  const clips = rows.map((p) => {
    const gens = (p.generations ?? []).slice().sort((a, b) => b.created_at.localeCompare(a.created_at))
    const done = gens.find((g) => g.status === 'done' && g.output_video_url)
    const latest = gens[0] ?? null
    return {
      project_id: p.id,
      title: p.name,
      project_name: p.name,
      source: (p.product_info?.source === 'auto-news' ? 'auto-news' : 'manual') as 'auto-news' | 'manual',
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
