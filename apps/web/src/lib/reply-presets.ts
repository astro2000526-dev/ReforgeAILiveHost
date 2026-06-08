// Shared helpers for AI reply presets — sanitize stored QA pairs and build the
// /llm prompt from a preset (instruction + data + QA) for a viewer comment.
// Server-side only consumers today (/api/reply-presets, /api/ai-reply) but the
// module itself is import-safe anywhere (no server-only deps).

import type { QAPair, ReplyPreset } from '@/lib/types'

// Keep only well-formed {q, a} pairs; drop blanks so the prompt stays clean.
export function sanitizeQA(input: unknown): QAPair[] {
  if (!Array.isArray(input)) return []
  return input
    .map((p) => ({
      q: typeof (p as QAPair)?.q === 'string' ? (p as QAPair).q.trim() : '',
      a: typeof (p as QAPair)?.a === 'string' ? (p as QAPair).a.trim() : '',
    }))
    .filter((p) => p.q && p.a)
}

// Build the live-host reply prompt. With no preset this reproduces the original
// /api/ai-reply behavior; with one, the preset's instruction/data/QA take over.
export function buildReplyPrompt(opts: {
  comment: string
  langWord: string
  product?: string
  preset?: Pick<ReplyPreset, 'instruction' | 'data' | 'qa'> | null
}): string {
  const { comment, langWord, product, preset } = opts
  const qa = sanitizeQA(preset?.qa)

  const persona = preset?.instruction?.trim()
    ? preset.instruction.trim()
    : 'คุณเป็นพิธีกรไลฟ์ขายของ ตอบคอมเมนต์ผู้ชมสั้นๆ สุภาพ เป็นกันเอง'

  return (
    `${persona}\n` +
    `ตอบเป็น${langWord} 1-2 ประโยค ชวนซื้อแบบไม่ยัดเยียด ` +
    `ตอบเฉพาะข้อความ ไม่ต้องมีคำอธิบาย ห้ามมี markdown.\n` +
    (product?.trim() ? `\nสินค้า: ${product.trim()}\n` : '') +
    (preset?.data?.trim() ? `\nข้อมูลสินค้า/ร้าน (ใช้ตอบให้ถูกต้อง):\n${preset.data.trim()}\n` : '') +
    (qa.length
      ? `\nคำถาม-คำตอบที่กำหนดไว้ (ถ้าคอมเมนต์ตรงหรือใกล้เคียงข้อไหน ให้ยึดคำตอบข้อนั้น):\n` +
        qa.map((p) => `Q: ${p.q}\nA: ${p.a}`).join('\n') + '\n'
      : '') +
    `\nคอมเมนต์: "${comment}"\nตอบ:`
  )
}
