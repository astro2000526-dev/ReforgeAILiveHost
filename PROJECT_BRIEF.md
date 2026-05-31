# ReforgeAILiveHost — Project Brief

AI digital-human livestream SaaS (MVP) for Shopee SEA sellers. A seller picks an
avatar template video + writes a short script; the system generates a lip-synced
clip and pushes it to a 24/7 RTMP live stream on Shopee Live.

## Architecture (2 services + 1 DB)

- **apps/web** — Next.js 16 (App Router), React 19, Tailwind 4, shadcn/ui.
  Front-end UI + API gateway. Deploys to Vercel (push-to-deploy, daily).
- **services/pipeline** — FastAPI, Python 3.10, MuseTalk v1.5, GFPGAN v1.4,
  ffmpeg. GPU work. Deploys to a UCloud GPU host via docker compose (rare).
- **supabase** — Postgres (migrations + RLS) + Storage bucket. Cloud.

Two seams that must stay clean:
1. Web ↔ Pipeline talk ONLY via `apps/web/src/lib/pipeline-client.ts`, auth'd
   with a shared `PIPELINE_TOKEN` bearer (must match on both sides exactly).
2. Pipeline writes job status DIRECTLY to Supabase with the service_role key —
   never proxies status back through Web. DB rows are the source of truth.

## Data flow

1. Seller creates a project (dashboard) → POST /api/projects → `projects` row.
2. Generate → POST /api/projects/[id]/generate → gateway calls pipeline
   /generate with the bearer token.
3. Pipeline (async): download template → TTS per segment (parallel) → concat
   audio → MuseTalk lip-sync → GFPGAN (optional) → transcode → upload mp4 to
   Supabase Storage. Status written to `generations` at each step.
4. Dashboard polls /api/projects/[id]/generation-status until `done`.
5. Go live → POST /api/streams/start → ffmpeg RTMP push loop to Shopee.
6. POST /api/streams/[id]/stop kills the ffmpeg process.

## Database tables

profiles (seller account) · avatars (template videos) · projects (script,
voice, stream key) · generations (one per job: status, mp4 URL, error) ·
streams (one per RTMP push: live/stopped, duration). RLS on: browser uses anon
key, servers use service_role.

## Pipeline endpoints

GET /health · POST /generate · GET /generate/{project_id} · POST /stream/start ·
POST /stream/stop?stream_id= · GET /stream/{stream_id}/status

## Key MVP decisions

1. One MuseTalk run, not six: concat TTS into one audio, run MuseTalk once →
   no inter-segment "face jumps", saves cold-start.
2. Never shell-out user text: TTS via SDK/HTTP only (script with quotes/$ can't
   inject).
3. Re-encode for RTMP (libx264+aac, GOP=2s, +genpts). NOT `-c copy +
   stream_loop` — PTS resets read as disconnects by Shopee.
4. Azure is default TTS (Thai neural, pay-as-you-go, 500K char/mo free).
   Volcengine gates Thai behind ¥1000/mo; edge-tts is 403'd. Switch via
   TTS_PROVIDER=azure|volcengine|edge.
5. Shopee product scrape = manual fill in MVP (anti-bot too heavy; v1.1 later).
6. stream_key stored plaintext + RLS for MVP; pgcrypto/KMS after acceptance.

## Local dev

Web:
  cd apps/web
  cp .env.example .env.local   # Supabase + PIPELINE_API_URL + PIPELINE_TOKEN
  npm install && npm run dev   # localhost:3000
  NOTE: Next.js 16 + React 19 (not 14) — see apps/web/AGENTS.md.

Pipeline (no GPU needed):
  cd services/pipeline
  python -m venv .venv && source .venv/bin/activate
  pip install -r requirements.txt
  cp .env.example .env         # keep MUSETALK_ENABLED=0 locally
  uvicorn app.main:app --reload --port 8000
  python -m scripts.smoke_test
  (MUSETALK_ENABLED=0 → ffmpeg loop+mux fallback, no GPU.)

## Production deploy

Web → Vercel: push branch; set same env vars in Vercel settings.

Pipeline → UCloud GPU (Docker):
  cd services/pipeline
  cp .env.example .env   # PIPELINE_TOKEN, Azure, Supabase
  # Outside China set HF_ENDPOINT=https://huggingface.co (mirror default is CN)
  docker compose up -d --build   # first run ~30-50 min (build + 15GB weights)
  curl http://localhost:8000/health
Redeploy: PIPELINE_SSH=user@host bash services/pipeline/deploy.sh

## GPU sizing

- >=16GB VRAM (T4 / A10 / V100 / 4090 / A100): runs MuseTalk + GFPGAN.
- 8GB cards: set GFPGAN_ENABLED=0, OOM risk — not recommended.
- Avoid Pascal (P40/P4): no usable fp16, very slow.
- One GPU is enough (jobs run one at a time). Start on Hourly billing.

## Repo map

apps/web/src/app/{dashboard,projects,api}/ · apps/web/src/lib/pipeline-client.ts
services/pipeline/app/{main,pipeline,musetalk,face_restore,ffmpeg_ops,storage}.py
services/pipeline/{Dockerfile,docker-compose.yml,docker-entrypoint.sh,deploy.sh}
supabase/migrations/0001_initial_schema.sql

Docs: README.md (full) · services/pipeline/README.md (deploy detail) ·
apps/web/AGENTS.md (Next.js 16 notes) · CLAUDE.md (conventions).
