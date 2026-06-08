# ReforgeAILiveHost

AI digital-human livestream SaaS — MVP for Shopee SEA sellers.

## Architecture

- **`apps/web/`** — Next.js 14 (App Router) + Tailwind + shadcn. Deploys to Vercel. Owns UI + API gateway + Supabase writes.
- **`services/pipeline/`** — FastAPI on UCloud GPU. Owns TTS → lip-sync → GFPGAN → ffmpeg → RTMP push.
- **`supabase/`** — Postgres migrations + RLS.

Two servers, two cadences: web iterates daily (Vercel push-to-deploy), GPU pipeline ships rarely (docker compose up on UCloud).

### Pipeline layers (`services/pipeline/app/`)

- `api/` — HTTP routes, thin controllers only
- `services/` — orchestration (render / generate / tts / script flows)
- `clients/` + `tts/` — external network APIs (ollama, Azure, Volcengine, edge)
- `gpu/` — **the ONLY GPU-call boundary** (lipsync, MMS-TTS, OpenVoice, GFPGAN, rembg matting, MuseTalk). torch/rembg/gfpgan/transformers imports allowed only here — `scripts/check_gpu_seam.sh` enforces. Swap GPU server with `GPU_BACKEND=remote` + `GPU_BASE_URL` (worker = this same image's `/gpu/*` routes); per-capability override `GPU_<CAP>_BACKEND`.
- `media.py` — every CPU ffmpeg op; `state.py` — in-memory job state (single owner); `storage.py` — Supabase Storage.

### Web server-side shared libs (`apps/web/src/lib/`)

- `pipeline-client.ts` — the ONLY reader of `PIPELINE_API_URL`/`PIPELINE_TOKEN` (`pipelineFetch` + `pipelineFetchForm`)
- `server/db-gateway.ts` — the ONLY builder of the PostgREST gateway URL/headers
- `system-config-server.ts` — the ONLY system-config loader (always merges defaults)
- `types.ts` / `constants.ts` — shared row types + enums; don't re-declare inline

## Stack

- Frontend: Next.js 14 App Router, React 18, Tailwind 3, shadcn/ui
- Backend (pipeline): FastAPI 0.115, Python 3.11, MuseTalk v1.5, GFPGAN v1.4, ffmpeg
- TTS: Azure Neural (Thai) + Volcengine (Chinese) + edge-tts (fallback) — per-voice routing
- DB/Auth/Storage: Supabase cloud
- GPU host: UCloud Global (SG region)

## Conventions

- Pipeline ↔ Web communicate via single forwarder `apps/web/src/lib/pipeline-client.ts` + `PIPELINE_TOKEN` bearer.
- Pipeline writes status to Supabase directly via service_role key — never proxy through Web.
- ffmpeg subprocess state (`_streams`, `_jobs`) is in-memory; DB rows are source of truth.

## Kasidit

Framework active. Router mode default — auto-classifies each message.
Heavy missions → `/kasi-*` commands. Mode override → `/kasi full` this session.
See `.kasidit/MISSION.md` for current mission and `.kasidit/subgraph-full-story.md` for full call-chain story.

## Current mission

**`feat/docker-pipeline-ucloud`** — Dockerize `services/pipeline/` for UCloud GPU deploy. See `.kasidit/MISSION.md`.
