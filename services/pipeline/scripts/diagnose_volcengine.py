"""Diagnose which language / config combinations the current Volcengine
account+voice can handle. Runs samples one at a time, prints code/message for
each, never bails early.

Run:
    .\.venv\Scripts\python.exe -m scripts.diagnose_volcengine
"""
import asyncio
import base64
import os
import uuid
from pathlib import Path

import httpx
from dotenv import load_dotenv

load_dotenv()

from app.config import TMP_DIR  # noqa: E402

APPID = os.getenv("VOLCENGINE_APPID", "")
TOKEN = os.getenv("VOLCENGINE_ACCESS_TOKEN", "")
CLUSTER = os.getenv("VOLCENGINE_CLUSTER", "volcano_tts")
ENDPOINT = "https://openspeech.bytedance.com/api/v1/tts"

OUT = TMP_DIR / "diagnose"
OUT.mkdir(parents=True, exist_ok=True)


async def try_synth(
    label: str,
    voice: str,
    text: str,
    extra_audio: dict | None = None,
    cluster: str | None = None,
    text_type: str = "plain",
):
    payload = {
        "app": {"appid": APPID, "token": TOKEN, "cluster": cluster or CLUSTER},
        "user": {"uid": "diag"},
        "audio": {
            "voice_type": voice,
            "encoding": "mp3",
            "speed_ratio": 1.0,
            "volume_ratio": 1.0,
            "pitch_ratio": 1.0,
            "rate": 24000,
            **(extra_audio or {}),
        },
        "request": {
            "reqid": str(uuid.uuid4()),
            "text": text,
            "text_type": text_type,
            "operation": "query",
        },
    }
    headers = {"Authorization": f"Bearer;{TOKEN}", "Content-Type": "application/json"}
    async with httpx.AsyncClient(timeout=30.0) as client:
        r = await client.post(ENDPOINT, json=payload, headers=headers)
    if r.status_code != 200:
        print(f"  [{label}] HTTP {r.status_code} body={r.text[:200]}")
        return
    body = r.json()
    code = body.get("code")
    if code in (3000, 0) and body.get("data"):
        out = OUT / f"{label}.mp3"
        out.write_bytes(base64.b64decode(body["data"]))
        print(f"  [{label}] OK  {out.stat().st_size} bytes  -> {out}")
    else:
        print(f"  [{label}] code={code} msg={body.get('message')!r} (extra_audio={extra_audio})")


async def main():
    print(f"APPID={APPID}  CLUSTER={CLUSTER}\n")

    print("== Chinese baseline (default voice) ==")
    await try_synth("zh_default", "BV001_streaming", "你好，这是一个测试。")

    print("\n== Chinese with 天才少女 voice ==")
    await try_synth("zh_bv421", "BV421_streaming", "你好，这是一个测试。")

    print("\n== Thai with 天才少女, no language hint ==")
    await try_synth("th_nohint", "BV421_streaming", "สวัสดีค่ะ วันนี้เรามีสินค้าโปรโมชั่นพิเศษ")

    print("\n== Thai with 天才少女, language=th ==")
    await try_synth(
        "th_lang_th", "BV421_streaming",
        "สวัสดีค่ะ วันนี้เรามีสินค้าโปรโมชั่นพิเศษ",
        extra_audio={"language": "th"},
    )

    print("\n== English with 天才少女 ==")
    await try_synth(
        "en_lang_en", "BV421_streaming",
        "Welcome! Today's deal is amazing.",
        extra_audio={"language": "en"},
    )

    print("\n== Indonesian with 天才少女, language=id ==")
    await try_synth(
        "id_lang_id", "BV421_streaming",
        "Halo semua, hari ini ada promo spesial.",
        extra_audio={"language": "id"},
    )

    print("\n== Thai short text, no params ==")
    await try_synth("th_short", "BV421_streaming", "สวัสดี")

    print("\n== Thai with language=th-TH ==")
    await try_synth(
        "th_lang_thTH", "BV421_streaming", "สวัสดี",
        extra_audio={"language": "th-TH"},
    )

    print("\n== Thai with language=thai ==")
    await try_synth(
        "th_lang_thai", "BV421_streaming", "สวัสดี",
        extra_audio={"language": "thai"},
    )

    print("\n== Thai with cluster=volcano_mega ==")
    await try_synth(
        "th_cluster_mega", "BV421_streaming", "สวัสดี",
        extra_audio={"language": "th"},
        cluster="volcano_mega",
    )

    print("\n== Thai with cluster=volcano_tts_v2 ==")
    await try_synth(
        "th_cluster_v2", "BV421_streaming", "สวัสดี",
        extra_audio={"language": "th"},
        cluster="volcano_tts_v2",
    )

    print(f"\nOutputs in {OUT}")


if __name__ == "__main__":
    asyncio.run(main())
