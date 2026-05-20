r"""Smoke test: TTS provider only — no ffmpeg, no GPU.

Usage:
    .\.venv\Scripts\python.exe -m scripts.smoke_tts

Default provider: volcengine (active path: Chinese market).
Default voice: BV001_streaming — Volcengine standard Mandarin female,
appropriate baseline for 直播带货.

Switch provider via env:
    $env:TTS_PROVIDER="azure";    $env:SMOKE_VOICE="th-TH-PremwadeeNeural"
    $env:TTS_PROVIDER="volcengine"; $env:SMOKE_VOICE="BV700_streaming"   # 灿灿
"""
import asyncio
import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

from app.tts import synthesize_all, get_provider  # noqa: E402
from app.config import TMP_DIR  # noqa: E402


# Representative 直播带货 segments (intro / hook / product / promo / close).
SAMPLES = [
    "亲爱的家人们，欢迎来到我们的直播间！我是今天的主播小美。",
    "你是不是也经常熬夜加班，第二天起床镜子一照，皮肤暗沉、眼袋明显？",
    "今天给大家带来一款明星同款的烟酰胺精华，30 毫升大容量，一瓶能用三个月。",
    "原价 199 一瓶，今天直播间专属价，只要 99！而且买一送一！",
    "数量真的不多，只有 100 单，秒杀完就没有了，赶紧点小黄车下单！",
    "好啦，今天就先到这里，记得点关注点小心心，明天直播间不见不散！",
]

# Volcengine Chinese voices to try:
#   BV001_streaming  — 通用女声（稳重）
#   BV700_streaming  — 灿灿（活泼，带货风格）
#   BV056_streaming  — 阳光男声
# Azure equivalents:
#   zh-CN-XiaoxiaoNeural / zh-CN-XiaoyiNeural / zh-CN-YunxiNeural
DEFAULT_VOICE = os.getenv("SMOKE_VOICE", "BV001_streaming")
DEFAULT_RATE = os.getenv("SMOKE_RATE", "+0%")


async def main() -> None:
    provider = get_provider()
    print(f"provider: {provider.name}")
    print(f"voice:    {DEFAULT_VOICE}")
    print(f"rate:     {DEFAULT_RATE}")
    print(f"segments: {len(SAMPLES)}")
    print()

    work = TMP_DIR / "smoke_tts"
    work.mkdir(parents=True, exist_ok=True)

    paths = await synthesize_all(
        segments=SAMPLES,
        voice=DEFAULT_VOICE,
        rate=DEFAULT_RATE,
        work_dir=work,
        basename="cn",
    )
    total = 0
    for p, text in zip(paths, SAMPLES):
        size = p.stat().st_size if p.exists() else 0
        total += size
        marker = "OK" if size > 1000 else "EMPTY?"
        preview = text[:24] + ("..." if len(text) > 24 else "")
        print(f"  {p.name}  {size:>7} bytes  [{marker}]  {preview}")
    print(f"\nTotal: {total} bytes across {len(paths)} mp3(s) in {work}")


if __name__ == "__main__":
    asyncio.run(main())
