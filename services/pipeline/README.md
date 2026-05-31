# pipeline (FastAPI)

GPU-side service that turns `(template_video + script_segments)` into a final
lip-synced video and pushes it to RTMP.

## Local dev (Windows)

```powershell
cd D:\ReforgeAILiveHost\services\pipeline
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
copy .env.example .env
uvicorn app.main:app --reload --port 8000
```

Local dev runs with `MUSETALK_ENABLED=0` — the lip-sync step is replaced by a
ffmpeg loop+mux fallback so you can verify the rest of the pipeline (edge-tts,
concat, transcode, RTMP push) without a GPU.

## Smoke test (after install)

```powershell
python -m scripts.smoke_test  # generates output\smoke.mp4 from a tiny test clip
```

## Docker deployment (UCloud / any NVIDIA host) — recommended

Single-command setup. Use this for any Linux GPU host with the NVIDIA Container
Toolkit installed (`nvidia-container-cli info` works).

### 1. Prereqs on the host

```bash
# Verify GPU + toolkit
nvidia-smi
nvidia-container-cli info

# Verify Docker (24+) + compose v2
docker --version
docker compose version
```

**GPU sizing.** MuseTalk v1.5 loads UNet + SD-VAE + Whisper together (~8-10 GB
VRAM); GFPGAN adds ~2 GB on top. So:

- **≥16 GB VRAM** (T4 / A10 / V100 / 4090 / A100): runs everything, keep
  `GFPGAN_ENABLED=1` if you want the mouth-edge cleanup.
- **8 GB cards** (e.g. UCloud "Cost-effective" tiers): tight — set
  `GFPGAN_ENABLED=0` and expect OOM risk on long clips. Not recommended.
- **Avoid Pascal (P40/P4)**: no usable fp16, very slow for this inference path.

One GPU is enough — the pipeline runs one MuseTalk job at a time, so multi-GPU
instances just burn money.

### 2. Clone + configure

```bash
git clone <this-repo> ReforgeAILiveHost
cd ReforgeAILiveHost/services/pipeline
cp .env.example .env
# Fill in PIPELINE_TOKEN (openssl rand -base64 48), Azure/Volcengine,
# Supabase URL + SERVICE_KEY. See .env.example for required keys.
```

**Weight-download mirror.** The Dockerfile defaults to `HF_ENDPOINT=https://hf-mirror.com`
(fast from mainland China). On a host **outside** China (e.g. UCloud SG), the
mirror is slower than Hugging Face direct — override it in `.env`:

```
HF_ENDPOINT=https://huggingface.co
```

(`env_file` in compose overrides the value baked into the image.)

### 3. Bring it up

```bash
docker compose up -d --build      # --build needed the first time
docker compose logs -f pipeline   # watch image build + first-boot weight download
```

**First run is slow — budget ~30-50 min total before the service is healthy:**

| Step | Time |
|------|------|
| Image build (clone MuseTalk + pip torch/diffusers ~5 GB) | ~10-20 min |
| First boot: download ~15 GB weights into `./data/models/` | ~10-30 min |

Subsequent `docker compose up -d` restarts reuse the image + the weight volume,
so they take seconds. (Drop `--build` after the first build unless code changed.)

> On a short GPU rental, start this immediately after SSH — don't wait. Health
> won't pass until the weight download finishes (the healthcheck `start_period`
> is set generously for this reason).

### 4. Smoke test

```bash
# Health (no auth)
curl http://localhost:8000/health
# Authenticated request (replace TOKEN with PIPELINE_TOKEN from .env).
# Default TTS is Azure → use an Azure neural voice (here: Thai). For Volcengine
# use a BV* voice instead and set TTS_PROVIDER=volcengine.
curl -X POST http://localhost:8000/generate \
     -H "Authorization: Bearer ${PIPELINE_TOKEN}" \
     -H "Content-Type: application/json" \
     -d '{"project_id":"smoke","avatar_template_url":"<url>","script_segments":[{"type":"intro","text":"สวัสดีค่ะ ทดสอบระบบ"}],"voice":"th-TH-PremwadeeNeural","rate":"+0%"}'
# Poll until status=done or failed:
curl http://localhost:8000/generate/smoke
```

### 5. Update / redeploy

From your laptop, with `PIPELINE_SSH=user@gpu-host` exported:

```bash
bash services/pipeline/deploy.sh             # pull + rebuild + up -d
bash services/pipeline/deploy.sh --no-build  # just restart with current image
bash services/pipeline/deploy.sh --rebuild   # force clean rebuild
```

Without `PIPELINE_SSH` the script runs locally on whatever host you're on.

### Volume layout

```
services/pipeline/
├── data/
│   ├── models/        # MuseTalk weights (volume, persistent)
│   ├── tmp/           # per-job staging (volume, persistent)
│   └── output/        # finished mp4 cache (volume, persistent)
├── docker-compose.yml
├── Dockerfile
├── docker-entrypoint.sh
└── .env               # never committed
```

`data/` lives on the host so a `docker compose down && docker compose up` does
NOT wipe your weights. To start completely fresh: `rm -rf data/models` then
restart.

### Reverse-proxy + TLS (production)

The compose file binds 0.0.0.0:8000 directly for first-time setup. In
production put Caddy or nginx in front and only expose 443:

```
seller browser → Vercel (web) → caddy:443 → pipeline:8000
                                  (TLS terminates here)
```

Caddyfile (minimal):
```
gpu.reforge.example.com {
    reverse_proxy pipeline:8000
}
```

Then in compose, change `ports: ["8000:8000"]` to `expose: ["8000"]` so the
port is only reachable on the internal docker network.

---

## GPU pod deployment (AutoDL / bare-metal) — alternative

We use **AutoDL** (autodl.com) for the GPU box: RTX 4090 at ~¥1.5/h按量, paid
via Alipay/Wechat, GPU billing pauses on shutdown. RunPod / 火山引擎 / 阿里云
ECS work too — the commands below are the same, only the provider differs.

1. Create a pod with image **PyTorch 2.x + CUDA 12.x** on a **RTX 4090** (or
   A10/3090 if 4090 isn't available — slower but works). Put the repo on the
   pod's data disk (`/root/autodl-tmp/` on AutoDL).
2. SSH into the pod and clone this repo:
   ```bash
   cd /root/autodl-tmp
   git clone <this-repo> reforge
   cd reforge/services/pipeline
   ```
3. Run the bootstrap script — it installs ffmpeg, clones MuseTalk, downloads
   the v1.5 weights (via `hf-mirror.com`, works from inside mainland China),
   installs all Python deps, and pre-fills the MuseTalk paths in `.env`:
   ```bash
   bash scripts/bootstrap_pod.sh
   ```
   Allow ~10-15 min for the weight download (10-15GB). The script verifies the
   key files exist and aborts loudly if anything is missing.
4. Edit `.env` and fill in the secrets the script can't know:
   - `VOLCENGINE_APPID` / `VOLCENGINE_ACCESS_TOKEN`
   - `SUPABASE_URL` / `SUPABASE_SERVICE_KEY` / `SUPABASE_STORAGE_BUCKET`
5. Start the service:
   ```bash
   uvicorn app.main:app --host 0.0.0.0 --port 8000
   ```
6. Smoke test the MuseTalk call ONCE before exposing publicly:
   ```bash
   curl -X POST http://localhost:8000/generate -H 'content-type: application/json' \
        -d '{"project_id":"smoke","avatar_template_url":"...","script_segments":[{"type":"intro","text":"测试"}],"voice":"BV001_streaming","rate":"+0%"}'
   curl http://localhost:8000/generate/smoke   # poll until status=done or failed
   ```
   If MuseTalk fails, the response `message` holds the last 30 lines of stderr
   — read it, do not retry blindly.
7. Expose via AutoDL's custom port (or RunPod's HTTPS proxy). Gate with an API
   key header before pointing the Vercel front-end at it.

## Endpoints

| Method | Path                       | Purpose                          |
|--------|----------------------------|----------------------------------|
| GET    | `/health`                  | Liveness probe                   |
| POST   | `/generate`                | Kick off async generation        |
| GET    | `/generate/{project_id}`   | Poll job status (front-end uses) |
| POST   | `/stream/start`            | Start RTMP push                  |
| POST   | `/stream/stop?stream_id=`  | Kill the ffmpeg push process     |
| GET    | `/stream/{stream_id}/status` | Live/stopped + duration        |

## Pipeline stages (and the Day 0 review decisions baked in)

1. **download** template video
2. **tts** — provider-pluggable (`app/tts/`), parallel per segment.
   - Default provider: **Azure Speech** (`TTS_PROVIDER=azure`).
     Reason: Volcengine charges ¥1000/month flat to unlock Thai (rejected for
     MVP economics), and edge-tts is 403'd globally. Azure has Thai neural
     voices on pay-as-you-go with a 500K char/month free tier.
   - Switch with `TTS_PROVIDER=volcengine` or `=edge` — pipeline doesn't change.
   - Decision #2: never shell-out — always call the provider via its Python
     SDK / HTTP API so user-supplied text never reaches a shell.
3. **concat_audio** — concat the TTS mp3s into one file.
   Decision #1: one audio file = one MuseTalk run = no inter-segment "face
   jumps" + saves 6× model cold start.
4. **lipsync** — MuseTalk over the full audio (stub on local dev).
5. **transcode** — bake GOP=2s, `+genpts`, libx264+aac.
   Decision #3: `-c copy + -stream_loop -1` causes PTS resets that Shopee's
   ingestion treats as disconnects; re-encoding sidesteps this.
6. **upload** — push the mp4 to Supabase Storage and return a public URL.
   Skipped when `SUPABASE_URL` / `SUPABASE_SERVICE_KEY` aren't set; the
   pipeline still leaves the file in `./output/` for local debugging.

## Supabase Storage setup (one-time)

The pipeline uploads finished mp4s to a public bucket so the Next.js side can
hand them straight to ffmpeg for RTMP push.

1. Supabase Dashboard → Storage → "New bucket"
2. Name: `generations` (or whatever you put in `SUPABASE_STORAGE_BUCKET`)
3. Public bucket: **on** — videos aren't secret, and public URLs don't expire
   so the dashboard can keep showing the same project for weeks.
4. File size limit: 100 MB is plenty for a 3-min direct-mode clip.

That's it — no policy rows needed because the pipeline uploads with the
service-role key.

## TTS provider setup (Azure — default)

Why Azure: pay-as-you-go, 500K char/month free tier covers MVP usage at $0,
and the Thai/Indonesian/Vietnamese neural voices are top-tier in this market.

1. portal.azure.com → search "Speech service" → Create.
2. Pick region **Southeast Asia** (Singapore, closest for TH/ID/VN).
3. Pricing tier: F0 (free, 500K chars/month) or S0 (pay-as-you-go, $16/1M chars).
4. After creation, open the resource → "Keys and Endpoint" tab → copy Key 1 and Region.
5. Fill `.env`:
   ```
   TTS_PROVIDER=azure
   AZURE_SPEECH_KEY=<your key 1>
   AZURE_SPEECH_REGION=southeastasia
   ```
6. Voice IDs are full Azure neural voice names — see `app/tts/azure.py` for the
   SEA list. Set `SMOKE_VOICE=th-TH-PremwadeeNeural` for the smoke test.

## TTS provider setup (Volcengine — fallback only)

Thai is gated behind a ¥1000/month subscription on Volcengine, so this is not
the primary path. Code is kept for the Chinese/Indonesian/Vietnamese voices
which work on the base tier.

See `app/tts/volcengine.py` and `.env.example` for setup. Toggle with
`TTS_PROVIDER=volcengine`.
