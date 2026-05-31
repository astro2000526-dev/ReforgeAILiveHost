import Link from 'next/link'
import { getLocale } from '@/lib/locale-server'
import { translate, type Locale } from '@/lib/i18n'

export const dynamic = 'force-dynamic'

type Section = { title: string; items: string[] }
type Doc = { heading: string; sub: string; done: Section; next: Section; arch: Section; note: string }

const CONTENT: Record<Locale, Doc> = {
  th: {
    heading: 'แผน Deploy & Roadmap',
    sub: 'สถานะระบบปัจจุบัน + สิ่งที่กำลังจะทำ (อัปเดตอัตโนมัติตามงานจริง)',
    done: {
      title: '✓ ทำเสร็จแล้ว',
      items: [
        'Console: dashboard, จัดการพรีเซนเตอร์ (อัปโหลด/แก้ไข/บีบอัด), settings, i18n EN/中文/ไทย, dark mode',
        'Backend: Postgres + PostgREST (Supabase-lite) + nginx gateway บน server เดียว',
        'TTS: MMS-TTS ไทย + อังกฤษ code-switch (อ่านไทยปนอังกฤษได้) — offline ทำงานในจีน',
        'Voice clone: OpenVoice v2 แปลงโทนเป็นเสียงพรีเซนเตอร์จากคลิปต้นฉบับ',
        'Lip-sync: Wav2Lip บน RTX 4090 — ปาก+หัวขยับจากวิดีโอ ref (HD 1080p)',
        'Render: async + progress bar, เก็บทุกเวอร์ชัน (version history), ปรับ speed/ความยาวได้ (สูงสุด 30 นาที)',
        'Stream: ffmpeg → Facebook Live / TikTok / Shopee (RTMP)',
        'Status panel: monitor ทุก service + GPU/RAM/disk bars',
      ],
    },
    next: {
      title: '▢ กำลังทำ / ถัดไป',
      items: [
        'Qwen LLM (ollama) — auto-generate script ต่อเนื่องสำหรับ live 24 ชม.',
        'Live: ดึงคอมเมนต์ + AI ตอบอัตโนมัติ',
        'Live look-ahead 30 วินาที — render ล่วงหน้าแล้วส่งออกต่อเนื่องเป็นธรรมชาติ',
        'TTS คุณภาพสูงขึ้น (GPT-SoVITS) + ปรับ pitch/อารมณ์',
        'HTTPS + โดเมนจริง → ตามด้วย Login Gmail (Google OAuth)',
      ],
    },
    arch: {
      title: '◇ สถาปัตยกรรม',
      items: [
        'web (Next.js 16) :3000 — console + API gateway',
        'pipeline (FastAPI) :8000 — TTS → clone → ffmpeg, สั่ง lipsync + stream',
        'lipsync (ai-live-bot) :8001 — Wav2Lip GPU',
        'db (Postgres) :5432 + postgrest :3001 + gateway :8088',
        'qwen (ollama) :11434 — LLM script gen',
        'nginx — reverse proxy + nip.io (status/console/api)',
      ],
    },
    note: 'ทุกอย่างรันบน UCloud GPU host เดียว (จีน) — ใช้ hf-mirror + offline models เลี่ยงข้อจำกัดเครือข่าย',
  },
  en: {
    heading: 'Deploy & Roadmap Plan',
    sub: 'Current system status + what is coming next (reflects real work done)',
    done: {
      title: '✓ Done',
      items: [
        'Console: dashboard, presenter management (upload/edit/compress), settings, i18n EN/中文/ไทย, dark mode',
        'Backend: Postgres + PostgREST (Supabase-lite) + nginx gateway on a single host',
        'TTS: MMS-TTS Thai + English code-switch (reads mixed Thai/English) — offline, works in China',
        'Voice clone: OpenVoice v2 — matches the presenter voice from the source clip',
        'Lip-sync: Wav2Lip on RTX 4090 — mouth + head motion from a reference video (HD 1080p)',
        'Render: async + progress bar, keeps every version (history), adjustable speed/length (up to 30 min)',
        'Stream: ffmpeg → Facebook Live / TikTok / Shopee (RTMP)',
        'Status panel: monitors every service + GPU/RAM/disk bars',
      ],
    },
    next: {
      title: '▢ In progress / next',
      items: [
        'Qwen LLM (ollama) — auto-generate continuous script for 24/7 live',
        'Live: pull comments + AI auto-reply',
        'Live 30s look-ahead — pre-render and emit continuously for a natural feel',
        'Higher-quality TTS (GPT-SoVITS) + pitch/emotion control',
        'HTTPS + real domain → then Gmail login (Google OAuth)',
      ],
    },
    arch: {
      title: '◇ Architecture',
      items: [
        'web (Next.js 16) :3000 — console + API gateway',
        'pipeline (FastAPI) :8000 — TTS → clone → ffmpeg, drives lipsync + stream',
        'lipsync (ai-live-bot) :8001 — Wav2Lip GPU',
        'db (Postgres) :5432 + postgrest :3001 + gateway :8088',
        'qwen (ollama) :11434 — LLM script gen',
        'nginx — reverse proxy + nip.io (status/console/api)',
      ],
    },
    note: 'Everything runs on one UCloud GPU host (China) — uses hf-mirror + offline models to work around network limits',
  },
  zh: {
    heading: '部署与路线图',
    sub: '当前系统状态 + 接下来的计划（随实际进度自动更新）',
    done: {
      title: '✓ 已完成',
      items: [
        '控制台：仪表盘、数字人管理（上传/编辑/压缩）、设置、i18n EN/中文/ไทย、深色模式',
        '后端：Postgres + PostgREST（轻量 Supabase）+ nginx 网关，单机部署',
        'TTS：MMS-TTS 泰语 + 英语混读 — 离线、可在中国运行',
        '声音克隆：OpenVoice v2 — 还原源视频中主播的音色',
        '口型同步：RTX 4090 上的 Wav2Lip — 口型+头部动作来自参考视频（HD 1080p）',
        '渲染：异步 + 进度条、保留每个版本、可调速度/时长（最长 30 分钟）',
        '推流：ffmpeg → Facebook Live / 抖音 / Shopee（RTMP）',
        '状态面板：监控所有服务 + GPU/内存/磁盘进度条',
      ],
    },
    next: {
      title: '▢ 进行中 / 下一步',
      items: [
        'Qwen LLM（ollama）— 为 7×24 直播自动生成连续脚本',
        '直播：拉取评论 + AI 自动回复',
        '直播提前 30 秒预渲染 — 连续自然输出',
        '更高质量 TTS（GPT-SoVITS）+ 音高/情感控制',
        'HTTPS + 真实域名 → 然后 Gmail 登录（Google OAuth）',
      ],
    },
    arch: {
      title: '◇ 架构',
      items: [
        'web (Next.js 16) :3000 — 控制台 + API 网关',
        'pipeline (FastAPI) :8000 — TTS → 克隆 → ffmpeg，驱动口型+推流',
        'lipsync (ai-live-bot) :8001 — Wav2Lip GPU',
        'db (Postgres) :5432 + postgrest :3001 + gateway :8088',
        'qwen (ollama) :11434 — LLM 脚本生成',
        'nginx — 反向代理 + nip.io',
      ],
    },
    note: '全部运行在一台 UCloud GPU 主机（中国）— 用 hf-mirror + 离线模型规避网络限制',
  },
}

function Block({ s, color }: { s: Section; color: string }) {
  return (
    <section className="mt-6">
      <h2 className={`text-sm font-semibold ${color}`}>{s.title}</h2>
      <ul className="mt-2 space-y-1.5 text-sm text-muted-foreground list-disc pl-5">
        {s.items.map((it, i) => <li key={i}>{it}</li>)}
      </ul>
    </section>
  )
}

export default async function PlanPage() {
  const locale = await getLocale()
  const t = (k: string) => translate(locale, k)
  const d = CONTENT[locale] ?? CONTENT.en

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <Link href="/dashboard" className="text-xs font-mono uppercase tracking-widest text-muted-foreground hover:text-foreground">
        {t('common.back')}
      </Link>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">{d.heading}</h1>
      <p className="mt-1 text-sm text-muted-foreground">{d.sub}</p>

      <Block s={d.done} color="text-emerald-600" />
      <Block s={d.next} color="text-amber-600" />
      <Block s={d.arch} color="text-sky-600" />

      <div className="mt-8 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 dark:bg-amber-950/30 dark:border-amber-900 dark:text-amber-300">
        {d.note}
      </div>
    </main>
  )
}
