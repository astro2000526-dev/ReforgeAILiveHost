# ReforgeAILiveHost

AI digital-human livestream SaaS — MVP for Shopee SEA sellers.

## Architecture

- **`apps/web/`** — Next.js 14 (App Router) + Tailwind + shadcn. Deploys to Vercel. Owns UI + API gateway + Supabase writes.
- **`services/pipeline/`** — FastAPI on UCloud GPU. Owns TTS → MuseTalk → GFPGAN → ffmpeg → RTMP push.
- **`supabase/`** — Postgres migrations + RLS.

Two servers, two cadences: web iterates daily (Vercel push-to-deploy), GPU pipeline ships rarely (docker compose up on UCloud).

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
