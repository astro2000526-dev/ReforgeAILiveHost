'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import type { QAPair, ReplyPreset } from '@/lib/types'

// ── Reply Presets ─────────────────────────────────────────────────────────────
// Manage AI comment-reply presets used by the Live Console: each preset holds
// (1) instruction — persona/tone the AI must follow, (2) data — product/shop
// knowledge, (3) QA — curated question→answer pairs the AI treats as
// authoritative. The console's preset dropdown picks one per live session.
//
// Strings are hard-coded Thai by design (same as /live).

type Draft = {
  id: string | null   // null = creating new
  name: string
  instruction: string
  data: string
  qa: QAPair[]
}

const emptyDraft = (): Draft => ({ id: null, name: '', instruction: '', data: '', qa: [] })

export default function ReplyPresetsPage() {
  const [presets, setPresets] = useState<ReplyPreset[]>([])
  const [loading, setLoading] = useState(true)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function reload() {
    try {
      const r = await fetch('/api/reply-presets')
      const d = (await r.json()) as { presets?: ReplyPreset[]; error?: string }
      if (!r.ok) throw new Error(d.error ?? `HTTP ${r.status}`)
      setPresets(d.presets ?? [])
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { void (async () => { await reload() })() }, [])

  function edit(p: ReplyPreset) {
    setError(null)
    setDraft({ id: p.id, name: p.name, instruction: p.instruction, data: p.data, qa: [...(p.qa ?? [])] })
  }

  async function save() {
    if (!draft) return
    setBusy(true); setError(null)
    try {
      const qa = draft.qa.filter((p) => p.q.trim() && p.a.trim())
      const r = await fetch(draft.id ? `/api/reply-presets/${draft.id}` : '/api/reply-presets', {
        method: draft.id ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: draft.name, instruction: draft.instruction, data: draft.data, qa }),
      })
      const d = (await r.json()) as { preset?: ReplyPreset; error?: string }
      if (!r.ok) throw new Error(d.error ?? `HTTP ${r.status}`)
      setDraft(null)
      await reload()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  async function remove(id: string) {
    if (!confirm('ลบ preset นี้?')) return
    setBusy(true); setError(null)
    try {
      const r = await fetch(`/api/reply-presets/${id}`, { method: 'DELETE' })
      if (!r.ok) {
        const d = (await r.json()) as { error?: string }
        throw new Error(d.error ?? `HTTP ${r.status}`)
      }
      if (draft?.id === id) setDraft(null)
      await reload()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  // ── QA pair helpers ──
  const setQA = (i: number, patch: Partial<QAPair>) =>
    setDraft((d) => d && { ...d, qa: d.qa.map((p, j) => (j === i ? { ...p, ...patch } : p)) })
  const addQA = () => setDraft((d) => d && { ...d, qa: [...d.qa, { q: '', a: '' }] })
  const removeQA = (i: number) => setDraft((d) => d && { ...d, qa: d.qa.filter((_, j) => j !== i) })

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <Link href="/live" className="text-xs font-mono uppercase tracking-widest text-muted-foreground hover:text-foreground">← Live Console</Link>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <h1 className="text-3xl font-semibold tracking-tight">Reply Presets</h1>
        <Button className="ml-auto" disabled={busy} onClick={() => { setError(null); setDraft(emptyDraft()) }}>
          + สร้าง Preset
        </Button>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        ชุดคำสั่งให้ AI ตอบคอมเมนต์ — กำหนดบุคลิก ข้อมูลสินค้า และคำถาม-คำตอบที่ต้องตอบตาม แล้วเลือกใช้ใน Live Console
      </p>

      {error && <p className="mt-4 text-sm text-destructive">⚠ {error}</p>}

      <div className="mt-6 grid gap-5 lg:grid-cols-[320px_1fr]">
        {/* ── preset list ── */}
        <div className="lux-card rounded-2xl border bg-card p-5">
          <h2 className="text-sm font-semibold">Preset ทั้งหมด</h2>
          <div className="mt-3 space-y-2">
            {loading && <p className="text-sm text-muted-foreground">กำลังโหลด…</p>}
            {!loading && presets.length === 0 && (
              <p className="text-sm text-muted-foreground">ยังไม่มี preset — กด “+ สร้าง Preset”</p>
            )}
            {presets.map((p) => (
              <div
                key={p.id}
                className={`cursor-pointer rounded-xl border bg-background p-3 transition-colors hover:border-primary/50 ${draft?.id === p.id ? 'border-primary' : ''}`}
                onClick={() => edit(p)}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium">{p.name}</p>
                  <button
                    className="text-xs text-muted-foreground hover:text-destructive"
                    onClick={(e) => { e.stopPropagation(); void remove(p.id) }}
                  >
                    ลบ
                  </button>
                </div>
                <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                  {p.instruction || '— ไม่มีคำสั่ง —'}
                </p>
                <p className="mt-1 text-[11px] font-mono text-muted-foreground">QA {p.qa?.length ?? 0} ข้อ</p>
              </div>
            ))}
          </div>
        </div>

        {/* ── editor ── */}
        {draft ? (
          <div className="lux-card space-y-4 rounded-2xl border bg-card p-5">
            <h2 className="text-sm font-semibold">{draft.id ? 'แก้ไข Preset' : 'สร้าง Preset ใหม่'}</h2>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">ชื่อ Preset</label>
              <Input
                placeholder="เช่น ครีมบำรุงผิว — โปร 11.11"
                value={draft.name}
                onChange={(e) => setDraft((d) => d && { ...d, name: e.target.value })}
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">คำสั่ง (Instruction) — บุคลิก / โทน / กติกาการตอบ</label>
              <Textarea
                rows={4}
                placeholder={'เช่น คุณเป็นแอดมินร้านสกินแคร์ ตอบสุภาพ ลงท้าย "ค่ะ" ห้ามรับประกันผลลัพธ์ ถ้าถามราคาส่งให้ตอบว่าทักแชท'}
                value={draft.instruction}
                onChange={(e) => setDraft((d) => d && { ...d, instruction: e.target.value })}
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">ข้อมูล (Data) — สินค้า / ราคา / โปร / การจัดส่ง</label>
              <Textarea
                rows={6}
                placeholder={'เช่น\n- ครีม A ขนาด 30g ราคา 590 ลดเหลือ 390\n- ส่งฟรีเมื่อซื้อครบ 500\n- มีเก็บเงินปลายทาง'}
                value={draft.data}
                onChange={(e) => setDraft((d) => d && { ...d, data: e.target.value })}
              />
            </div>

            {/* QA pairs */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-muted-foreground">คำถาม-คำตอบ (QA) — AI จะยึดคำตอบตามนี้เมื่อคอมเมนต์ตรงกับคำถาม</label>
                <Button size="sm" variant="outline" onClick={addQA}>+ เพิ่ม QA</Button>
              </div>
              {draft.qa.length === 0 && (
                <p className="text-xs text-muted-foreground">ยังไม่มี QA — กด “+ เพิ่ม QA”</p>
              )}
              {draft.qa.map((p, i) => (
                <div key={i} className="space-y-2 rounded-xl border bg-background p-3">
                  <div className="flex items-start gap-2">
                    <span className="mt-2 text-xs font-mono text-muted-foreground">Q</span>
                    <Input
                      placeholder="เช่น ส่งกี่วันถึง"
                      value={p.q}
                      onChange={(e) => setQA(i, { q: e.target.value })}
                    />
                    <button
                      className="mt-2 text-xs text-muted-foreground hover:text-destructive"
                      onClick={() => removeQA(i)}
                    >
                      ลบ
                    </button>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="mt-2 text-xs font-mono text-muted-foreground">A</span>
                    <Textarea
                      rows={2}
                      placeholder="เช่น จัดส่งทุกวัน ได้รับภายใน 2-3 วันค่ะ"
                      value={p.a}
                      onChange={(e) => setQA(i, { a: e.target.value })}
                    />
                  </div>
                </div>
              ))}
            </div>

            <div className="flex items-center gap-3 pt-1">
              <Button disabled={busy || !draft.name.trim()} onClick={() => void save()}>
                {busy ? 'กำลังบันทึก…' : draft.id ? 'บันทึก' : 'สร้าง'}
              </Button>
              <Button variant="outline" disabled={busy} onClick={() => setDraft(null)}>ยกเลิก</Button>
            </div>
          </div>
        ) : (
          <div className="lux-card flex items-center justify-center rounded-2xl border bg-card p-10">
            <p className="text-sm text-muted-foreground">เลือก preset จากรายการ หรือกด “+ สร้าง Preset”</p>
          </div>
        )}
      </div>
    </main>
  )
}
