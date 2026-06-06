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
        'Console: landing page, dashboard, จัดการพรีเซนเตอร์, gallery จัดหมวด+ค้นหา+player, settings, i18n EN/中文/ไทย, dark mode + ปรับ font/ขนาด/ความหนาแน่นได้',
        'พรีเซนเตอร์ต่อคน: ลบพื้นหลัง (rembg), ฉากหลังรูป/วิดีโอ, ซูมกล้อง, ย้ายตำแหน่งในเฟรม 9 จุด + ปรับขนาดตัว — พรีวิวสดก่อนเซฟ',
        'Backend: Postgres + PostgREST (Supabase-lite) + nginx gateway บน server เดียว',
        'Pipeline แยก layer ชัด: api / services / clients / gpu — งาน GPU ทั้งหมดอยู่หลัง boundary เดียว ย้าย GPU server ได้ด้วย env (GPU_BACKEND + GPU_BASE_URL)',
        'TTS: MMS-TTS ไทย + อังกฤษ code-switch — offline ทำงานในจีน | Azure Neural | edge-tts | GPT-SoVITS (pitch/อารมณ์) ต่อเข้า chain แล้ว',
        'Voice clone: OpenVoice v2 แปลงโทนเป็นเสียงพรีเซนเตอร์จากคลิปต้นฉบับ',
        'Lip-sync: Wav2Lip บน RTX 4090 — ปาก+หัวขยับจากวิดีโอ ref (HD 1080p)',
        'Render: async + progress bar, เก็บทุกเวอร์ชัน, ปรับ speed/ความยาวได้ (สูงสุด 30 นาที)',
        'Live 24 ชม.: Qwen สร้างสคริปต์ต่อเนื่องอัตโนมัติ + look-ahead 30 วิ pre-render ส่ง RTMP ไม่ขาดสาย (filler คั่นอัตโนมัติ)',
        'Live Console: ดึงคอมเมนต์ FB แบบ real-time + AI ตอบอัตโนมัติ + ให้พรีเซนเตอร์ "พูดตอบ" ในไลฟ์ได้',
        'Stream: ffmpeg → Facebook Live / TikTok / Shopee (RTMP)',
        'Status panel: monitor ทุก service + GPU/RAM/disk bars',
      ],
    },
    next: {
      title: '▢ กำลังทำ / ถัดไป',
      items: [
        'Deploy GPT-SoVITS api.py บนเครื่อง GPU แล้วเปิดใช้ใน Settings (โค้ดฝั่งระบบพร้อมแล้ว — ดู services/sovits/README.md)',
        'ตั้งโดเมนจริง + รัน deploy/scripts/enable-https.sh + ใส่ Google OAuth credentials → เปิด Login Gmail (สคริปต์/หน้า login พร้อมแล้ว)',
        'ใส่ fb_page_token + fb_live_video_id ใน Settings เพื่อใช้คอมเมนต์ไลฟ์จริง',
        'Apply migrations 0005-0006 ลง DB จริง + redeploy บน UCloud',
        'ระยะถัดไป: บัญชีผู้ใช้เต็มระบบแทน demo mode, queue ถาวร (Redis) แทน in-memory',
      ],
    },
    arch: {
      title: '◇ สถาปัตยกรรม',
      items: [
        'web (Next.js 16) :3000 — console + API gateway (lib/pipeline-client จุดเดียว)',
        'pipeline (FastAPI) :8000 — api → services → {clients, gpu, media} | /render /generate /live /gpu',
        'gpu boundary — lipsync, MMS-TTS, OpenVoice, GFPGAN, rembg, SoVITS — สลับ local/remote ต่อ capability ได้',
        'lipsync :8001 — Wav2Lip/MuseTalk GPU | sovits :9880 — GPT-SoVITS (เลือกเปิด)',
        'db (Postgres) :5432 + postgrest + gateway :8088 | qwen (ollama) :11434',
        'nginx — reverse proxy + nip.io (status/console/api) + TLS เปิดได้ด้วยสคริปต์',
      ],
    },
    note: 'ทุกอย่างรันบน UCloud GPU host เดียว — และย้ายเฉพาะส่วน GPU ไปเครื่องอื่นได้ด้วยการแก้ env อย่างเดียว (GPU_BACKEND=remote)',
  },
  en: {
    heading: 'Deploy & Roadmap Plan',
    sub: 'Current system status + what is coming next (reflects real work done)',
    done: {
      title: '✓ Done',
      items: [
        'Console: landing page, dashboard, presenter management, gallery with tabs/search/player, settings, i18n EN/中文/ไทย, dark mode + adjustable font/size/density',
        'Per-presenter: background removal (rembg), image/video backdrop, camera zoom, 9-point frame position + presenter size — live preview before save',
        'Backend: Postgres + PostgREST (Supabase-lite) + nginx gateway on a single host',
        'Pipeline split into clean layers: api / services / clients / gpu — ALL GPU work behind one boundary, swap the GPU server with env only (GPU_BACKEND + GPU_BASE_URL)',
        'TTS: MMS-TTS Thai/English code-switch (offline, China-safe) | Azure Neural | edge-tts | GPT-SoVITS (pitch/emotion) wired into the chain',
        'Voice clone: OpenVoice v2 — matches the presenter voice from the source clip',
        'Lip-sync: Wav2Lip on RTX 4090 — mouth + head motion from a reference video (HD 1080p)',
        'Render: async + progress bar, keeps every version, adjustable speed/length (up to 30 min)',
        '24/7 live: Qwen auto-generates a continuous script + 30s look-ahead pre-render → gapless RTMP (auto filler)',
        'Live Console: real-time FB comments + AI auto-reply + the presenter can SPEAK replies on stream',
        'Stream: ffmpeg → Facebook Live / TikTok / Shopee (RTMP)',
        'Status panel: monitors every service + GPU/RAM/disk bars',
      ],
    },
    next: {
      title: '▢ In progress / next',
      items: [
        'Deploy GPT-SoVITS api.py on the GPU box, then enable in Settings (system side is ready — see services/sovits/README.md)',
        'Point a real domain + run deploy/scripts/enable-https.sh + add Google OAuth credentials → enable Gmail login (script/login page ready)',
        'Set fb_page_token + fb_live_video_id in Settings for real live comments',
        'Apply migrations 0005-0006 to the production DB + redeploy on UCloud',
        'Later: full per-user accounts replacing demo mode, durable queue (Redis) replacing in-memory state',
      ],
    },
    arch: {
      title: '◇ Architecture',
      items: [
        'web (Next.js 16) :3000 — console + API gateway (single forwarder lib/pipeline-client)',
        'pipeline (FastAPI) :8000 — api → services → {clients, gpu, media} | /render /generate /live /gpu',
        'gpu boundary — lipsync, MMS-TTS, OpenVoice, GFPGAN, rembg, SoVITS — local/remote per capability',
        'lipsync :8001 — Wav2Lip/MuseTalk GPU | sovits :9880 — GPT-SoVITS (opt-in)',
        'db (Postgres) :5432 + postgrest + gateway :8088 | qwen (ollama) :11434',
        'nginx — reverse proxy + nip.io (status/console/api) + opt-in TLS via script',
      ],
    },
    note: 'Everything runs on one UCloud GPU host — and the GPU part alone can move to another box by changing env only (GPU_BACKEND=remote)',
  },
  zh: {
    heading: '部署与路线图',
    sub: '当前系统状态 + 接下来的计划（随实际进度自动更新）',
    done: {
      title: '✓ 已完成',
      items: [
        '控制台：落地页、仪表盘、数字人管理、画廊（分类/搜索/播放器）、设置、i18n EN/中文/ไทย、深色模式 + 可调字体/字号/密度',
        '每个数字人独立设置：抠像去背景（rembg）、图片/视频背景、镜头缩放、9 宫格画面位置 + 主播大小 — 保存前实时预览',
        '后端：Postgres + PostgREST（轻量 Supabase）+ nginx 网关，单机部署',
        'Pipeline 分层重构：api / services / clients / gpu — 全部 GPU 工作收口到一个边界，仅改 env 即可换 GPU 服务器（GPU_BACKEND + GPU_BASE_URL）',
        'TTS：MMS-TTS 泰英混读（离线、中国可用）| Azure Neural | edge-tts | GPT-SoVITS（音高/情感）已接入链路',
        '声音克隆：OpenVoice v2 — 还原源视频中主播的音色',
        '口型同步：RTX 4090 上的 Wav2Lip — 口型+头部动作来自参考视频（HD 1080p）',
        '渲染：异步 + 进度条、保留每个版本、可调速度/时长（最长 30 分钟）',
        '7×24 直播：Qwen 自动连续生成脚本 + 提前 30 秒预渲染 → 无缝 RTMP 推流（自动垫片防断流）',
        '直播控制台：实时拉取 FB 评论 + AI 自动回复 + 主播可在直播中"开口回答"评论',
        '推流：ffmpeg → Facebook Live / 抖音 / Shopee（RTMP）',
        '状态面板：监控所有服务 + GPU/内存/磁盘进度条',
      ],
    },
    next: {
      title: '▢ 进行中 / 下一步',
      items: [
        '在 GPU 机器上部署 GPT-SoVITS api.py 后在设置里启用（系统侧已就绪 — 见 services/sovits/README.md）',
        '配置真实域名 + 运行 deploy/scripts/enable-https.sh + 填入 Google OAuth 凭据 → 开启 Gmail 登录（脚本/登录页已就绪）',
        '在设置里填 fb_page_token + fb_live_video_id 启用真实直播评论',
        '将 migrations 0005-0006 应用到生产数据库 + 在 UCloud 重新部署',
        '后续：完整多用户账号体系替代演示模式、Redis 持久队列替代内存态',
      ],
    },
    arch: {
      title: '◇ 架构',
      items: [
        'web (Next.js 16) :3000 — 控制台 + API 网关（统一走 lib/pipeline-client）',
        'pipeline (FastAPI) :8000 — api → services → {clients, gpu, media} | /render /generate /live /gpu',
        'gpu 边界 — lipsync、MMS-TTS、OpenVoice、GFPGAN、rembg、SoVITS — 每项能力可独立切 local/remote',
        'lipsync :8001 — Wav2Lip/MuseTalk GPU | sovits :9880 — GPT-SoVITS（可选）',
        'db (Postgres) :5432 + postgrest + gateway :8088 | qwen (ollama) :11434',
        'nginx — 反向代理 + nip.io + 可用脚本一键开 TLS',
      ],
    },
    note: '全部运行在一台 UCloud GPU 主机 — GPU 部分可单独迁移到其他机器，只需改 env（GPU_BACKEND=remote）',
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

      <Block s={d.done} color="text-success" />
      <Block s={d.next} color="text-amber-600 dark:text-amber-400" />
      <Block s={d.arch} color="text-sky-600 dark:text-sky-400" />

      <div className="mt-8 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 dark:bg-amber-950/30 dark:border-amber-900 dark:text-amber-300">
        {d.note}
      </div>
    </main>
  )
}
