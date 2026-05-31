import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { getLocale } from "@/lib/locale-server";
import { translate } from "@/lib/i18n";

export default async function Home() {
  const locale = await getLocale();
  const t = (k: string) => translate(locale, k);

  return (
    <div className="relative overflow-hidden">
      {/* soft gradient backdrop */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(60rem_40rem_at_50%_-10%,theme(colors.primary/12%),transparent)]"
      />
      <main className="mx-auto flex min-h-[calc(100vh-56px)] max-w-4xl flex-col items-center justify-center gap-10 px-6 py-20 text-center">
        <div className="flex flex-col items-center gap-5">
          <span className="inline-flex items-center gap-2 rounded-full border bg-card/60 px-3 py-1 text-xs font-medium text-muted-foreground backdrop-blur">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            {t("app.tag")}
          </span>
          <h1 className="bg-gradient-to-b from-foreground to-foreground/60 bg-clip-text text-5xl font-bold tracking-tight text-transparent sm:text-6xl">
            {t("landing.title")}
          </h1>
          <p className="max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg">
            {t("landing.subtitle")}
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-3">
          <Link href="/dashboard" className={buttonVariants({ size: "lg" })}>
            {t("landing.enter")}
          </Link>
          <Link
            href="/projects/new"
            className={buttonVariants({ variant: "outline", size: "lg" })}
          >
            {t("landing.new")}
          </Link>
        </div>

        <div className="mt-6 grid w-full gap-4 sm:grid-cols-3">
          {[
            { icon: "🎭", text: t("landing.b1") },
            { icon: "📡", text: t("landing.b2") },
            { icon: "⚡", text: t("landing.b3") },
          ].map((f, i) => (
            <div
              key={i}
              className="rounded-xl border bg-card/50 p-5 text-left backdrop-blur transition-colors hover:bg-card"
            >
              <div className="text-2xl">{f.icon}</div>
              <p className="mt-2 text-sm text-muted-foreground">{f.text}</p>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
