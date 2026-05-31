import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { getLocale } from "@/lib/locale-server";

// Apple-style marketing landing. Big type, generous whitespace, soft gradients,
// short punchy copy. Static server component (no client JS). 3-language copy in
// a local CONTENT object (same pattern as /plan).

type L = "en" | "zh" | "th";

const CONTENT: Record<L, {
  badge: string;
  h1a: string; h1b: string;
  sub: string;
  ctaPrimary: string; ctaSecondary: string;
  stats: { v: string; k: string }[];
  features: { eyebrow: string; title: string; body: string; tint: string }[];
  stepsTitle: string;
  steps: { n: string; t: string; d: string }[];
  voiceEyebrow: string; voiceTitle: string; voiceBody: string;
  voiceChips: string[];
  finalA: string; finalB: string; finalCta: string; finalNote: string;
  footer: string;
}> = {
  th: {
    badge: "พรีเซนเตอร์ AI · ไลฟ์ขายอัตโนมัติ",
    h1a: "พิธีกรดิจิทัล",
    h1b: "ที่ไลฟ์ขายแทนคุณ ทั้งวันทั้งคืน",
    sub: "สร้างพรีเซนเตอร์ AI พูดไทย-อังกฤษ ลิปซิงค์เนียน เขียนสคริปต์เอง ตอบคอมเมนต์เอง — ไม่ต้องมีสตูดิโอ ไม่ต้องจ้างพิธีกร เปิดไลฟ์ได้ 24 ชั่วโมง",
    ctaPrimary: "เริ่มใช้งานฟรี",
    ctaSecondary: "ดูแผนการใช้งาน",
    stats: [
      { v: "24/7", k: "ไลฟ์ไม่มีหยุด" },
      { v: "Full HD", k: "ภาพคมระดับ 1080p" },
      { v: "3 ภาษา", k: "ไทย · English · 中文" },
      { v: "< 1 นาที", k: "ต่อการเรนเดอร์" },
    ],
    features: [
      { eyebrow: "ดิจิทัลฮิวแมน", title: "หน้าตาเหมือนจริง ปากขยับเนียน", body: "อัปโหลดวิดีโอตัวเองหรือพรีเซนเตอร์ที่เลือก ระบบลิปซิงค์ระดับ HD ขยับปากตามเสียงอย่างเป็นธรรมชาติ ปรับความเนียนของขอบได้", tint: "from-indigo-500/15 to-purple-500/5" },
      { eyebrow: "เสียงระดับมืออาชีพ", title: "พูดไทยชัด สลับอังกฤษได้", body: "เสียง Azure Neural คุณภาพสูง (Premwadee / Niwat) หรือโคลนเสียงให้เหมือนต้นฉบับ อ่านทั้งไทยและอังกฤษในประโยคเดียว", tint: "from-rose-500/15 to-orange-400/5" },
      { eyebrow: "สมอง AI ในตัว", title: "เขียนสคริปต์ + ตอบลูกค้าเอง", body: "ให้ AI ร่างสคริปต์ขายของให้อัตโนมัติ และตอบคอมเมนต์ผู้ชมแบบเรียลไทม์ระหว่างไลฟ์ ต่อเนื่องไม่มีสะดุด", tint: "from-emerald-500/15 to-teal-400/5" },
    ],
    stepsTitle: "เริ่มได้ใน 3 ขั้นตอน",
    steps: [
      { n: "01", t: "เลือกพรีเซนเตอร์", d: "อัปโหลดรูป/วิดีโอ หรือเลือกจากคลัง" },
      { n: "02", t: "ใส่สคริปต์ หรือให้ AI เขียน", d: "พิมพ์เอง หรือกดให้ AI ร่างให้" },
      { n: "03", t: "กดไลฟ์", d: "ส่งตรงเข้า Facebook / Shopee Live" },
    ],
    voiceEyebrow: "เสียง",
    voiceTitle: "เสียงที่ลูกค้าอยากฟัง",
    voiceBody: "เลือกใช้เสียง Azure Neural ระดับสตูดิโอ หรือโคลนโทนเสียงจากคลิปต้นฉบับให้เหมือนตัวจริง รองรับการอ่านสลับไทย-อังกฤษอย่างเป็นธรรมชาติ",
    voiceChips: ["หญิง — Premwadee", "ชาย — Niwat", "โคลนเสียงต้นฉบับ", "ไทย + English"],
    finalA: "พร้อมเปิดร้านไลฟ์",
    finalB: "ที่ไม่ต้องนอน?",
    finalCta: "เริ่มเลย",
    finalNote: "ไม่ต้องติดตั้งอะไร เปิดใช้งานบนเบราว์เซอร์ได้ทันที",
    footer: "Reforge AI Live — พิธีกรดิจิทัลสำหรับไลฟ์คอมเมิร์ซ",
  },
  en: {
    badge: "AI presenter · autonomous live selling",
    h1a: "A digital host",
    h1b: "that live-sells for you, around the clock",
    sub: "Build an AI presenter that speaks Thai & English, lip-syncs naturally, writes its own script and replies to viewers — no studio, no host, live 24 hours a day.",
    ctaPrimary: "Get started free",
    ctaSecondary: "See the plan",
    stats: [
      { v: "24/7", k: "Always live" },
      { v: "Full HD", k: "Crisp 1080p" },
      { v: "3 langs", k: "Thai · English · 中文" },
      { v: "< 1 min", k: "Per render" },
    ],
    features: [
      { eyebrow: "Digital human", title: "Lifelike face, natural lips", body: "Upload your own clip or pick a presenter. HD lip-sync moves the mouth naturally with the voice, with adjustable edge blending.", tint: "from-indigo-500/15 to-purple-500/5" },
      { eyebrow: "Pro-grade voice", title: "Clear Thai, fluent English", body: "High-quality Azure Neural voices (Premwadee / Niwat), or clone the original tone. Reads Thai and English in one sentence.", tint: "from-rose-500/15 to-orange-400/5" },
      { eyebrow: "Built-in AI brain", title: "Writes scripts, answers buyers", body: "Let AI draft your selling script and reply to viewer comments in real time during the stream — non-stop.", tint: "from-emerald-500/15 to-teal-400/5" },
    ],
    stepsTitle: "Live in 3 steps",
    steps: [
      { n: "01", t: "Pick a presenter", d: "Upload an image/video or choose one" },
      { n: "02", t: "Add a script, or let AI write it", d: "Type it, or generate with one tap" },
      { n: "03", t: "Go live", d: "Straight to Facebook / Shopee Live" },
    ],
    voiceEyebrow: "Voice",
    voiceTitle: "A voice buyers want to hear",
    voiceBody: "Studio-grade Azure Neural voices, or clone the tone from your source clip. Naturally code-switches between Thai and English.",
    voiceChips: ["Female — Premwadee", "Male — Niwat", "Clone original", "Thai + English"],
    finalA: "Ready for a live store",
    finalB: "that never sleeps?",
    finalCta: "Start now",
    finalNote: "Nothing to install — runs in your browser.",
    footer: "Reforge AI Live — the digital host for live commerce",
  },
  zh: {
    badge: "AI 主播 · 全自动直播带货",
    h1a: "数字主播",
    h1b: "替你 24 小时直播带货",
    sub: "打造会说泰语和英语的 AI 主播，口型自然、自动写脚本、自动回复观众——无需摄影棚、无需真人，全天候开播。",
    ctaPrimary: "免费开始",
    ctaSecondary: "查看方案",
    stats: [
      { v: "24/7", k: "永不停播" },
      { v: "全高清", k: "清晰 1080p" },
      { v: "3 语言", k: "泰 · English · 中文" },
      { v: "< 1 分钟", k: "每次渲染" },
    ],
    features: [
      { eyebrow: "数字人", title: "逼真面孔，自然口型", body: "上传你自己的视频或选择主播，HD 口型同步随声音自然张合，边缘融合可调。", tint: "from-indigo-500/15 to-purple-500/5" },
      { eyebrow: "专业级声音", title: "泰语清晰，英语流利", body: "高品质 Azure Neural 声音（Premwadee / Niwat），或克隆原始音色，一句话中泰英自由切换。", tint: "from-rose-500/15 to-orange-400/5" },
      { eyebrow: "内置 AI 大脑", title: "自动写稿、回复买家", body: "让 AI 起草带货脚本，并在直播中实时回复观众评论——持续不断。", tint: "from-emerald-500/15 to-teal-400/5" },
    ],
    stepsTitle: "三步开播",
    steps: [
      { n: "01", t: "选择主播", d: "上传图片/视频或从库中选择" },
      { n: "02", t: "输入脚本或让 AI 撰写", d: "手动输入，或一键生成" },
      { n: "03", t: "开始直播", d: "直推 Facebook / Shopee Live" },
    ],
    voiceEyebrow: "声音",
    voiceTitle: "买家爱听的声音",
    voiceBody: "录音棚级 Azure Neural 声音，或从素材克隆音色，泰英自然切换。",
    voiceChips: ["女声 — Premwadee", "男声 — Niwat", "克隆原声", "泰语 + English"],
    finalA: "准备好一家",
    finalB: "永不打烊的直播店？",
    finalCta: "立即开始",
    finalNote: "无需安装，浏览器即可运行。",
    footer: "Reforge AI Live — 直播电商的数字主播",
  },
};

export default async function Home() {
  const locale = (await getLocale()) as L;
  const c = CONTENT[locale] ?? CONTENT.th;

  return (
    <div className="relative overflow-hidden">
      {/* ── Hero ─────────────────────────────────────────────────────── */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute left-1/2 top-[-10%] h-[42rem] w-[42rem] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,theme(colors.primary/14%),transparent)]" />
      </div>

      <section className="mx-auto flex max-w-4xl flex-col items-center px-6 pt-24 pb-20 text-center sm:pt-32">
        <span className="inline-flex items-center gap-2 rounded-full border bg-card/60 px-3.5 py-1.5 text-xs font-medium text-muted-foreground backdrop-blur">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
          {c.badge}
        </span>
        <h1 className="mt-7 text-balance text-5xl font-semibold leading-[1.05] tracking-tight sm:text-7xl">
          {c.h1a}
          <br />
          <span className="bg-gradient-to-b from-foreground to-foreground/55 bg-clip-text text-transparent">
            {c.h1b}
          </span>
        </h1>
        <p className="mt-6 max-w-2xl text-pretty text-lg leading-relaxed text-muted-foreground">
          {c.sub}
        </p>
        <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
          <Link href="/dashboard" className={buttonVariants({ size: "lg" })}>
            {c.ctaPrimary}
          </Link>
          <Link href="/plan" className="group inline-flex items-center gap-1 px-4 py-2 text-sm font-medium text-primary">
            {c.ctaSecondary}
            <span className="transition-transform group-hover:translate-x-0.5">›</span>
          </Link>
        </div>

        {/* device mockup: a phone showing the live avatar */}
        <div className="relative mt-16 w-full max-w-md">
          <div className="mx-auto aspect-[9/16] w-64 rounded-[2.2rem] border border-border/70 bg-gradient-to-b from-card to-muted/40 p-2 shadow-[0_40px_90px_-30px_rgba(0,0,0,0.45)]">
            <div className="relative h-full w-full overflow-hidden rounded-[1.7rem] bg-gradient-to-b from-indigo-500/20 via-background to-rose-400/15">
              <div className="absolute left-1/2 top-10 h-24 w-24 -translate-x-1/2 rounded-full bg-gradient-to-br from-indigo-400/60 to-purple-500/40 blur-[1px]" />
              <div className="absolute left-3 top-3 rounded-full bg-red-500 px-2 py-0.5 text-[10px] font-semibold text-white">● LIVE</div>
              <div className="absolute inset-x-3 bottom-3 space-y-1.5">
                <div className="ml-auto w-fit rounded-2xl bg-foreground/90 px-3 py-1.5 text-[11px] text-background">🤖 ส่งฟรีทั้งร้านวันนี้ค่ะ</div>
                <div className="w-fit rounded-2xl bg-card/90 px-3 py-1.5 text-[11px]">💬 ไซส์ L มีไหมคะ</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Stats strip ──────────────────────────────────────────────── */}
      <section className="border-y border-border/60 bg-muted/20">
        <div className="mx-auto grid max-w-4xl grid-cols-2 gap-y-8 px-6 py-12 sm:grid-cols-4">
          {c.stats.map((s) => (
            <div key={s.k} className="text-center">
              <div className="text-3xl font-semibold tracking-tight">{s.v}</div>
              <div className="mt-1 text-xs text-muted-foreground">{s.k}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Feature sections ─────────────────────────────────────────── */}
      <section className="mx-auto max-w-5xl space-y-6 px-6 py-24">
        {c.features.map((f) => (
          <div key={f.title} className={`overflow-hidden rounded-3xl border bg-gradient-to-br ${f.tint} p-8 sm:p-12`}>
            <p className="text-xs font-semibold uppercase tracking-widest text-primary">{f.eyebrow}</p>
            <h2 className="mt-3 max-w-2xl text-3xl font-semibold tracking-tight sm:text-4xl">{f.title}</h2>
            <p className="mt-4 max-w-xl text-base leading-relaxed text-muted-foreground">{f.body}</p>
          </div>
        ))}
      </section>

      {/* ── Voice highlight ──────────────────────────────────────────── */}
      <section className="mx-auto max-w-5xl px-6 pb-24">
        <div className="rounded-3xl border bg-foreground p-10 text-background sm:p-16">
          <p className="text-xs font-semibold uppercase tracking-widest text-background/60">{c.voiceEyebrow}</p>
          <h2 className="mt-3 max-w-2xl text-3xl font-semibold tracking-tight sm:text-5xl">{c.voiceTitle}</h2>
          <p className="mt-5 max-w-xl text-base leading-relaxed text-background/70">{c.voiceBody}</p>
          <div className="mt-8 flex flex-wrap gap-2.5">
            {c.voiceChips.map((chip) => (
              <span key={chip} className="rounded-full border border-background/25 px-4 py-1.5 text-sm text-background/90">{chip}</span>
            ))}
          </div>
        </div>
      </section>

      {/* ── How it works ─────────────────────────────────────────────── */}
      <section className="mx-auto max-w-5xl px-6 pb-24">
        <h2 className="text-center text-3xl font-semibold tracking-tight sm:text-4xl">{c.stepsTitle}</h2>
        <div className="mt-12 grid gap-6 sm:grid-cols-3">
          {c.steps.map((s) => (
            <div key={s.n} className="rounded-2xl border bg-card p-7">
              <div className="text-sm font-mono text-primary">{s.n}</div>
              <div className="mt-3 text-lg font-medium">{s.t}</div>
              <div className="mt-1.5 text-sm text-muted-foreground">{s.d}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Final CTA ────────────────────────────────────────────────── */}
      <section className="mx-auto max-w-4xl px-6 pb-32 text-center">
        <h2 className="text-balance text-4xl font-semibold leading-tight tracking-tight sm:text-6xl">
          {c.finalA} <span className="text-primary">{c.finalB}</span>
        </h2>
        <div className="mt-9 flex justify-center">
          <Link href="/dashboard" className={buttonVariants({ size: "lg" })}>
            {c.finalCta}
          </Link>
        </div>
        <p className="mt-5 text-sm text-muted-foreground">{c.finalNote}</p>
      </section>

      <footer className="border-t border-border/60 py-8 text-center text-xs text-muted-foreground">
        {c.footer}
      </footer>
    </div>
  );
}
