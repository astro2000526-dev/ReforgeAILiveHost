import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col items-start justify-center gap-8 px-8 py-16">
      <div className="flex flex-col gap-2">
        <p className="text-xs font-mono uppercase tracking-widest text-muted-foreground">
          Reforge AI · MVP
        </p>
        <h1 className="text-4xl font-semibold tracking-tight">
          AI 数字人直播后台
        </h1>
        <p className="text-base text-muted-foreground">
          5 分钟生成一段 AI 数字人带货视频，一键推流到抖音 / 视频号 / 小红书。
        </p>
      </div>

      <div className="flex flex-wrap gap-3">
        <Link href="/dashboard" className={buttonVariants({ size: "lg" })}>
          进入控制台
        </Link>
        <Link
          href="/projects/new"
          className={buttonVariants({ variant: "outline", size: "lg" })}
        >
          新建项目
        </Link>
      </div>

      <ul className="mt-6 text-sm text-muted-foreground space-y-1 list-disc pl-5">
        <li>选数字人 · 填商品 · 一键出稿 · 配音生成</li>
        <li>视频生成完成后直接填 RTMP 推流地址开播</li>
        <li>MVP demo 模式无需注册，进入控制台即用</li>
      </ul>
    </main>
  );
}
