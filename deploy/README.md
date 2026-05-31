# Deploy — one command

Spin up the **entire** ReforgeAILiveHost stack on a single GPU server.

```bash
git clone <repo> reforge
cd reforge/deploy
./init.sh
```

That's it. When it finishes:

```
Console : http://console.<your-ip>.nip.io
API     : http://api.<your-ip>.nip.io
Status  : http://status.<your-ip>.nip.io
```

## What it brings up

| Service  | Image / build              | Role                                                    |
|----------|----------------------------|---------------------------------------------------------|
| db       | postgres:15                | Lean-Supabase database                                  |
| rest     | postgrest v12.2.3          | REST gateway over Postgres                              |
| pipeline | build `services/pipeline`  | TTS (MMS) + voice clone (OpenVoice) + ffmpeg + orchestr |
| lipsync  | build `services/lipsync`   | Wav2Lip lip-sync (GPU)                                  |
| qwen     | ollama/ollama              | Local Qwen2.5:3b — script gen + live auto-reply         |
| web      | build `apps/web`           | Next.js console + API gateway                           |
| nginx    | nginx:alpine               | Reverse proxy (:80 vhosts + internal :8088 gateway)     |

All on one Docker network; they reach each other by service name. The browser
reaches the box through `*.<ip>.nip.io` wildcard DNS (no DNS setup needed).

## Requirements

- Linux host with an **NVIDIA GPU** + driver + [nvidia-container-toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html)
- **Docker** + the **docker compose v2** plugin
- ~15 GB free disk, public IPv4 (for nip.io)
- `openssl curl git envsubst` (standard on most distros)

## First run

Takes a while — it:
1. generates secrets into `deploy/.env` (JWT keys, DB passwords, pipeline token),
2. downloads weights (~700 MB: Wav2Lip + MMS-TTS Thai/English) — **MuseTalk's
   ~6 GB is intentionally skipped**, this stack runs Wav2Lip,
3. builds the 3 images,
4. boots Postgres, bootstraps roles + applies `supabase/migrations/*`, seeds config,
5. starts everything and pulls the Qwen model (~2 GB),
6. waits for health checks.

Re-running `./init.sh` is safe: secrets, models, DB, and the Qwen model are all
skipped if already present.

## Config

`deploy/.env` (git-ignored) holds everything. Useful knobs:

- `HOST_IP` — auto-detected; override if behind NAT / you want a specific IP.
- `DATA_DIR` — where Postgres data, models, and rendered mp4s live (default `/data/reforge`).
- `HF_MIRROR` — `https://hf-mirror.com` (China) or `https://huggingface.co` (elsewhere).

App behaviour (render mode, voice clone, video quality, **lip-blend/ความเนียน**,
TTS voice, …) is configured live in the **Console → Settings** page and stored
in the `system_config` table — no redeploy needed.

## After it's up

The demo avatars ship with placeholder media, so create your own presenter:
**Console → Presenters → upload** an image/video, then render from a project.

```bash
# from deploy/
docker compose ps                 # status
docker compose logs -f pipeline   # tail a service
docker compose down               # stop (keeps data in DATA_DIR)
docker compose up -d --build web  # rebuild + restart one service
```

## Notes

- Lip-sync engine is **Wav2Lip** (`LIPSYNC_MODEL=wav2lip`). MuseTalk needs mmcv
  CUDA ops that segfault on some hosts + 6 GB of weights; it's off by default.
- The pipeline runs OpenVoice tone-conversion on **CPU** (the cloning quality is
  fine there; lip-sync + TTS use the GPU).
- `.env` contains live secrets — it is git-ignored; never commit it.
