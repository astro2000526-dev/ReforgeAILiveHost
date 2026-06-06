import Link from "next/link";
import { Fraunces, JetBrains_Mono } from "next/font/google";
import {
  ArrowRight,
  Clapperboard,
  Eraser,
  Film,
  Languages,
  MessageSquare,
  Mic,
  Play,
  Radio,
  Sparkles,
  Upload,
  Wand2,
} from "lucide-react";

import { getLocale } from "@/lib/locale-server";
import type { Locale } from "@/lib/i18n";

import styles from "./_landing/landing.module.css";
import { CursorGlow } from "./_landing/CursorGlow";
import { Reveal } from "./_landing/Reveal";
import { ScrollProgress } from "./_landing/ScrollProgress";

export const dynamic = "force-dynamic";

// ─────────────────────────────────────────────────────────────────────────────
// Landing page — Reforge AI Live (AI digital presenter for live commerce)
//
// Visual language re-interpreted from the reforgeai.net reference design:
//   · dark navy "ink" canvas + gold accents (scoped in _landing/landing.module.css)
//   · Fraunces (italic) serif display + JetBrains Mono mono, Inter body
//   · cursor-follow gold glow, gold scroll-progress bar, reveal-on-scroll,
//     gold gradient headlines, shimmer logo mark, hover glow on cards/CTAs
//
// 3 locales (th/en/zh) via getLocale() — switched by the language buttons in the
// global AppHeader (same as /plan). The landing sits UNDER AppHeader as its own
// full-bleed dark canvas; it does NOT render a second nav.
// ─────────────────────────────────────────────────────────────────────────────

// Fonts loaded only for this page (next/font is allowed in a page component).
const fraunces = Fraunces({
  subsets: ["latin"],
  weight: ["300", "400", "500"],
  style: ["normal", "italic"],
  variable: "--font-fraunces",
  display: "swap",
});
const jetbrains = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-jetbrains",
  display: "swap",
});

// รูปตัวอย่างจากเน็ต — แก้ง่าย: เปลี่ยน URL ในบล็อกนี้ได้เลย
// ใช้ placehold.co โทน ink/gold (พื้นกรมท่าเข้ม + ตัวอักษรทอง) ให้เข้าธีมใหม่
// ถ้าจะใช้รูปจริง วางลิงก์ตรงนี้ได้เลย (เป็น <img> ธรรมดา ไม่ต้องแก้ next.config)
const IMAGES = {
  // ภาพ hero — จอมือถือ/พรีเซนเตอร์กำลังไลฟ์ — เปลี่ยน URL ตรงนี้
  hero: "https://placehold.co/900x1200/050f24/d4a24c?text=AI+Live+Host",
  // ภาพ preview 1 — หน้าจอคอนโซลสร้างโปรเจกต์ — เปลี่ยน URL ตรงนี้
  previewConsole: "https://placehold.co/1200x750/050f24/d4a24c?text=Console",
  // ภาพ preview 2 — พรีเซนเตอร์ลิปซิงค์ระหว่างไลฟ์ — เปลี่ยน URL ตรงนี้
  previewPresenter: "https://placehold.co/1200x750/0a1a36/e8c074?text=Live+Presenter",
  // ภาพ preview 3 — แกลเลอรีคลิปที่เรนเดอร์เสร็จ — เปลี่ยน URL ตรงนี้
  previewGallery: "https://placehold.co/1200x750/050f24/f5dda0?text=Clip+Gallery",
} as const;

type IconType = React.ComponentType<{ className?: string }>;
type Copy = {
  badge: string;
  h1a: string;
  h1b: string;
  sub: string;
  ctaStart: string;
  ctaGallery: string;
  heroAlt: string;
  liveTag: string;
  chatLabel: string;
  chatQ: string;
  chatA: string;
  trustLabel: string;
  stats: { v: string; k: string }[];
  featEyebrow: string;
  featH2: string;
  featSub: string;
  features: { eyebrow: string; title: string; body: string }[];
  stepEyebrow: string;
  stepH2: string;
  steps: { t: string; d: string }[];
  prevEyebrow: string;
  prevH2: string;
  previews: { alt: string; caption: string }[];
  voiceEyebrow: string;
  voiceH2: string;
  voiceSub: string;
  chips: string[];
  ctaEyebrow: string;
  finalA: string;
  finalB: string;
  finalNote: string;
  footer: string;
};

const COPY: Record<Locale, Copy> = {
  th: {
    badge: "พรีเซนเตอร์ AI · ไลฟ์ขายอัตโนมัติ",
    h1a: "พิธีกรดิจิทัล",
    h1b: "ที่ไลฟ์ขายแทนคุณ ทั้งวันทั้งคืน",
    sub: "สร้างพรีเซนเตอร์ AI พูดไทย-อังกฤษ-จีน ลิปซิงค์เนียน เขียนสคริปต์เอง ตอบคอมเมนต์เอง — ไม่ต้องมีสตูดิโอ ไม่ต้องจ้างพิธีกร เปิดไลฟ์ได้ 24 ชั่วโมง",
    ctaStart: "เริ่มใช้งาน",
    ctaGallery: "ดูแกลเลอรีคลิป",
    heroAlt: "พรีเซนเตอร์ AI กำลังไลฟ์ขายของ",
    liveTag: "ไลฟ์สด",
    chatLabel: "AI · ตอบอัตโนมัติ",
    chatQ: "ไซส์ L มีไหมคะ",
    chatA: "มีค่ะ ส่งฟรีทั้งร้านวันนี้",
    trustLabel: "/ เทคโนโลยีเบื้องหลังพิธีกร AI ของเรา /",
    stats: [
      { v: "24/7", k: "ไลฟ์ไม่มีหยุด" },
      { v: "Full HD", k: "ภาพคมระดับ 1080p" },
      { v: "3 ภาษา", k: "ไทย · English · 中文" },
      { v: "< 1 นาที", k: "ต่อการเรนเดอร์" },
    ],
    featEyebrow: "ความสามารถ",
    featH2: "ทุกอย่างที่ร้านไลฟ์ต้องมี ในที่เดียว",
    featSub: "ตั้งแต่สร้างพรีเซนเตอร์ ใส่เสียง ไปจนถึงดันสตรีมขึ้นไลฟ์และตอบลูกค้า — ครบจบในแพลตฟอร์มเดียว",
    features: [
      { eyebrow: "ดิจิทัลฮิวแมน", title: "พรีเซนเตอร์ AI ลิปซิงค์", body: "อัปโหลดวิดีโอตัวเองหรือเลือกพรีเซนเตอร์จากคลัง ระบบขยับปากตามเสียงแบบเนียนระดับ HD ปรับความเนียนของขอบได้" },
      { eyebrow: "เสียงหลายภาษา", title: "TTS ไทย · จีน · อังกฤษ", body: "เสียง Azure Neural คุณภาพสตูดิโอ พูดไทยชัด สลับอังกฤษได้ในประโยคเดียว รองรับจีนด้วย Volcengine และโคลนเสียงต้นฉบับ" },
      { eyebrow: "ฉากหลัง", title: "ลบพื้นหลัง / เปลี่ยนฉาก", body: "ตัดพื้นหลังออกอัตโนมัติแล้วใส่ฉากใหม่ให้เข้ากับแบรนด์ ย้ายตำแหน่ง-ย่อขยายตัวพรีเซนเตอร์ได้ ไม่ต้องมีกรีนสกรีน" },
      { eyebrow: "ไลฟ์อัตโนมัติ", title: "ไลฟ์ 24/7 ส่งตรง RTMP", body: "ดันสตรีมตรงเข้า Facebook / Shopee Live ผ่าน RTMP เปิดทิ้งไว้ได้ทั้งวันทั้งคืน ไม่ต้องเฝ้าหน้าจอ ไม่ต้องจ้างพิธีกร" },
      { eyebrow: "สมอง AI", title: "ตอบคอมเมนต์อัตโนมัติ", body: "ให้ AI ร่างสคริปต์ขายของและตอบคอมเมนต์ผู้ชมแบบเรียลไทม์ระหว่างไลฟ์ — พิมพ์ตอบหรือพูดตอบในไลฟ์ก็ได้" },
      { eyebrow: "คลังคลิป", title: "แกลเลอรีคลิปอัตโนมัติ", body: "โรงงานผลิตคลิปข่าว/โปรโมตที่เดินเครื่องเองฝั่งเซิร์ฟเวอร์ กดสตาร์ตแล้วปิดแท็บได้ คลิปไหลออกมาเรื่อย ๆ" },
    ],
    stepEyebrow: "เริ่มต้นง่าย",
    stepH2: "เริ่มได้ใน 3 ขั้นตอน",
    steps: [
      { t: "เลือกพรีเซนเตอร์", d: "อัปโหลดรูป/วิดีโอ หรือเลือกจากคลังพรีเซนเตอร์ที่มีให้" },
      { t: "ใส่สคริปต์ หรือให้ AI เขียน", d: "พิมพ์สคริปต์ขายเอง หรือกดให้ AI ร่างให้ในคลิกเดียว" },
      { t: "กดไลฟ์", d: "ส่งตรงเข้า Facebook / Shopee Live ผ่าน RTMP ทันที" },
    ],
    prevEyebrow: "หน้าตาการใช้งาน",
    prevH2: "จากคอนโซลถึงหน้าไลฟ์ ในไม่กี่คลิก",
    previews: [
      { alt: "หน้าจอคอนโซลสร้างโปรเจกต์", caption: "คอนโซลสร้างโปรเจกต์" },
      { alt: "พรีเซนเตอร์ AI ลิปซิงค์ระหว่างไลฟ์", caption: "พรีเซนเตอร์ไลฟ์สด" },
      { alt: "แกลเลอรีคลิปที่เรนเดอร์เสร็จ", caption: "แกลเลอรีคลิป" },
    ],
    voiceEyebrow: "เสียง",
    voiceH2: "เสียงที่ลูกค้าอยากฟัง",
    voiceSub: "เลือกใช้เสียง Azure Neural ระดับสตูดิโอ หรือโคลนโทนเสียงจากคลิปต้นฉบับให้เหมือนตัวจริง รองรับการอ่านสลับไทย-อังกฤษ-จีนอย่างเป็นธรรมชาติ",
    chips: ["หญิง — Premwadee", "ชาย — Niwat", "โคลนเสียงต้นฉบับ", "ไทย + English + 中文"],
    ctaEyebrow: "พร้อมเริ่มแล้ว",
    finalA: "พร้อมเปิดร้านไลฟ์ ",
    finalB: "ที่ไม่ต้องนอน?",
    finalNote: "ไม่ต้องติดตั้งอะไร เปิดใช้งานบนเบราว์เซอร์ได้ทันที",
    footer: "Reforge AI Live — พิธีกรดิจิทัลสำหรับไลฟ์คอมเมิร์ซ",
  },
  en: {
    badge: "AI presenter · automated live selling",
    h1a: "A digital host",
    h1b: "that sells live for you, day and night",
    sub: "Create an AI presenter that speaks Thai, English and Chinese with seamless lip-sync, writes its own script and answers comments — no studio, no host to hire, live 24 hours a day.",
    ctaStart: "Get started",
    ctaGallery: "View clip gallery",
    heroAlt: "AI presenter selling on a live stream",
    liveTag: "Live",
    chatLabel: "AI · auto-reply",
    chatQ: "Do you have size L?",
    chatA: "Yes! Free shipping store-wide today",
    trustLabel: "/ The technology behind our AI presenter /",
    stats: [
      { v: "24/7", k: "non-stop live" },
      { v: "Full HD", k: "crisp 1080p video" },
      { v: "3 languages", k: "ไทย · English · 中文" },
      { v: "< 1 min", k: "per render" },
    ],
    featEyebrow: "Capabilities",
    featH2: "Everything a live shop needs, in one place",
    featSub: "From creating the presenter and the voice to pushing the stream live and replying to customers — one platform does it all.",
    features: [
      { eyebrow: "Digital human", title: "Lip-synced AI presenter", body: "Upload your own video or pick a presenter from the library. Mouths move with the audio in clean HD, with adjustable edge blending." },
      { eyebrow: "Multilingual voice", title: "TTS in Thai · Chinese · English", body: "Studio-grade Azure Neural voices, fluent Thai with mid-sentence English, Chinese via Volcengine, plus original-voice cloning." },
      { eyebrow: "Backdrop", title: "Remove / replace the background", body: "Auto-cut the background and drop in an on-brand scene. Reposition and resize the presenter in the frame — no green screen needed." },
      { eyebrow: "Automated live", title: "24/7 live straight to RTMP", body: "Push the stream into Facebook / Shopee Live over RTMP. Leave it running day and night — no babysitting, no host fees." },
      { eyebrow: "AI brain", title: "Auto-reply to comments", body: "Let AI draft the sales script and answer viewer comments in real time — typed back, or spoken out loud on the stream." },
      { eyebrow: "Clip library", title: "Automatic clip gallery", body: "A server-side clip factory for news/promo videos. Hit start, close the tab — clips keep flowing out on their own." },
    ],
    stepEyebrow: "Easy start",
    stepH2: "Up and running in 3 steps",
    steps: [
      { t: "Pick a presenter", d: "Upload a photo/video or choose one from the presenter library." },
      { t: "Add a script, or let AI write it", d: "Type your own pitch, or have AI draft one in a single click." },
      { t: "Go live", d: "Push straight to Facebook / Shopee Live over RTMP." },
    ],
    prevEyebrow: "What it looks like",
    prevH2: "From console to live stream in a few clicks",
    previews: [
      { alt: "Project console screen", caption: "Project console" },
      { alt: "AI presenter lip-syncing on a live stream", caption: "Live presenter" },
      { alt: "Gallery of rendered clips", caption: "Clip gallery" },
    ],
    voiceEyebrow: "Voice",
    voiceH2: "A voice customers want to hear",
    voiceSub: "Use studio-grade Azure Neural voices, or clone the tone from an original clip so it sounds like the real person. Reads mixed Thai-English-Chinese naturally.",
    chips: ["Female — Premwadee", "Male — Niwat", "Original-voice clone", "ไทย + English + 中文"],
    ctaEyebrow: "Ready when you are",
    finalA: "Ready to open a live shop ",
    finalB: "that never sleeps?",
    finalNote: "Nothing to install — runs in the browser right away.",
    footer: "Reforge AI Live — the digital host for live commerce",
  },
  zh: {
    badge: "AI 数字人 · 自动直播带货",
    h1a: "一位数字主播",
    h1b: "替你日夜不停地直播带货",
    sub: "创建会说泰语、英语、中文的 AI 数字人:口型自然、自动写脚本、自动回复评论 — 不需要影棚、不用请主播,7×24 小时开播。",
    ctaStart: "开始使用",
    ctaGallery: "查看视频画廊",
    heroAlt: "AI 数字人正在直播带货",
    liveTag: "直播中",
    chatLabel: "AI · 自动回复",
    chatQ: "有 L 码吗?",
    chatA: "有的!今天全店包邮",
    trustLabel: "/ 支撑我们 AI 主播的核心技术 /",
    stats: [
      { v: "24/7", k: "不间断直播" },
      { v: "Full HD", k: "1080p 高清画质" },
      { v: "3 种语言", k: "ไทย · English · 中文" },
      { v: "< 1 分钟", k: "单次渲染" },
    ],
    featEyebrow: "核心能力",
    featH2: "直播间需要的一切,都在这里",
    featSub: "从创建数字人、配音,到推流开播和回复顾客 — 一个平台全部搞定。",
    features: [
      { eyebrow: "数字人", title: "口型同步 AI 主播", body: "上传自己的视频或从主播库中挑选,口型随声音自然开合,高清画质,边缘融合可调。" },
      { eyebrow: "多语言配音", title: "泰语 · 中文 · 英语 TTS", body: "录音棚级 Azure Neural 音色,泰语流利、句中可切英语;中文由火山引擎支持,还能克隆原声。" },
      { eyebrow: "背景", title: "抠像去背景 / 换场景", body: "自动抠掉背景换上品牌场景,画面中可移动位置、缩放主播大小 — 无需绿幕。" },
      { eyebrow: "自动直播", title: "7×24 直播直推 RTMP", body: "通过 RTMP 直推 Facebook / Shopee Live,全天候开播不用盯屏幕,也不用请主播。" },
      { eyebrow: "AI 大脑", title: "自动回复评论", body: "AI 撰写带货脚本并实时回复观众评论 — 可以文字回复,也能让主播在直播里开口回答。" },
      { eyebrow: "视频库", title: "自动视频画廊", body: "服务器端自动产片工厂:点开始后关掉网页也行,新闻/推广视频源源不断产出。" },
    ],
    stepEyebrow: "轻松上手",
    stepH2: "3 步开播",
    steps: [
      { t: "选择数字人", d: "上传照片/视频,或从现成的主播库中挑选。" },
      { t: "写脚本,或交给 AI", d: "自己输入带货脚本,或一键让 AI 代写。" },
      { t: "点击开播", d: "通过 RTMP 直推 Facebook / Shopee Live。" },
    ],
    prevEyebrow: "界面预览",
    prevH2: "从控制台到直播间,只需几次点击",
    previews: [
      { alt: "项目控制台界面", caption: "项目控制台" },
      { alt: "直播中口型同步的 AI 主播", caption: "直播主播" },
      { alt: "渲染完成的视频画廊", caption: "视频画廊" },
    ],
    voiceEyebrow: "声音",
    voiceH2: "顾客爱听的声音",
    voiceSub: "可选录音棚级 Azure Neural 音色,或从原始视频克隆音色还原真人。泰语、英语、中文混读自然流畅。",
    chips: ["女声 — Premwadee", "男声 — Niwat", "原声克隆", "ไทย + English + 中文"],
    ctaEyebrow: "随时可以开始",
    finalA: "准备好开一间",
    finalB: "永不打烊的直播间了吗?",
    finalNote: "无需安装任何东西,浏览器打开即用。",
    footer: "Reforge AI Live — 直播电商的数字主播",
  },
};

const FEATURE_ICONS: IconType[] = [Sparkles, Languages, Eraser, Radio, MessageSquare, Film];
const STEP_ICONS: IconType[] = [Upload, Wand2, Clapperboard];
const PREVIEW_SRCS = [IMAGES.previewConsole, IMAGES.previewPresenter, IMAGES.previewGallery];

// Tech ecosystem names for the marquee (re-interpreted from the reference's
// "trusted partners" strip — here it advertises the pipeline that powers the host).
const TRUST = [
  "MuseTalk",
  "Azure Neural",
  "Volcengine",
  "GFPGAN",
  "FFmpeg RTMP",
  "Shopee Live",
];

export default async function Home() {
  const locale = await getLocale();
  const c = COPY[locale] ?? COPY.th;

  return (
    <div className={`${styles.landing} ${fraunces.variable} ${jetbrains.variable}`}>
      {/* effects — client islands */}
      <ScrollProgress />
      <CursorGlow />

      {/* ── Hero ──────────────────────────────────────────────────────── */}
      <section className={styles.hero}>
        <div className={styles.heroBg} aria-hidden />
        <div className={styles.heroGrid} aria-hidden />
        <div className={styles.heroOrb1} aria-hidden />
        <div className={styles.heroOrb2} aria-hidden />
        <div className={styles.heroDeco1} aria-hidden />
        <div className={styles.heroTopline} aria-hidden />

        <div className={styles.container}>
          <div className={styles.heroInner}>
            {/* left: copy + CTA */}
            <div>
              <span className={styles.heroEyebrow}>
                <span className={styles.dot} />
                {c.badge}
              </span>

              <h1 className={styles.heroTitle}>
                <span className={styles.line}>
                  <span className={styles.lineInner}>{c.h1a}</span>
                </span>
                <span className={styles.line}>
                  <span className={`${styles.lineInner} ${styles.goldText}`}>{c.h1b}</span>
                </span>
              </h1>

              <p className={styles.heroSub}>{c.sub}</p>

              <div className={styles.heroActions}>
                <Link href="/dashboard" className={`${styles.btn} ${styles.btnPrimary}`}>
                  <span>{c.ctaStart}</span>
                  <ArrowRight className={`${styles.arrow} size-4`} />
                </Link>
                <Link href="/gallery" className={`${styles.btn} ${styles.btnGhost}`}>
                  <Play className="size-4" />
                  <span>{c.ctaGallery}</span>
                </Link>
              </div>

              <div className={styles.heroMeta}>
                {c.stats.map((s) => (
                  <div key={s.k}>
                    <div className={styles.heroMetaLabel}>{s.k}</div>
                    <div className={styles.heroMetaValue}>{s.v}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* right: phone live mockup */}
            <div className={styles.heroVisual}>
              <div className={styles.heroFrame}>
                <span className={styles.heroLiveTag}>
                  <span className={styles.liveDot} />
                  {c.liveTag}
                </span>
                {/* eslint-disable-next-line @next/next/no-img-element -- external placeholder, swap URL in IMAGES.hero */}
                <img src={IMAGES.hero} alt={c.heroAlt} />
              </div>
              <div className={styles.heroChat}>
                <div className={styles.heroChatHead}>{c.chatLabel}</div>
                <div className={styles.heroChatQ}>{c.chatQ}</div>
                <div className={styles.heroChatA}>{c.chatA}</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Trust marquee ─────────────────────────────────────────────── */}
      <section className={styles.trust}>
        <div className={styles.container}>
          <div className={styles.trustLabel}>{c.trustLabel}</div>
        </div>
        <div className={styles.trustMarquee}>
          <div className={styles.trustTrack}>
            {[...TRUST, ...TRUST].map((name, i) => (
              <span key={`${name}-${i}`} className={styles.trustItem}>
                {name}
                <span className={styles.trustSep}>✦</span>
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ── Feature grid (6) ──────────────────────────────────────────── */}
      <section className={styles.section}>
        <div className={styles.container}>
          <Reveal>
            <p className={styles.eyebrow}>{c.featEyebrow}</p>
            <h2 className={styles.sectionTitle}>{c.featH2}</h2>
            <p className={styles.sectionLead}>{c.featSub}</p>
          </Reveal>

          <Reveal delay={1} className={styles.featGridWrap}>
            <div className={styles.featGrid}>
              {c.features.map((f, i) => {
                const Icon = FEATURE_ICONS[i];
                return (
                  <div key={f.title} className={styles.featCard}>
                    <div className={styles.featNum}>{`/ 0${i + 1}`}</div>
                    <div className={styles.featIcon}>
                      <Icon className="size-5" />
                    </div>
                    <p className={styles.featEyebrow}>{f.eyebrow}</p>
                    <h3 className={styles.featTitle}>{f.title}</h3>
                    <p className={styles.featBody}>{f.body}</p>
                  </div>
                );
              })}
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── Proof / stats strip ───────────────────────────────────────── */}
      <section className={styles.proof}>
        <div className={styles.container}>
          <div className={styles.proofGrid}>
            {c.stats.map((s) => (
              <div key={s.k} className={styles.proofItem}>
                <div className={styles.proofNum}>{s.v}</div>
                <div className={styles.proofLabel}>{s.k}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── How it works (3 steps) ────────────────────────────────────── */}
      <section className={styles.section}>
        <div className={styles.container}>
          <Reveal>
            <p className={styles.eyebrow}>{c.stepEyebrow}</p>
            <h2 className={styles.sectionTitle}>{c.stepH2}</h2>
          </Reveal>

          <Reveal delay={1}>
            <div className={styles.stepGrid}>
              {c.steps.map((s, i) => {
                const Icon = STEP_ICONS[i];
                return (
                  <div key={s.t} className={styles.step}>
                    <div className={styles.stepCircle}>
                      <Icon className="size-6" />
                    </div>
                    <div className={styles.stepNum}>{`Step 0${i + 1}`}</div>
                    <h3 className={styles.stepTitle}>{s.t}</h3>
                    <p className={styles.stepDesc}>{s.d}</p>
                  </div>
                );
              })}
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── Preview strip ─────────────────────────────────────────────── */}
      <section className={styles.section}>
        <div className={styles.container}>
          <Reveal>
            <p className={styles.eyebrow}>{c.prevEyebrow}</p>
            <h2 className={styles.sectionTitle}>{c.prevH2}</h2>
          </Reveal>

          <Reveal delay={1}>
            <div className={styles.prevGrid}>
              {c.previews.map((p, i) => (
                <figure key={p.caption} className={styles.prevCard}>
                  {/* eslint-disable-next-line @next/next/no-img-element -- external placeholder, swap URL in IMAGES.* */}
                  <img src={PREVIEW_SRCS[i]} alt={p.alt} />
                  <figcaption className={styles.prevCaption}>{p.caption}</figcaption>
                </figure>
              ))}
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── Voice highlight ───────────────────────────────────────────── */}
      <section className={styles.section}>
        <div className={styles.containerTight}>
          <Reveal>
            <div className={styles.voiceCard}>
              <p className={styles.voiceEyebrow}>
                <Mic className="size-4" />
                {c.voiceEyebrow}
              </p>
              <h2 className={styles.voiceTitle}>{c.voiceH2}</h2>
              <p className={styles.voiceSub}>{c.voiceSub}</p>
              <div className={styles.chips}>
                {c.chips.map((chip) => (
                  <span key={chip} className={styles.chip}>
                    {chip}
                  </span>
                ))}
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── Final CTA ─────────────────────────────────────────────────── */}
      <section className={styles.cta}>
        <div className={styles.container}>
          <Reveal>
            <span className={styles.ctaEyebrow}>{c.ctaEyebrow}</span>
            <h2 className={styles.ctaTitle}>
              {c.finalA}
              <em className={styles.goldText}>{c.finalB}</em>
            </h2>
            <div className={styles.ctaButtons}>
              <Link href="/dashboard" className={`${styles.btn} ${styles.btnPrimary}`}>
                <span>{c.ctaStart}</span>
                <ArrowRight className={`${styles.arrow} size-4`} />
              </Link>
              <Link href="/gallery" className={`${styles.btn} ${styles.btnGhost}`}>
                <span>{c.ctaGallery}</span>
              </Link>
            </div>
            <p className={styles.ctaNote}>{c.finalNote}</p>
          </Reveal>
        </div>
      </section>

      {/* ── Footer ────────────────────────────────────────────────────── */}
      <footer className={styles.footer}>
        <div className={styles.container}>
          <div className={styles.footerLogo}>
            <span className={styles.logoMark}>R</span>
            Reforge
          </div>
          <p className={styles.footerText}>{c.footer}</p>
        </div>
      </footer>
    </div>
  );
}
