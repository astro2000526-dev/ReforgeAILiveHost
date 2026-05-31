// POST /api/projects/draft/script
//
// Generates a live-selling script for the wizard. Tries the LOCAL Qwen LLM
// (via the pipeline /script endpoint) first; falls back to the pre-baked
// demo-scripts.ts library if the LLM is unavailable.

import { NextResponse } from 'next/server'

import { findBestDemoScript } from '@/lib/demo-scripts'
import { pipelineFetch } from '@/lib/pipeline-client'

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
    // empty ok
  }

  const langCode = (body.language ?? 'th-TH').slice(0, 2)

  // 1) try local Qwen via pipeline /script
  const ai = await pipelineFetch('/script', {
    method: 'POST',
    body: JSON.stringify({
      product_title: body.product_title ?? '',
      selling_points: body.selling_points ?? [],
      price_now: body.price_now ?? null,
      price_original: body.price_original ?? null,
      language: langCode,
    }),
  })
  if (ai.ok) {
    const d = ai.data as { script_segments?: { type: string; text: string; duration_sec?: number }[] }
    if (d.script_segments && d.script_segments.length > 0) {
      return NextResponse.json({
        source: 'qwen',
        language: body.language ?? 'th-TH',
        script_segments: d.script_segments,
        product_info: {
          title: body.product_title ?? '',
          price_now: body.price_now,
          price_original: body.price_original,
          selling_points: body.selling_points ?? [],
        },
      })
    }
  }

  // 2) fallback to demo library
  const demo = findBestDemoScript(body.product_title ?? '', body.language)
  return NextResponse.json({
    source: 'demo',
    matched_demo: demo.productTitle,
    language: body.language ?? demo.language,
    script_segments: demo.segments,
    product_info: {
      title: body.product_title ?? demo.productTitle,
      price_now: body.price_now ?? demo.priceNow,
      price_original: body.price_original ?? demo.priceOriginal,
      selling_points: body.selling_points ?? demo.sellingPoints,
    },
  })
}
