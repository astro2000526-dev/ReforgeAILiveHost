# Mission: Dockerize services/pipeline for UCloud GPU deploy

**Branch:** `feat/docker-pipeline-ucloud`
**Started:** 2026-05-28
**Status:** in progress (audit complete, Dockerfile pending)

## Goal

ทำให้ `services/pipeline/` (FastAPI + MuseTalk + GFPGAN + ffmpeg) deploy ขึ้น UCloud GPU instance ด้วย `docker compose up -d` ครั้งเดียว — เพื่อให้ดูแลจัดการง่าย ไม่ต้องไล่ติดตั้ง dependency ด้วยมือ.

## Architecture (decided)

- **Web (Vercel, no docker)** — Next.js เดิม, iterate fast, push-to-deploy.
- **Pipeline (UCloud GPU, full docker)** — single container, run once, leave alone.
- **DB**: Supabase cloud (unchanged).
- **Storage**: Supabase Storage (MVP) → UFile when traffic grows.
- **Communication**: Web → GPU via HTTPS + `PIPELINE_TOKEN` bearer. GPU → Supabase direct (service_role).

## Scope (in)

1. `services/pipeline/Dockerfile` — cuda 12.1 runtime + ffmpeg + Python deps + MuseTalk clone (pinned commit).
2. `services/pipeline/docker-compose.yml` — single service, GPU runtime, volume for models + tmp + output.
3. `services/pipeline/.dockerignore`.
4. `.env.example` update — add `PIPELINE_TOKEN`.
5. `services/pipeline/app/main.py` — add Bearer token auth middleware.
6. `apps/web/src/lib/pipeline-client.ts` — send `Authorization: Bearer <PIPELINE_TOKEN>`.
7. `services/pipeline/deploy.sh` — ssh + git pull + `docker compose up -d --build`.
8. `services/pipeline/README.md` — UCloud GPU deploy steps.

## Scope (out)

- Web Dockerfile (Vercel handles).
- Redis / queue (BackgroundTasks + DB poll is enough for MVP).
- K8s / multi-region.
- pgcrypto for stream_key (later phase).
- WebRTC preview (v1.1).

## Audit findings (from kasi-graph + read)

- Image size estimate: 8-12 GB (cuda + torch + MuseTalk + GFPGAN).
- Model weights ~10-15 GB → **volume mount, not in image**.
- `_jobs` + `_streams` in-memory → restart loses tracking. DB has same state, acceptable.
- `streaming.py` ffmpeg subprocess — need SIGTERM handler in container.
- No API auth currently — must add `PIPELINE_TOKEN` (step 5/6).
- MuseTalk repo not in this repo — bootstrap_pod.sh clones it. Dockerfile must do the same with pinned commit.

## Decisions

| # | Decision | Why |
|---|---|---|
| D1 | Base image: `nvidia/cuda:12.1.0-cudnn8-runtime-ubuntu22.04` | matches AutoDL recommendation, smaller than devel |
| D2 | Multi-stage Dockerfile | cache deps separate from code changes |
| D3 | Model weights → volume mount, never in image | image stays under 10GB, share across containers |
| D4 | MuseTalk clone in Dockerfile + pinned commit hash | reproducible build, no surprise from upstream |
| D5 | Single Dockerfile (no separate CPU variant) | cuda image runs on CPU box too; MUSETALK_ENABLED=0 fallback works |
| D6 | Non-root user `pipeline` | safer; chown /workspace at build |
| D7 | Healthcheck = CUDA + ffmpeg + MuseTalk import | catches partial init |
| D8 | entrypoint script auto-downloads weights if volume empty | idempotent first-run, no manual step |

## Files in mission scope

- `services/pipeline/Dockerfile` (new)
- `services/pipeline/docker-compose.yml` (new)
- `services/pipeline/.dockerignore` (new)
- `services/pipeline/.env.example` (edit — add PIPELINE_TOKEN)
- `services/pipeline/app/main.py` (edit — add auth middleware + health check)
- `services/pipeline/deploy.sh` (new)
- `services/pipeline/README.md` (edit — Docker section)
- `apps/web/src/lib/pipeline-client.ts` (edit — send Bearer)
- `apps/web/.env.example` (edit — add PIPELINE_TOKEN)

## References

- `.kasidit/subgraph-full-story.md` — full call chain English narration
- `.kasidit/HOTSPOTS.md` — top hubs (TS/JS only)
- `services/pipeline/scripts/bootstrap_pod.sh` — current AutoDL install script (port to Dockerfile)
- `services/pipeline/README.md` — current AutoDL deploy doc (rewrite for Docker)

## Open questions

- UCloud GPU spec (T4 / A10 / 4090)? — affects driver/CUDA pin
- Model weights: download in entrypoint vs pre-baked separate "weights image"?
- MuseTalk commit hash to pin — last tested? Use HEAD of main for now, pin on first successful build.
