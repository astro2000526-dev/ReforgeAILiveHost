'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useI18n } from '@/components/LocaleProvider'
import { KeyInput } from '@/components/KeyInput'
import type { SystemConfig } from '@/lib/system-config'
import { SYSTEM_CONFIG_DEFAULTS as DEFAULTS } from '@/lib/system-config'
import type { Appearance, AppFont, FontScale, Density } from '@/lib/appearance'
import {
  APPEARANCE_DEFAULTS,
  applyAppearance,
  loadAppearance,
  saveAppearance,
} from '@/lib/appearance'

const TH_VOICES = ['th-TH-PremwadeeNeural', 'th-TH-NiwatNeural', 'th-TH-AcharaNeural']
const ZH_VOICES = ['BV001_streaming', 'BV700_streaming', 'BV421_streaming']
const EN_VOICES = ['en-US-JennyNeural', 'en-US-GuyNeural']

// Appearance option metadata (hardcoded Thai — new strings, not via i18n).
const FONT_OPTIONS: { id: AppFont; label: string; sample: string; css: string }[] = [
  { id: 'default', label: 'มาตรฐาน', sample: 'Aa ก', css: 'var(--font-sans), sans-serif' },
  { id: 'noto', label: 'Noto Sans', sample: 'Aa ก', css: 'var(--font-heading), sans-serif' },
  { id: 'inter', label: 'Inter', sample: 'Aa', css: 'var(--font-sans), sans-serif' },
  { id: 'mono', label: 'Mono', sample: 'Aa', css: 'var(--font-mono), monospace' },
]
const FONT_SCALES: FontScale[] = [0.875, 1, 1.125, 1.25]
const DENSITY_OPTIONS: { id: Density; label: string }[] = [
  { id: 'compact', label: 'แน่น' },
  { id: 'normal', label: 'ปกติ' },
  { id: 'relaxed', label: 'โปร่ง' },
]

export default function SettingsPage() {
  const { t } = useI18n()
  const [cfg, setCfg] = useState<SystemConfig>(DEFAULTS)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<string | null>(null)
  // Appearance lives in localStorage (per-device). Lazy-init reads it once on the
  // client; the inline script in layout.tsx already applied it to the DOM pre-paint,
  // so this only drives the controls' selected state.
  const [appearance, setAppearance] = useState<Appearance>(loadAppearance)

  function updateAppearance(next: Appearance) {
    setAppearance(next)
    saveAppearance(next)
    applyAppearance(next)
  }
  function resetAppearance() {
    updateAppearance(APPEARANCE_DEFAULTS)
  }

  useEffect(() => {
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), 6000)
    fetch('/api/config', { signal: ctrl.signal })
      .then(r => r.json())
      .then(d => { setCfg({ ...DEFAULTS, ...(d.config ?? {}) }) })  // merge: a legacy/partial row must not leave fields undefined (e.g. playback_speed.toFixed)
      .catch(() => {/* use defaults on timeout */})
      .finally(() => { clearTimeout(t); setLoading(false) })
    return () => { clearTimeout(t); ctrl.abort() }
  }, [])

  async function save() {
    setSaving(true); setSaved(false); setError(null)
    try {
      const r = await fetch('/api/config', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cfg) })
      const d = (await r.json()) as { config?: SystemConfig; error?: string }
      if (!r.ok) throw new Error(d.error ?? `HTTP ${r.status}`)
      setCfg(d.config ?? cfg)
      setSaved(true); setTimeout(() => setSaved(false), 3000)
    } catch (err) { setError(err instanceof Error ? err.message : String(err)) }
    finally { setSaving(false) }
  }

  async function testLipsync() {
    setTesting(true); setTestResult(null)
    try {
      const r = await fetch('/api/system/lipsync-health')
      const d = (await r.json().catch(() => ({}))) as { ok?: boolean; status?: number; error?: string }
      setTestResult(d.ok ? `✓ connected · ${JSON.stringify(d)}` : `✗ HTTP ${d.status ?? r.status}`)
    } catch (err) {
      setTestResult(`✗ unreachable — ${err instanceof Error ? err.message : String(err)}`)
    } finally { setTesting(false) }
  }

  if (loading) return <main className="mx-auto max-w-2xl px-6 py-12"><p className="text-muted-foreground">{t('common.loading')}</p></main>

  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <header className="mb-8">
        <Link href="/dashboard" className="text-xs font-mono uppercase tracking-widest text-muted-foreground hover:text-foreground">{t('common.back')}</Link>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">{t('set.title')}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t('set.subtitle')}</p>
      </header>

      <div className="space-y-8">
        {/* ── Appearance (per-device, localStorage — no DB) ────────────── */}
        <section className="rounded-lg border p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">การแสดงผล</h2>
            <button type="button" onClick={resetAppearance}
              className="text-xs text-muted-foreground hover:text-foreground underline">
              รีเซ็ตค่าเริ่มต้น
            </button>
          </div>
          <p className="text-xs text-muted-foreground">เก็บในเครื่องนี้ (localStorage) — ไม่ถูกบันทึกลงเซิร์ฟเวอร์</p>

          {/* Font family */}
          <div className="space-y-2">
            <Label>แบบอักษร</Label>
            <div className="grid grid-cols-4 gap-2">
              {FONT_OPTIONS.map(f => (
                <button key={f.id} type="button"
                  onClick={() => updateAppearance({ ...appearance, font: f.id })}
                  className={`rounded-md border px-2 py-3 text-center transition-colors ${appearance.font === f.id ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/40'}`}>
                  <span className="block text-lg leading-none" style={{ fontFamily: f.css }}>{f.sample}</span>
                  <span className="mt-1.5 block text-[11px] text-muted-foreground">{f.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Font size */}
          <div className="space-y-2">
            <Label>ขนาดตัวอักษร — {Math.round(appearance.fontScale * 100)}%</Label>
            <div className="grid grid-cols-4 gap-2">
              {FONT_SCALES.map(s => (
                <button key={s} type="button"
                  onClick={() => updateAppearance({ ...appearance, fontScale: s })}
                  className={`rounded-md border px-3 py-2 text-sm transition-colors ${appearance.fontScale === s ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/40'}`}>
                  {Math.round(s * 100)}%
                </button>
              ))}
            </div>
          </div>

          {/* Padding density */}
          <div className="space-y-2">
            <Label>ความหนาแน่น (ระยะขอบ)</Label>
            <div className="grid grid-cols-3 gap-2">
              {DENSITY_OPTIONS.map(d => (
                <button key={d.id} type="button"
                  onClick={() => updateAppearance({ ...appearance, density: d.id })}
                  className={`rounded-md border px-3 py-2 text-sm transition-colors ${appearance.density === d.id ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/40'}`}>
                  {d.label}
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* ── Render Mode ─────────────────────────────────────────────── */}
        <section className="rounded-lg border p-5 space-y-4">
          <h2 className="font-semibold">{t('set.render.title')}</h2>
          <div className="grid grid-cols-2 gap-3">
            {(['loop', 'ai'] as const).map(m => (
              <button key={m} type="button" onClick={() => setCfg(p => ({ ...p, render_mode: m }))}
                className={`rounded-lg border p-3 text-left transition-colors hover:bg-muted/40 ${cfg.render_mode === m ? 'border-primary ring-2 ring-primary/30' : 'border-border'}`}>
                <p className="text-sm font-medium">{m === 'loop' ? t('set.render.loop') : t('set.render.ai')}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {m === 'loop' ? t('set.render.loopDesc') : t('set.render.aiDesc')}
                </p>
              </button>
            ))}
          </div>
        </section>

        {/* ── TTS ─────────────────────────────────────────────────────── */}
        <section className="rounded-lg border p-5 space-y-4">
          <h2 className="font-semibold">{t('set.tts.title')}</h2>
          <div className="grid grid-cols-3 gap-2">
            {(['edge-tts', 'azure', 'volcengine'] as const).map(p => (
              <button key={p} type="button" onClick={() => setCfg(c => ({ ...c, tts_provider: p }))}
                className={`rounded-md border px-3 py-2 text-xs font-medium transition-colors ${cfg.tts_provider === p ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/40'}`}>
                {p === 'edge-tts' ? t('set.tts.edge') : p === 'azure' ? t('set.tts.azure') : t('set.tts.volc')}
              </button>
            ))}
          </div>
          {cfg.tts_provider === 'edge-tts' && (
            <div className="space-y-2">
              <Label>{t('set.common.voice')}</Label>
              <select value={cfg.tts_voice} onChange={e => setCfg(p => ({ ...p, tts_voice: e.target.value }))}
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
                <optgroup label="Thai">{TH_VOICES.map(v => <option key={v} value={v}>{v}</option>)}</optgroup>
                <optgroup label="Chinese">{ZH_VOICES.map(v => <option key={v} value={v}>{v}</option>)}</optgroup>
                <optgroup label="English">{EN_VOICES.map(v => <option key={v} value={v}>{v}</option>)}</optgroup>
              </select>
              <p className="text-xs text-emerald-700">{t('set.tts.noKey')}</p>
            </div>
          )}
          {cfg.tts_provider === 'azure' && (
            <div className="space-y-3 rounded-md border border-border/70 bg-muted/30 p-3">
              <div className="space-y-1.5">
                <Label>{t('set.tts.azureKey')}</Label>
                <KeyInput placeholder={t('set.tts.azureKeyPh')}
                  changeLabel={t('set.key.change')} cancelLabel={t('set.key.cancel')}
                  value={cfg.azure_speech_key ?? ''}
                  onChange={v => setCfg(p => ({ ...p, azure_speech_key: v }))} />
                <p className="text-xs text-muted-foreground">{t('set.tts.azureKeyHint')}</p>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1.5">
                  <Label>{t('set.tts.region')}</Label>
                  <Input placeholder="eastus" value={cfg.azure_speech_region ?? 'eastus'}
                    onChange={e => setCfg(p => ({ ...p, azure_speech_region: e.target.value.trim() }))} />
                </div>
                <div className="space-y-1.5">
                  <Label>{t('set.common.voice')}</Label>
                  <select value={cfg.tts_voice} onChange={e => setCfg(p => ({ ...p, tts_voice: e.target.value }))}
                    className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
                    <option value="th-TH-PremwadeeNeural">{t('set.tts.voiceFemale')}</option>
                    <option value="th-TH-NiwatNeural">{t('set.tts.voiceMale')}</option>
                  </select>
                </div>
              </div>
              <p className="text-xs text-emerald-700">{cfg.azure_speech_key ? t('set.tts.azureSet') : t('set.tts.azureUnset')}</p>
            </div>
          )}
          {cfg.tts_provider === 'volcengine' && (
            <p className="text-xs text-amber-600">{t('set.tts.volcNote')}</p>
          )}
          <div className="space-y-2 pt-3 border-t">
            <Label>{t('set.tts.tone')}</Label>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setCfg(p => ({ ...p, voice_clone: false }))}
                className={`rounded-md border px-3 py-2 text-sm text-left transition-colors ${!cfg.voice_clone ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/40'}`}>
                {t('set.tts.original')}<br /><span className="text-xs text-muted-foreground">{t('set.tts.originalDesc')}</span>
              </button>
              <button type="button" onClick={() => setCfg(p => ({ ...p, voice_clone: true }))}
                className={`rounded-md border px-3 py-2 text-sm text-left transition-colors ${cfg.voice_clone ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/40'}`}>
                {t('set.tts.clone')}<br /><span className="text-xs text-muted-foreground">{t('set.tts.cloneDesc')}</span>
              </button>
            </div>
            <p className="text-xs text-muted-foreground">
              {cfg.voice_clone ? t('set.tts.cloneHint') : t('set.tts.originalHint')}
            </p>
          </div>
        </section>

        {/* ── GPT-SoVITS (high-quality TTS) ───────────────────────────── */}
        <section className="rounded-lg border p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-semibold">TTS คุณภาพสูง (GPT-SoVITS)</h2>
              <p className="text-xs text-muted-foreground">เสียงสมจริงกว่า ปรับระดับเสียงสูง-ต่ำ และอารมณ์ได้</p>
            </div>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" className="h-4 w-4" checked={cfg.sovits_enabled}
                onChange={e => setCfg(p => ({ ...p, sovits_enabled: e.target.checked }))} />
              เปิดใช้งาน
            </label>
          </div>
          {cfg.sovits_enabled && (
            <>
              <div className="space-y-1.5">
                <Label>URL เซิร์ฟเวอร์ SoVITS</Label>
                <Input placeholder="http://127.0.0.1:9880" value={cfg.sovits_url}
                  onChange={e => setCfg(p => ({ ...p, sovits_url: e.target.value.trim() }))} />
                <p className="text-xs text-muted-foreground">เว้นว่างไว้เพื่อใช้ค่า default ของ pipeline</p>
              </div>
              <div className="space-y-2">
                <Label>ระดับเสียง (Pitch) — {cfg.tts_pitch > 0 ? `+${cfg.tts_pitch}` : cfg.tts_pitch} semitones</Label>
                <input type="range" min={-12} max={12} step={1} value={cfg.tts_pitch}
                  onChange={e => setCfg(p => ({ ...p, tts_pitch: Number(e.target.value) }))}
                  className="w-full" />
                <p className="text-xs text-muted-foreground">ลบ = เสียงต่ำลง · บวก = เสียงสูงขึ้น</p>
              </div>
              <div className="space-y-1.5">
                <Label>อารมณ์ (Emotion)</Label>
                <Input placeholder="เช่น happy, calm, excited" value={cfg.tts_emotion}
                  onChange={e => setCfg(p => ({ ...p, tts_emotion: e.target.value }))} />
                <p className="text-xs text-muted-foreground">เว้นว่าง = โทนปกติ (best-effort ขึ้นกับโมเดล)</p>
              </div>
            </>
          )}
        </section>

        {/* ── Facebook Live (comment reading + auto-reply) ─────────────── */}
        <section className="rounded-lg border p-5 space-y-4">
          <div>
            <h2 className="text-sm font-semibold">{t('set.fb.title')}</h2>
            <p className="text-xs text-muted-foreground">
              {t('set.fb.desc')}{' '}
              <Link href="/live/fb-test" className="text-primary hover:underline">{t('set.fb.testLink')}</Link>
            </p>
            <p className="mt-1 text-xs text-amber-600">{t('set.fb.pageNote')}</p>
          </div>
          <div className="space-y-1.5">
            <Label>{t('set.fb.token')}</Label>
            <KeyInput placeholder={t('set.fb.tokenPh')}
              changeLabel={t('set.key.change')} cancelLabel={t('set.key.cancel')}
              value={cfg.fb_page_token ?? ''}
              onChange={v => setCfg(p => ({ ...p, fb_page_token: v }))} />
            <p className="text-xs text-muted-foreground">{t('set.fb.tokenHint')}</p>
          </div>
          <div className="space-y-1.5">
            <Label>{t('set.fb.videoId')}</Label>
            <Input placeholder={t('set.fb.videoIdPh')} value={cfg.fb_live_video_id ?? ''}
              onChange={e => setCfg(p => ({ ...p, fb_live_video_id: e.target.value.trim() }))} />
            <p className="text-xs text-muted-foreground">{t('set.fb.videoIdHint')}</p>
          </div>
          <p className="text-xs text-emerald-700">{cfg.fb_page_token ? t('set.fb.tokenSet') : t('set.fb.tokenUnset')}</p>
        </section>

        {/* ── News API (Brave) — gallery auto news clips ───────────────── */}
        <section className="rounded-lg border p-5 space-y-4">
          <div>
            <h2 className="text-sm font-semibold">{t('set.news.title')}</h2>
            <p className="text-xs text-muted-foreground">{t('set.news.desc')}</p>
          </div>
          <div className="space-y-1.5">
            <Label>{t('set.news.key')}</Label>
            <KeyInput placeholder={t('set.news.keyPh')}
              changeLabel={t('set.key.change')} cancelLabel={t('set.key.cancel')}
              value={cfg.brave_api_key ?? ''}
              onChange={v => setCfg(p => ({ ...p, brave_api_key: v }))} />
            <p className="text-xs text-muted-foreground">{t('set.news.keyHint')}</p>
          </div>
          <p className="text-xs text-emerald-700">{cfg.brave_api_key ? t('set.news.keySet') : t('set.news.keyUnset')}</p>
        </section>

        {/* ── Lip-sync service ─────────────────────────────────────────── */}
        <section className="rounded-lg border p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">{t('set.lip.title')}</h2>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" className="h-4 w-4" checked={cfg.lipsync_enabled}
                onChange={e => setCfg(p => ({ ...p, lipsync_enabled: e.target.checked }))} />
              {t('set.common.enable')}
            </label>
          </div>
          {cfg.lipsync_enabled && (
            <>
              <div className="grid grid-cols-3 gap-2">
                {(['mock', 'musetalk', 'wav2lip'] as const).map(m => (
                  <button key={m} type="button" onClick={() => setCfg(p => ({ ...p, lipsync_model: m }))}
                    className={`rounded-md border px-3 py-2 text-xs font-medium transition-colors ${cfg.lipsync_model === m ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/40'}`}>
                    {m === 'mock' ? t('set.lip.mock') : m === 'musetalk' ? t('set.lip.musetalk') : t('set.lip.wav2lip')}
                  </button>
                ))}
              </div>
              {cfg.lipsync_model === 'mock' && <p className="text-xs text-sky-700">{t('set.lip.mockNote')}</p>}
              {cfg.lipsync_model === 'musetalk' && <p className="text-xs text-amber-600">{t('set.lip.musetalkNote')} <code className="bg-muted px-1 rounded">bash scripts/download_models.sh</code> {t('set.lip.musetalkNote2')}</p>}
              <div className="space-y-2">
                <Label>{t('set.lip.url')}</Label>
                <div className="flex gap-2">
                  <Input value={cfg.lipsync_url} onChange={e => setCfg(p => ({ ...p, lipsync_url: e.target.value }))} />
                  <Button variant="outline" size="sm" disabled={testing} onClick={testLipsync}>
                    {testing ? '…' : t('set.common.test')}
                  </Button>
                </div>
                {testResult && <p className={`text-xs ${testResult.startsWith('✓') ? 'text-emerald-700' : 'text-red-600'}`}>{testResult}</p>}
              </div>
            </>
          )}
        </section>

        {/* ── Output (speed / quality / sound) ─────────────────────────── */}
        <section className="rounded-lg border p-5 space-y-4">
          <h2 className="font-semibold">{t('set.out.title')}</h2>
          <div className="space-y-2">
            <Label>{t('set.out.speed')} — {cfg.playback_speed.toFixed(2)}x</Label>
            <input type="range" min={0.5} max={1.5} step={0.05} value={cfg.playback_speed}
              onChange={(e) => setCfg(p => ({ ...p, playback_speed: Number(e.target.value) }))}
              className="w-full" />
            <p className="text-xs text-muted-foreground">{t('set.out.speedHint')}</p>
          </div>
          <div className="space-y-2">
            <Label>{t('set.out.quality')}</Label>
            <div className="flex gap-2">
              {(['1080p', '720p', '480p'] as const).map(q => (
                <button key={q} type="button" onClick={() => setCfg(p => ({ ...p, video_quality: q }))}
                  className={`rounded-md border px-3 py-2 text-sm transition-colors ${cfg.video_quality === q ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/40'}`}>
                  {q === '1080p' ? 'HD 1080p' : q === '720p' ? '720p' : t('set.out.q480')}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <Label>{t('set.out.sound')}</Label>
            <div className="flex gap-2">
              {(['soft', 'normal', 'boost'] as const).map(sm => (
                <button key={sm} type="button" onClick={() => setCfg(p => ({ ...p, sound_mode: sm }))}
                  className={`rounded-md border px-3 py-2 text-sm transition-colors ${cfg.sound_mode === sm ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/40'}`}>
                  {sm === 'soft' ? t('set.out.soundSoft') : sm === 'normal' ? t('set.out.soundNormal') : t('set.out.soundBoost')}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <Label>{t('set.out.lipBlend')} — {cfg.lip_blend ?? 30}%</Label>
            <input type="range" min={0} max={100} step={5} value={cfg.lip_blend ?? 30}
              onChange={(e) => setCfg(p => ({ ...p, lip_blend: Number(e.target.value) }))}
              className="w-full" />
            <p className="text-xs text-muted-foreground">{t('set.out.lipBlendHint')}</p>
          </div>
        </section>

        {/* ── Streaming defaults ───────────────────────────────────────── */}
        <section className="rounded-lg border p-5 space-y-4">
          <h2 className="font-semibold">{t('set.stream.title')}</h2>
          <div className="space-y-2">
            <Label>{t('set.stream.rtmp')}</Label>
            <Input value={cfg.default_rtmp_url} onChange={e => setCfg(p => ({ ...p, default_rtmp_url: e.target.value }))} />
          </div>
          <div className="space-y-2">
            <Label>{t('set.stream.duration')}</Label>
            <Input type="number" min={1} max={3600} value={cfg.default_duration}
              onChange={e => setCfg(p => ({ ...p, default_duration: Number(e.target.value) || 30 }))} />
          </div>
        </section>

        {error && <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div>}
        {saved && <p className="text-sm text-emerald-700">{t('set.saved')}</p>}

        <Button className="w-full" size="lg" disabled={saving} onClick={save}>
          {saving ? t('set.saving') : t('set.save')}
        </Button>
      </div>
    </main>
  )
}
