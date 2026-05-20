'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

type Avatar = {
  id: string
  name: string
  preview_image_url: string | null
  region: string | null
  gender: string | null
}

type Segment = {
  type: string
  text: string
  duration_sec?: number
}

const SEGMENT_LABEL: Record<string, string> = {
  intro: '开场',
  pain: '痛点',
  product: '产品介绍',
  demo: '演示',
  price: '价格',
  cta: '促单',
}

const VOICE_OPTIONS = [
  { id: 'BV001_streaming', label: '通用女声（默认）', hint: '稳重清晰，适合大多数品类' },
  { id: 'BV700_streaming', label: '灿灿（活泼）', hint: '亲和有活力，适合美妆/服饰' },
  { id: 'BV421_streaming', label: '天才少女（多语言）', hint: '兼容中文+东南亚语种' },
]

const RATE_OPTIONS = [
  { id: '-10%', label: '慢' },
  { id: '+0%', label: '正常' },
  { id: '+10%', label: '快' },
]

export default function NewProjectPage() {
  const router = useRouter()

  const [step, setStep] = useState<1 | 2 | 3 | 4>(1)
  const [avatars, setAvatars] = useState<Avatar[]>([])
  const [avatarsLoading, setAvatarsLoading] = useState(true)
  const [avatarsError, setAvatarsError] = useState<string | null>(null)
  const [avatarId, setAvatarId] = useState<string>('')

  const [productTitle, setProductTitle] = useState('')
  const [priceNow, setPriceNow] = useState('')
  const [priceOriginal, setPriceOriginal] = useState('')
  const [sellingPointsText, setSellingPointsText] = useState('')

  const [segments, setSegments] = useState<Segment[]>([])
  const [scriptLoading, setScriptLoading] = useState(false)
  const [scriptError, setScriptError] = useState<string | null>(null)

  const [projectName, setProjectName] = useState('')
  const [voice, setVoice] = useState(VOICE_OPTIONS[0].id)
  const [speechRate, setSpeechRate] = useState('+0%')

  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch('/api/avatars')
      .then(async (r) => {
        if (!r.ok) throw new Error(`加载数字人失败 (HTTP ${r.status})`)
        return r.json() as Promise<{ avatars: Avatar[] }>
      })
      .then((data) => {
        if (cancelled) return
        setAvatars(data.avatars ?? [])
        setAvatarsLoading(false)
      })
      .catch((err) => {
        if (cancelled) return
        setAvatarsError(err.message)
        setAvatarsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  async function generateScript() {
    setScriptLoading(true)
    setScriptError(null)
    try {
      const sellingPoints = sellingPointsText
        .split(/[\n,，]/)
        .map((s) => s.trim())
        .filter(Boolean)
      const r = await fetch('/api/projects/draft/script', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          product_title: productTitle,
          price_now: priceNow ? Number(priceNow) : undefined,
          price_original: priceOriginal ? Number(priceOriginal) : undefined,
          selling_points: sellingPoints.length ? sellingPoints : undefined,
          language: 'zh-CN',
        }),
      })
      if (!r.ok) throw new Error(`脚本生成失败 (HTTP ${r.status})`)
      const data = (await r.json()) as { script_segments: Segment[] }
      setSegments(data.script_segments)
      if (!projectName) setProjectName(productTitle || '未命名直播')
      setStep(3)
    } catch (err) {
      setScriptError(err instanceof Error ? err.message : String(err))
    } finally {
      setScriptLoading(false)
    }
  }

  async function saveProject() {
    setSaving(true)
    setSaveError(null)
    try {
      const sellingPoints = sellingPointsText
        .split(/[\n,，]/)
        .map((s) => s.trim())
        .filter(Boolean)
      const r = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: projectName.trim() || '未命名直播',
          avatar_id: avatarId,
          language: 'zh-CN',
          voice,
          speech_rate: speechRate,
          product_info: {
            title: productTitle,
            price_now: priceNow ? Number(priceNow) : undefined,
            price_original: priceOriginal ? Number(priceOriginal) : undefined,
            selling_points: sellingPoints,
          },
          script_segments: segments,
        }),
      })
      const data = (await r.json()) as { project?: { id: string }; error?: string }
      if (!r.ok || !data.project) throw new Error(data.error ?? `保存失败 (HTTP ${r.status})`)
      router.push(`/projects/${data.project.id}`)
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : String(err))
      setSaving(false)
    }
  }

  return (
    <main className="mx-auto max-w-4xl px-6 py-12">
      <header className="mb-8">
        <Link href="/dashboard" className="text-xs font-mono uppercase tracking-widest text-muted-foreground hover:text-foreground">
          ← 返回控制台
        </Link>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">新建直播项目</h1>
        <p className="mt-1 text-sm text-muted-foreground">4 步搞定：选人 → 填货 → 出稿 → 配音</p>
      </header>

      <Stepper current={step} />

      {step === 1 && (
        <section className="mt-8">
          <h2 className="mb-4 text-lg font-medium">第 1 步 · 选一个数字人</h2>
          {avatarsLoading ? (
            <p className="text-sm text-muted-foreground">加载中...</p>
          ) : avatarsError ? (
            <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800">{avatarsError}</div>
          ) : avatars.length === 0 ? (
            <div className="rounded-md border border-dashed p-6 text-sm text-muted-foreground">
              数据库还没有数字人。先在 Supabase 跑 0002_demo_seed.sql。
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
              {avatars.map((a) => (
                <button
                  type="button"
                  key={a.id}
                  onClick={() => setAvatarId(a.id)}
                  className={`text-left rounded-lg border p-3 transition-colors hover:bg-muted/40 ${
                    avatarId === a.id ? 'border-primary ring-2 ring-primary/30' : 'border-border'
                  }`}
                >
                  {a.preview_image_url && (
                    // placehold.co works fine with regular img tag
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={a.preview_image_url}
                      alt={a.name}
                      className="mb-3 aspect-[2/3] w-full rounded-md object-cover"
                    />
                  )}
                  <p className="text-sm font-medium">{a.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {a.region ?? '?'} · {a.gender ?? '?'}
                  </p>
                </button>
              ))}
            </div>
          )}
          <div className="mt-8 flex justify-end">
            <Button size="lg" disabled={!avatarId} onClick={() => setStep(2)}>
              下一步
            </Button>
          </div>
        </section>
      )}

      {step === 2 && (
        <section className="mt-8 space-y-5">
          <h2 className="text-lg font-medium">第 2 步 · 填商品信息</h2>
          <p className="text-sm text-muted-foreground">
            脚本生成会拿这些信息匹配文案模板。MVP 阶段是预设模板库，不调用 Claude API。
          </p>

          <div className="space-y-2">
            <Label htmlFor="title">商品标题</Label>
            <Input
              id="title"
              placeholder="例如：烟酰胺精华液 30ml"
              value={productTitle}
              onChange={(e) => setProductTitle(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="price-now">现价（元）</Label>
              <Input
                id="price-now"
                type="number"
                inputMode="numeric"
                placeholder="99"
                value={priceNow}
                onChange={(e) => setPriceNow(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="price-original">原价（元）</Label>
              <Input
                id="price-original"
                type="number"
                inputMode="numeric"
                placeholder="199"
                value={priceOriginal}
                onChange={(e) => setPriceOriginal(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="selling-points">卖点（每行一条，或用逗号隔开）</Label>
            <Textarea
              id="selling-points"
              placeholder={'5% 黄金浓度\nB5 修护\n敏感肌可用'}
              value={sellingPointsText}
              onChange={(e) => setSellingPointsText(e.target.value)}
              rows={4}
            />
          </div>

          {scriptError && (
            <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">{scriptError}</div>
          )}

          <div className="flex justify-between">
            <Button variant="ghost" onClick={() => setStep(1)}>
              ← 上一步
            </Button>
            <Button size="lg" disabled={!productTitle.trim() || scriptLoading} onClick={generateScript}>
              {scriptLoading ? '生成中...' : '生成脚本 →'}
            </Button>
          </div>
        </section>
      )}

      {step === 3 && (
        <section className="mt-8 space-y-5">
          <h2 className="text-lg font-medium">第 3 步 · 校对脚本</h2>
          <p className="text-sm text-muted-foreground">
            6 段直播带货话术，按需要直接改文字。每段约 30 秒，合计 ~3 分钟。
          </p>

          <div className="space-y-3">
            {segments.map((seg, i) => (
              <div key={i} className="rounded-lg border p-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    {SEGMENT_LABEL[seg.type] ?? seg.type}
                  </span>
                  {seg.duration_sec && (
                    <span className="text-xs text-muted-foreground">~{Math.round(seg.duration_sec)} 秒</span>
                  )}
                </div>
                <Textarea
                  value={seg.text}
                  onChange={(e) => {
                    const next = segments.slice()
                    next[i] = { ...seg, text: e.target.value }
                    setSegments(next)
                  }}
                  rows={2}
                />
              </div>
            ))}
          </div>

          <div className="flex justify-between">
            <Button variant="ghost" onClick={() => setStep(2)}>
              ← 上一步
            </Button>
            <Button size="lg" onClick={() => setStep(4)}>
              下一步 →
            </Button>
          </div>
        </section>
      )}

      {step === 4 && (
        <section className="mt-8 space-y-6">
          <h2 className="text-lg font-medium">第 4 步 · 命名 + 配音</h2>

          <div className="space-y-2">
            <Label htmlFor="project-name">项目名</Label>
            <Input
              id="project-name"
              placeholder="例如：5.20 烟酰胺直播"
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label>声音</Label>
            <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
              {VOICE_OPTIONS.map((v) => (
                <button
                  type="button"
                  key={v.id}
                  onClick={() => setVoice(v.id)}
                  className={`text-left rounded-lg border p-3 transition-colors hover:bg-muted/40 ${
                    voice === v.id ? 'border-primary ring-2 ring-primary/30' : 'border-border'
                  }`}
                >
                  <p className="text-sm font-medium">{v.label}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{v.hint}</p>
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label>语速</Label>
            <div className="flex gap-2">
              {RATE_OPTIONS.map((r) => (
                <button
                  type="button"
                  key={r.id}
                  onClick={() => setSpeechRate(r.id)}
                  className={`rounded-lg border px-4 py-2 text-sm transition-colors hover:bg-muted/40 ${
                    speechRate === r.id ? 'border-primary ring-2 ring-primary/30' : 'border-border'
                  }`}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>

          {saveError && (
            <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">{saveError}</div>
          )}

          <div className="flex justify-between">
            <Button variant="ghost" onClick={() => setStep(3)} disabled={saving}>
              ← 上一步
            </Button>
            <Button size="lg" onClick={saveProject} disabled={saving || !projectName.trim()}>
              {saving ? '保存中...' : '保存并进入项目'}
            </Button>
          </div>
        </section>
      )}
    </main>
  )
}

function Stepper({ current }: { current: 1 | 2 | 3 | 4 }) {
  const steps = ['选数字人', '填商品', '校对脚本', '命名配音']
  return (
    <ol className="flex items-center gap-2 text-xs">
      {steps.map((label, i) => {
        const n = (i + 1) as 1 | 2 | 3 | 4
        const active = n === current
        const done = n < current
        return (
          <li key={label} className="flex items-center gap-2">
            <span
              className={`flex h-6 w-6 items-center justify-center rounded-full border text-[11px] font-medium ${
                active
                  ? 'border-primary bg-primary text-primary-foreground'
                  : done
                    ? 'border-primary/40 bg-primary/10 text-primary'
                    : 'border-border bg-background text-muted-foreground'
              }`}
            >
              {n}
            </span>
            <span className={active ? 'font-medium' : 'text-muted-foreground'}>{label}</span>
            {i < steps.length - 1 && <span className="text-muted-foreground">›</span>}
          </li>
        )
      })}
    </ol>
  )
}
