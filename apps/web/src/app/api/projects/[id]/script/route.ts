// POST /api/projects/:id/script
//
// Generates a 6-segment 直播带货 script for the given product info.
//
// MVP DEMO MODE (current): returns a pre-baked script from demo-scripts.ts
// based on keyword match against the product title. No external API call.
//
// To swap in real Claude later: replace the `findBestDemoScript` branch with
// an anthropic.messages.create() call. The response shape stays the same.
//
// Test it:
//   curl -X POST http://localhost:3000/api/projects/demo-1/script \
//        -H "Content-Type: application/json" \
//        -d '{"product_title":"烟酰胺精华","price_now":99,"price_original":199}'

import { NextResponse } from 'next/server'

import { findBestDemoScript } from '@/lib/demo-scripts'

type Body = {
  product_title?: string
  price_now?: number
  price_original?: number
  selling_points?: string[]
  language?: string
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  let body: Body = {}
  try {
    body = (await request.json()) as Body
  } catch {
    // Empty body is fine in demo mode — we'll still return a script.
  }

  const demo = findBestDemoScript(body.product_title ?? '')

  return NextResponse.json({
    project_id: id,
    source: 'demo',
    matched_demo: demo.productTitle,
    language: body.language ?? 'zh-CN',
    script_segments: demo.segments,
    // Echo back the product info the client sent so the frontend can store it.
    product_info: {
      title: body.product_title ?? demo.productTitle,
      price_now: body.price_now ?? demo.priceNow,
      price_original: body.price_original ?? demo.priceOriginal,
      selling_points: body.selling_points ?? demo.sellingPoints,
    },
  })
}
