import Link from "next/link";
import { JetBrains_Mono } from "next/font/google";
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
import { BrandMark } from "@/components/BrandMark";

import styles from "./_landing/landing.module.css";
import { CursorGlow } from "./_landing/CursorGlow";
import { CountUp } from "./_landing/CountUp";
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

// Fraunces (--font-fraunces) is loaded app-wide in layout.tsx now. JetBrains
// Mono stays page-local (only the landing uses it).
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
  // manifesto
  maniEyebrow: string;
  maniLead: string; // text before first highlight
  maniHi1: string; // gold underline phrase
  maniMid: string; // connective text
  maniHi2: string; // gold italic accent phrase
  maniTail: string; // closing text
  maniSig: string;
  // pipeline IDE window
  pipeEyebrow: string;
  pipeH2a: string;
  pipeH2b: string; // gold em
  pipeSub: string;
  pipeFile: string;
  pipeStatus: string;
  pipePromptLabel: string;
  pipePrompt: string;
  pipeStages: string[]; // 5 stage pill labels
  pipeStageNote: string; // small mono label under window
  // live control room dashboard
  liveEyebrow: string;
  liveH2: string;
  liveSub: string;
  liveBoardLabel: string;
  liveStatus: string;
  metrics: { label: string; value: number; suffix: string; change: string; tone: "gold" | "jade" | "blue" | "amber" }[];
  feedLabel: string;
  feed: { time: string; text: string; tone: "ok" | "ai" | "buy" }[];
  // big case stats
  caseEyebrow: string;
  caseH2a: string;
  caseH2b: string; // gold em
  caseSub: string;
  caseStats: { num: string; unit: string; label: string }[];
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
    maniEyebrow: "/ ปรัชญาของเรา /",
    maniLead: "ยุคต่อไปของการขายของออนไลน์ ไม่ได้เป็นของ",
    maniHi1: "ทีมที่ใหญ่ขึ้น หรือชั่วโมงไลฟ์ที่ยาวขึ้น",
    maniMid: " — แต่เป็นของ",
    maniHi2: "พิธีกร AI ที่ไม่เคยเหนื่อย ไม่เคยหลุดสคริปต์ และไลฟ์ได้ทุกวินาที",
    maniTail: " ให้คุณนอนหลับ ในขณะที่ร้านยังขายอยู่",
    maniSig: "REFORGE AI LIVE · แถลงการณ์ก่อตั้ง 2025",
    pipeEyebrow: "/ เบื้องหลังการทำงาน /",
    pipeH2a: "เห็นกับตา —",
    pipeH2b: "ไปป์ไลน์ไลฟ์ ทำงานจริงทีละสเตจ",
    pipeSub: "นี่คือสิ่งที่เกิดขึ้นจริงทุกครั้งที่คุณกดไลฟ์ จากสคริปต์หนึ่งบรรทัด สู่สตรีมสดที่ดันเข้า RTMP — ทุกสเตจตรวจสอบได้ ทำซ้ำได้ ออนแอร์ได้",
    pipeFile: "live-pipeline.py",
    pipeStatus: "Reforge LIVE · GPU SG",
    pipePromptLabel: "SCRIPT INPUT",
    pipePrompt: "ไลฟ์ขายครีมกันแดด ทักทายลูกค้า เน้นโปรส่งฟรี ตอบคอมเมนต์เรื่องไซส์",
    pipeStages: ["① สคริปต์", "② สังเคราะห์เสียง", "③ ลิปซิงค์", "④ ประกอบฉาก", "⑤ ดันไลฟ์ RTMP"],
    pipeStageNote: "วนลูปอัตโนมัติ · ~0.9s ต่อเฟรม",
    liveEyebrow: "/ ห้องควบคุมไลฟ์ /",
    liveH2: "ดูร้านคุณทำงานเอง แบบเรียลไทม์",
    liveSub: "แดชบอร์ดเดียวเห็นครบ: ผู้ชมสด คอมเมนต์ที่ไหลเข้า และ AI ที่ตอบกลับทันที — เปิดทิ้งไว้ได้ทั้งคืน คุณไม่ต้องเฝ้าหน้าจอ",
    liveBoardLabel: "ห้องควบคุมไลฟ์ · สด",
    liveStatus: "พิธีกร AI กำลังไลฟ์อยู่",
    metrics: [
      { label: "ผู้ชมสดตอนนี้", value: 1284, suffix: " คน", change: "↑ +96 ใน 1 นาที", tone: "gold" },
      { label: "คอมเมนต์ / นาที", value: 47, suffix: "", change: "พีคช่วงโปรส่งฟรี", tone: "blue" },
      { label: "ตอบอัตโนมัติแล้ว", value: 312, suffix: "", change: "ไม่มีตกหล่นสักคอมเมนต์", tone: "jade" },
      { label: "ยอดสั่งซื้อในไลฟ์", value: 86, suffix: " ออเดอร์", change: "≈ ฿42,800 วันนี้", tone: "amber" },
    ],
    feedLabel: "คอมเมนต์ที่ AI กำลังตอบ",
    feed: [
      { time: "ตอนนี้", text: "ลูกค้า: ไซส์ L มีไหมคะ → AI: มีค่ะ พร้อมส่ง วันนี้ส่งฟรีทั้งร้าน", tone: "ai" },
      { time: "00:03", text: "ลูกค้า: เก็บปลายทางได้มั้ย → AI: ได้ค่ะ COD ทั่วไทย", tone: "ai" },
      { time: "00:11", text: "ปิดการขาย: ครีมกันแดด × 2 · ฿590", tone: "buy" },
      { time: "00:18", text: "ลูกค้า: ส่งกี่วันคะ → AI: 1–3 วันทำการ Kerry/Flash", tone: "ai" },
      { time: "00:25", text: "AI ทักทายผู้ชมใหม่ 12 คน อัตโนมัติ", tone: "ok" },
    ],
    caseEyebrow: "/ ผลลัพธ์จริง /",
    caseH2a: "ตัวเลขที่",
    caseH2b: "ร้านไลฟ์รู้สึกได้",
    caseSub: "เปลี่ยนจากจ้างพิธีกรเป็นกะ มาเป็นพิธีกร AI ที่เปิดได้ตลอด — นี่คือสิ่งที่เปลี่ยนไป",
    caseStats: [
      { num: "24/7", unit: "", label: "ไลฟ์ต่อเนื่องไม่มีหยุดพัก" },
      { num: "92", unit: "%", label: "คอมเมนต์ตอบอัตโนมัติ" },
      { num: "70", unit: "%", label: "ต้นทุนพิธีกรที่ประหยัดได้" },
      { num: "1.2", unit: "วิ", label: "ความเร็วตอบเฉลี่ย" },
    ],
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
    maniEyebrow: "/ our philosophy /",
    maniLead: "The next era of live commerce won't belong to",
    maniHi1: "bigger teams or longer streaming hours",
    maniMid: " — it will belong to",
    maniHi2: "an AI host that never tires, never drops the script, and goes live every second of the day",
    maniTail: " so you can sleep while the shop keeps selling.",
    maniSig: "REFORGE AI LIVE · founding statement 2025",
    pipeEyebrow: "/ behind the scenes /",
    pipeH2a: "See it for real —",
    pipeH2b: "the live pipeline, stage by stage",
    pipeSub: "This is what actually runs every time you go live: from a one-line script to a stream pushed straight to RTMP — every stage traceable, repeatable, on-air.",
    pipeFile: "live-pipeline.py",
    pipeStatus: "Reforge LIVE · GPU SG",
    pipePromptLabel: "SCRIPT INPUT",
    pipePrompt: "Live-sell sunscreen, greet viewers, push free-shipping promo, answer size questions",
    pipeStages: ["① Script", "② Synthesize voice", "③ Lip-sync", "④ Composite", "⑤ Push live RTMP"],
    pipeStageNote: "auto-looping · ~0.9s per frame",
    liveEyebrow: "/ live control room /",
    liveH2: "Watch your shop run itself, in real time",
    liveSub: "One dashboard shows it all: live viewers, comments streaming in, and AI replying instantly — leave it running all night, no screen to babysit.",
    liveBoardLabel: "Live control room · live",
    liveStatus: "AI host is live now",
    metrics: [
      { label: "Live viewers now", value: 1284, suffix: "", change: "↑ +96 in 1 min", tone: "gold" },
      { label: "Comments / min", value: 47, suffix: "", change: "peaking on the promo", tone: "blue" },
      { label: "Auto-answered", value: 312, suffix: "", change: "not a single comment missed", tone: "jade" },
      { label: "Orders in stream", value: 86, suffix: "", change: "≈ ฿42,800 today", tone: "amber" },
    ],
    feedLabel: "Comments AI is answering",
    feed: [
      { time: "now", text: "Buyer: Do you have size L? → AI: Yes! Free shipping store-wide today", tone: "ai" },
      { time: "00:03", text: "Buyer: Is COD available? → AI: Yes, cash on delivery nationwide", tone: "ai" },
      { time: "00:11", text: "Sale closed: Sunscreen × 2 · ฿590", tone: "buy" },
      { time: "00:18", text: "Buyer: How long to ship? → AI: 1–3 business days, Kerry/Flash", tone: "ai" },
      { time: "00:25", text: "AI auto-greeted 12 new viewers", tone: "ok" },
    ],
    caseEyebrow: "/ real results /",
    caseH2a: "Numbers a live shop",
    caseH2b: "actually feels",
    caseSub: "Swap shift-based human hosts for an AI host that's always on — here's what changes.",
    caseStats: [
      { num: "24/7", unit: "", label: "non-stop live, no breaks" },
      { num: "92", unit: "%", label: "comments auto-answered" },
      { num: "70", unit: "%", label: "host cost saved" },
      { num: "1.2", unit: "s", label: "average reply speed" },
    ],
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
    maniEyebrow: "/ 我们的理念 /",
    maniLead: "直播带货的下一个时代,不属于",
    maniHi1: "更大的团队、更长的直播时长",
    maniMid: " —— 而属于",
    maniHi2: "永不疲倦、永不跳脚本、每一秒都能开播的 AI 主播",
    maniTail: ",让你安睡,而店铺仍在成交。",
    maniSig: "REFORGE AI LIVE · 创始声明 2025",
    pipeEyebrow: "/ 幕后流程 /",
    pipeH2a: "眼见为实 ——",
    pipeH2b: "直播流水线,逐级运行",
    pipeSub: "这是你每次开播时真实运行的流程:从一行脚本,到直推 RTMP 的实时直播 —— 每一级都可追溯、可复现、可上线。",
    pipeFile: "live-pipeline.py",
    pipeStatus: "Reforge LIVE · GPU SG",
    pipePromptLabel: "脚本输入",
    pipePrompt: "直播带货防晒霜,欢迎观众,主推包邮活动,回答尺码问题",
    pipeStages: ["① 脚本", "② 语音合成", "③ 口型同步", "④ 画面合成", "⑤ 推流直播"],
    pipeStageNote: "自动循环 · 约 0.9 秒/帧",
    liveEyebrow: "/ 直播控制台 /",
    liveH2: "实时看着店铺自己运转",
    liveSub: "一块看板看全部:实时观众、滚动进来的评论,以及即时回复的 AI —— 整夜挂着也行,无需盯屏。",
    liveBoardLabel: "直播控制台 · 实时",
    liveStatus: "AI 主播正在直播",
    metrics: [
      { label: "当前实时观众", value: 1284, suffix: "", change: "↑ 1 分钟 +96", tone: "gold" },
      { label: "评论 / 分钟", value: 47, suffix: "", change: "包邮活动峰值", tone: "blue" },
      { label: "已自动回复", value: 312, suffix: "", change: "一条评论都没漏", tone: "jade" },
      { label: "直播间下单", value: 86, suffix: " 单", change: "≈ ฿42,800 今日", tone: "amber" },
    ],
    feedLabel: "AI 正在回复的评论",
    feed: [
      { time: "刚刚", text: "顾客:有 L 码吗? → AI:有的!今天全店包邮", tone: "ai" },
      { time: "00:03", text: "顾客:能货到付款吗? → AI:可以,全泰 COD", tone: "ai" },
      { time: "00:11", text: "成交:防晒霜 × 2 · ฿590", tone: "buy" },
      { time: "00:18", text: "顾客:几天到货? → AI:1–3 个工作日,Kerry/Flash", tone: "ai" },
      { time: "00:25", text: "AI 自动欢迎 12 位新观众", tone: "ok" },
    ],
    caseEyebrow: "/ 真实成效 /",
    caseH2a: "直播间能",
    caseH2b: "切身感受的数字",
    caseSub: "把按班排的真人主播,换成永远在线的 AI 主播 —— 改变就在这里。",
    caseStats: [
      { num: "24/7", unit: "", label: "不间断直播,无需休息" },
      { num: "92", unit: "%", label: "评论自动回复" },
      { num: "70", unit: "%", label: "节省的主播成本" },
      { num: "1.2", unit: "秒", label: "平均回复速度" },
    ],
    ctaEyebrow: "随时可以开始",
    finalA: "准备好开一间",
    finalB: "永不打烊的直播间了吗?",
    finalNote: "无需安装任何东西,浏览器打开即用。",
    footer: "Reforge AI Live — 直播电商的数字主播",
  },
};

// Syntax-highlighted pipeline code shown in the IDE window. Each entry is one
// rendered line; tokens map to .syn* classes (palette mirrors the reference).
// Locale-independent (it's "code") — only comments are kept short & universal.
type Tok = { t: string; c?: string };
const PIPE_CODE: Tok[][] = [
  [{ t: "# Reforge live pipeline — one script → RTMP", c: "synComment" }],
  [
    { t: "async ", c: "synKeyword" },
    { t: "def ", c: "synKeyword" },
    { t: "go_live", c: "synFn" },
    { t: "(script):", c: "synPunct" },
  ],
  [
    { t: "    audio = ", c: "synPunct" },
    { t: "await ", c: "synKeyword" },
    { t: "tts", c: "synFn" },
    { t: "(script, voice=", c: "synPunct" },
    { t: '"th-Premwadee"', c: "synString" },
    { t: ")", c: "synPunct" },
  ],
  [
    { t: "    frames = ", c: "synPunct" },
    { t: "musetalk", c: "synFn" },
    { t: "(avatar, audio, fps=", c: "synPunct" },
    { t: "25", c: "synNum" },
    { t: ")", c: "synPunct" },
  ],
  [
    { t: "    frames = ", c: "synPunct" },
    { t: "gfpgan", c: "synFn" },
    { t: "(frames, ", c: "synPunct" },
    { t: "strength", c: "synProp" },
    { t: "=", c: "synPunct" },
    { t: "0.5", c: "synNum" },
    { t: ")", c: "synPunct" },
  ],
  [
    { t: "    scene  = ", c: "synPunct" },
    { t: "composite", c: "synFn" },
    { t: "(frames, bg=", c: "synPunct" },
    { t: '"brand.png"', c: "synString" },
    { t: ")", c: "synPunct" },
  ],
  [
    { t: "    ", c: "synPunct" },
    { t: "await ", c: "synKeyword" },
    { t: "ffmpeg", c: "synFn" },
    { t: ".push(scene, ", c: "synPunct" },
    { t: "rtmp", c: "synProp" },
    { t: ")", c: "synPunct" },
  ],
  [{ t: "    # auto-reply runs alongside the stream", c: "synComment" }],
  [
    { t: "    ", c: "synPunct" },
    { t: "async ", c: "synKeyword" },
    { t: "for ", c: "synKeyword" },
    { t: "c ", c: "synPunct" },
    { t: "in ", c: "synKeyword" },
    { t: "comments", c: "synFn" },
    { t: "():", c: "synPunct" },
  ],
  [
    { t: "        ", c: "synPunct" },
    { t: "await ", c: "synKeyword" },
    { t: "reply", c: "synFn" },
    { t: "(", c: "synPunct" },
    { t: "ai", c: "synProp" },
    { t: ".answer(c))", c: "synPunct" },
  ],
  [
    { t: "    ", c: "synPunct" },
    { t: "return ", c: "synKeyword" },
    { t: "Stream", c: "synFn" },
    { t: "(", c: "synPunct" },
    { t: "status", c: "synProp" },
    { t: "=", c: "synPunct" },
    { t: '"LIVE"', c: "synString" },
    { t: ")", c: "synPunct" },
  ],
];

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
    <div className={`${styles.landing} ${jetbrains.variable}`}>
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

      {/* ── Manifesto ─────────────────────────────────────────────────── */}
      <section className={styles.manifesto} id="manifesto">
        <div className={styles.container}>
          <Reveal>
            <p className={`${styles.eyebrow} ${styles.eyebrowSlash}`}>{c.maniEyebrow}</p>
          </Reveal>
          <Reveal delay={1}>
            <p className={styles.maniQuote}>
              {c.maniLead}{" "}
              <span className={styles.maniUnderline}>{c.maniHi1}</span>
              {c.maniMid}{" "}
              <span className={styles.maniAccent}>{c.maniHi2}</span>
              {c.maniTail}
            </p>
          </Reveal>
          <Reveal delay={2}>
            <div className={styles.maniSig}>
              <span>{c.maniSig}</span>
            </div>
          </Reveal>
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

      {/* ── Pipeline IDE window (live flow demo) ──────────────────────── */}
      <section className={styles.pipe} id="pipeline">
        <div className={styles.pipeBg} aria-hidden />
        <div className={styles.container}>
          <Reveal className={styles.pipeHeader}>
            <p className={`${styles.eyebrow} ${styles.eyebrowSlash} ${styles.eyebrowCenter}`}>
              {c.pipeEyebrow}
            </p>
            <h2 className={styles.sectionTitle}>
              {c.pipeH2a}
              <br />
              <em>{c.pipeH2b}</em>
            </h2>
            <p>{c.pipeSub}</p>
          </Reveal>

          <Reveal delay={1}>
            <div className={styles.ideWindow}>
              {/* title bar */}
              <div className={styles.ideTitlebar}>
                <div className={styles.ideDots}>
                  <span className={`${styles.ideDot} ${styles.ideDotRed}`} />
                  <span className={`${styles.ideDot} ${styles.ideDotYellow}`} />
                  <span className={`${styles.ideDot} ${styles.ideDotGreen}`} />
                </div>
                <span className={styles.ideTab}>
                  <span className={styles.fileIcon} />
                  {c.pipeFile}
                </span>
                <span className={styles.ideStatus}>
                  <span className={styles.liveDot} />
                  {c.pipeStatus}
                </span>
              </div>

              {/* body */}
              <div className={styles.ideBody}>
                {/* left: script prompt + stage checks */}
                <div className={styles.idePrompt}>
                  <div className={styles.idePromptLabel}>{c.pipePromptLabel}</div>
                  <div className={styles.idePromptBubble}>{c.pipePrompt}</div>
                  <div className={styles.ideValidations}>
                    {c.pipeStages.map((s) => (
                      <div key={s} className={styles.ideVal}>
                        <span className={styles.check}>✓</span>
                        <span>{s}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* right: code editor */}
                <div className={styles.ideEditor}>
                  <div className={styles.ideLineNumbers} aria-hidden>
                    {PIPE_CODE.map((_, i) => (
                      <span key={i}>{i + 1}</span>
                    ))}
                  </div>
                  <pre className={styles.ideCode}>
                    {PIPE_CODE.map((line, i) => (
                      <span key={i} className={styles.line}>
                        {line.map((tok, j) => (
                          <span key={j} className={tok.c ? styles[tok.c] : undefined}>
                            {tok.t}
                          </span>
                        ))}
                        {"\n"}
                      </span>
                    ))}
                  </pre>
                </div>
              </div>
            </div>
          </Reveal>

          <Reveal delay={2}>
            <div className={styles.pipeStages}>
              {c.pipeStages.map((s) => (
                <span key={s} className={styles.pipePill}>
                  <span className={styles.pillDot} />
                  {s}
                </span>
              ))}
            </div>
            <p className={styles.pipeNote}>{c.pipeStageNote}</p>
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

      {/* ── Live control room dashboard ───────────────────────────────── */}
      <section className={styles.live} id="control-room">
        <div className={styles.container}>
          <Reveal className={styles.liveHeader}>
            <p className={`${styles.eyebrow} ${styles.eyebrowSlash}`}>{c.liveEyebrow}</p>
            <h2 className={styles.sectionTitle}>{c.liveH2}</h2>
            <p className={styles.sectionLead}>{c.liveSub}</p>
          </Reveal>

          <Reveal delay={1}>
            <div className={styles.liveBoard}>
              <div className={styles.liveBoardBar}>
                <span className={styles.label}>{c.liveBoardLabel}</span>
                <span className={styles.status}>
                  <span className={styles.pulse} />
                  {c.liveStatus}
                </span>
              </div>

              <div className={styles.liveGrid}>
                {/* metrics */}
                <div className={styles.metricsGrid}>
                  {c.metrics.map((m) => (
                    <div
                      key={m.label}
                      className={`${styles.metricCard} ${styles[`tone${m.tone}`] ?? ""}`}
                    >
                      <div className={styles.metricLabel}>{m.label}</div>
                      <div className={styles.metricValue}>
                        <CountUp to={m.value} suffix={m.suffix} group={m.value >= 1000} />
                      </div>
                      <div className={styles.metricChange}>{m.change}</div>
                    </div>
                  ))}
                </div>

                {/* activity feed */}
                <div className={styles.feed}>
                  <div className={styles.feedLabel}>{c.feedLabel}</div>
                  <ul className={styles.feedList}>
                    {c.feed.map((f, i) => (
                      <li key={i} className={styles.feedItem}>
                        <span className={`${styles.feedIcon} ${styles[`tone${f.tone}`] ?? ""}`}>
                          {f.tone === "buy" ? "฿" : f.tone === "ok" ? "★" : "AI"}
                        </span>
                        <span className={styles.feedText}>
                          <span className={styles.feedTime}>{f.time}</span>
                          {f.text}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          </Reveal>
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

      {/* ── Big case stats ────────────────────────────────────────────── */}
      <section className={styles.cases}>
        <div className={styles.container}>
          <Reveal className={styles.casesHead}>
            <p className={`${styles.eyebrow} ${styles.eyebrowSlash}`}>{c.caseEyebrow}</p>
            <h2 className={styles.sectionTitle}>
              {c.caseH2a} <em>{c.caseH2b}</em>
            </h2>
            <p className={styles.sectionLead}>{c.caseSub}</p>
          </Reveal>

          <Reveal delay={1}>
            <div className={styles.caseStatsGrid}>
              {c.caseStats.map((s) => (
                <div key={s.label} className={styles.caseStat}>
                  <div className={styles.caseStatNum}>
                    {s.num}
                    {s.unit && <span className={styles.unit}>{s.unit}</span>}
                  </div>
                  <div className={styles.caseStatLabel}>{s.label}</div>
                </div>
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
          <div className={`${styles.footerLogo} brandmark-host`}>
            <BrandMark size={38} />
            Reforge
          </div>
          <p className={styles.footerText}>{c.footer}</p>
        </div>
      </footer>
    </div>
  );
}
