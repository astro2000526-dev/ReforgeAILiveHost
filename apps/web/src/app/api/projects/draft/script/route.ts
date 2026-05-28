// POST /api/projects/draft/script
//
// Same as POST /api/projects/[id]/script but doesn't require a project ID.
// Used by the new-project wizard at step 2 → 3, BEFORE the project row exists.
// Without this route the wizard 404s on "生成脚本" — found 2026-05-24.
//
// Demo mode: returns a pre-baked script from demo-scripts.ts based on keyword
// match against the product title + optional language filter.

import { NextResponse } from 'next/server'

import { findBestDemoScript } from '@/lib/demo-scripts'

type Body = {
  product_title?: string
  price_now?: number
  price_original?: number
  selling_points?: string[]
  language?: string
}

export async function POST(request: Request) {
  let body: Body = {}
  try {
    body = (await request.json()) as Body
  } catch {
    // Empty body is fine in demo mode — we still return a script.
  }

  const demo = findBestDemoScript(body.product_title ?? '', body.language)

  return NextResponse.json({
    source: 'demo',
    matched_demo: demo.productTitle,
    language: body.language ?? demo.language,
    script_segments: demo.segments,
    // Echo back so the client can populate its form state.
    product_info: {
      title: body.product_title ?? demo.productTitle,
      price_now: body.price_now ?? demo.priceNow,
      price_original: body.price_original ?? demo.priceOriginal,
      selling_points: body.selling_points ?? demo.sellingPoints,
    },
  })
}
