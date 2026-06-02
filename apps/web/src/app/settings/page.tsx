'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useI18n } from '@/components/LocaleProvider'
import type { SystemConfig } from '@/lib/system-config'
import { SYSTEM_CONFIG_DEFAULTS as DEFAULTS } from '@/lib/system-config'

const TH_VOICES = ['th-TH-PremwadeeNeural', 'th-TH-NiwatNeural', 'th-TH-AcharaNeural']
const ZH_VOICES = ['BV001_streaming', 'BV700_streaming', 'BV421_streaming']
const EN_VOICES = ['en-US-JennyNeural', 'en-US-GuyNeural']

export default function SettingsPage() {
  const { t } = useI18n()
  const [cfg, setCfg] = useState<SystemConfig>(DEFAULTS)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<string | null>(null)

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
      const r = await fetch(`${cfg.lipsync_url}/health`, { signal: AbortSignal.timeout(5000) })
      const d = (await r.json().catch(() => ({}))) as { ok?: boolean; status?: string }
      setTestResult(r.ok ? `✓ connected · ${JSON.stringify(d)}` : `✗ HTTP ${r.status}`)
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
                <Input type="password" autoComplete="off" placeholder={t('set.tts.azureKeyPh')}
                  value={cfg.azure_speech_key ?? ''}
                  onChange={e => setCfg(p => ({ ...p, azure_speech_key: e.target.value.trim() }))} />
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
            <Input type="password" autoComplete="off"
              placeholder={t('set.fb.tokenPh')}
              value={cfg.fb_page_token ?? ''}
              onChange={e => setCfg(p => ({ ...p, fb_page_token: e.target.value.trim() }))} />
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
