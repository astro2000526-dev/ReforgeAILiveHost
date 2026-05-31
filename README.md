# ReforgeAILiveHost

AI digital-human livestream SaaS — an MVP that lets Shopee SEA sellers turn a
template avatar video + a short script into a lip-synced clip and push it to a
live RTMP stream.

> **One sentence:** seller fills a wizard → we run TTS → MuseTalk lip-sync →
> ffmpeg → and either hand back an mp4 or stream it 24/7 to Shopee Live.

---

## 1. Architecture at a glance

Two servers, two cadences:

```
                                  ┌─────────────────────────────┐
   Seller browser                 │  apps/web  (Next.js 16)      │
        │                         │  • wizard + dashboard UI     │
        │  HTTPS                  │  • API routes (gateway)      │
        └────────────────────────►  • Supabase writes (RLS)     │
                                  └───────────────┬─────────────┘
                                                  │ Bearer PIPELINE_TOKEN
                                                  │ (lib/pipeline-client.ts)
                                                  ▼
                                  ┌─────────────────────────────┐
                                  │ services/pipeline (FastAPI)  │
                                  │  TTS → concat → MuseTalk →   │
                                  │  GFPGAN → ffmpeg → RTMP push │
                                  │  writes status to Supabase ──┼──┐
                                  └───────────────┬─────────────┘  │ service_role
                                                  │ upload mp4      │
                                                  ▼                 ▼
                                       ┌────────────────────────────────┐
                                       │   Supabase (Postgres + Storage) │
                                       │   projects / generations /      │
                                       │   streams   (+ RLS, + bucket)   │
                                       └────────────────────────────────┘
```

| Component | Path | Stack | Deploys to | Cadence |
|-----------|------|-------|------------|---------|
| **Web** | `apps/web/` | Next.js 16 (App Router), React 19, Tailwind 4, shadcn/ui | Vercel (push-to-deploy) | daily |
| **Pipeline** | `services/pipeline/` | FastAPI, Python 3.10, MuseTalk v1.5, GFPGAN v1.4, ffmpeg | UCloud GPU (docker compose) | rarely |
| **Database** | `supabase/` | Postgres migrations + RLS, Storage bucket | Supabase cloud | per-migration |

**Two rules that keep the seam clean:**

1. Web ↔ Pipeline talk **only** through `apps/web/src/lib/pipeline-client.ts`
   (the single forwarder) authenticated with a shared `PIPELINE_TOKEN` bearer.
2. The pipeline writes job status **directly** to Supabase with the
   `service_role` key — it never proxies status back through Web. DB rows are
   the source of truth; the pipeline's in-memory `_streams` / `_jobs` are just a
   live cache.

---

## 2. Repository layout

```
.
├── apps/
│   └── web/                      # Next.js front-end + API gateway
│       ├── src/app/
│       │   ├── page.tsx          # landing
│       │   ├── dashboard/        # project list + live status
│       │   ├── projects/         # create / edit project pages
│       │   └── api/              # route handlers (the gateway)
│       │       ├── projects/                       # GET/POST list+create
│       │       ├── projects/draft/script/          # AI draft script
│       │       ├── projects/[id]/                  # get/update one
│       │       ├── projects/[id]/script/           # regenerate script
│       │       ├── projects/[id]/generate/         # kick off generation
│       │       ├── projects/[id]/generation-status/# poll job status
│       │       ├── avatars/                        # avatar template list
│       │       ├── streams/start/                  # start RTMP push
│       │       └── streams/[id]/stop/              # stop RTMP push
│       └── src/lib/
│           ├── pipeline-client.ts  # the ONLY caller of the GPU service
│           ├── supabase-server.ts  # server client (service-role)
│           └── demo-scripts.ts / demo-user.ts / utils.ts
│
├── services/
│   └── pipeline/                 # FastAPI GPU service (see its own README)
│       ├── app/
│       │   ├── main.py           # routes: /generate /stream/* /health
│       │   ├── pipeline.py       # the TTS→…→upload orchestration
│       │   ├── musetalk.py       # MuseTalk subprocess wrapper
│       │   ├── face_restore.py   # GFPGAN step (toggle GFPGAN_ENABLED)
│       │   ├── ffmpeg_ops.py     # concat / transcode / RTMP push
│       │   ├── streaming.py      # ffmpeg push process bookkeeping
│       │   ├── storage.py        # Supabase Storage upload
│       │   └── tts/              # azure | volcengine | edge providers
│       ├── Dockerfile            # CUDA 12.1 image, clones MuseTalk
│       ├── docker-compose.yml    # GPU reservation + volumes + healthcheck
│       ├── docker-entrypoint.sh  # downloads ~15GB weights on first boot
│       ├── deploy.sh             # laptop → GPU host redeploy over SSH
│       └── scripts/              # bootstrap_pod.sh, smoke + setup helpers
│
└── supabase/
    ├── migrations/
    │   ├── 0001_initial_schema.sql  # profiles / avatars / projects / generations / streams + RLS
    │   └── 0002_demo_seed.sql       # demo seed data
    └── README.md
```

---

## 3. Data model (Supabase Postgres)

| Table | Purpose |
|-------|---------|
| `profiles` | seller account profile (1:1 with the auth user) |
| `avatars` | avatar template videos a project can pick from |
| `projects` | one row per seller project (avatar, script, voice, Shopee stream key) |
| `generations` | one row per `/generate` job — status, output mp4 URL, error message |
| `streams` | one row per RTMP push — live/stopped, duration, ffmpeg handle |

Row-Level Security is on. The browser uses the **anon** key (RLS-scoped); the
Web server routes and the pipeline use the **service_role** key (RLS bypass) for
trusted writes.

---

## 4. End-to-end flow

1. Seller creates a project from the **dashboard** (drafts autosave via
   `POST /api/projects/draft`) → `POST /api/projects` writes a `projects` row.
2. Seller hits **Generate** → `POST /api/projects/[id]/generate` → the gateway
   calls `pipeline-client.ts` → `POST {PIPELINE}/generate` with the bearer token.
3. Pipeline runs async: **download template → TTS (per segment, parallel) →
   concat audio → MuseTalk lip-sync → GFPGAN (optional) → transcode → upload**,
   writing status to the `generations` row at each step.
4. Dashboard polls `GET /api/projects/[id]/generation-status` until the status
   is `done`, then shows the mp4.
5. Seller hits **Go live** → `POST /api/streams/start` → pipeline starts an
   ffmpeg RTMP push loop to the Shopee ingest URL; `streams` row tracks it.
6. `POST /api/streams/[id]/stop` kills the ffmpeg process.

**Pipeline endpoints** (called only via the Web gateway):

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/health` | liveness (no auth) |
| POST | `/generate` | start async generation |
| GET | `/generate/{project_id}` | poll job status |
| POST | `/stream/start` | start RTMP push |
| POST | `/stream/stop?stream_id=` | kill push |
| GET | `/stream/{stream_id}/status` | live/stopped + duration |

---

## 5. Key MVP decisions (from the Day 0 review)

1. **One MuseTalk run, not six.** Concat the per-segment TTS into a single audio
   file and run MuseTalk **once** over the template — avoids inter-segment
   "face jumps" and saves 6× model cold-start.
2. **Never shell-out user text.** TTS providers are called via SDK/HTTP only, so
   a seller's script with `'`, `"`, `$` can't inject into a shell.
3. **Re-encode for RTMP, don't `-c copy`.** Bake `libx264 + aac`, GOP=2s,
   `-fflags +genpts`. `-c copy + -stream_loop -1` causes PTS resets that Shopee
   treats as stream disconnects.
4. **Azure is the default TTS.** Volcengine gates Thai behind ¥1000/month and
   edge-tts is 403'd globally; Azure has Thai neural voices pay-as-you-go with a
   500K char/month free tier. Switch with `TTS_PROVIDER=volcengine|edge`.
5. **Shopee product scrape = manual fill in MVP.** Anti-bot is too heavy;
   auto-scrape deferred to v1.1.
6. **stream_key stored plaintext + RLS for MVP.** Move to pgcrypto/KMS after the
   acceptance pass.

---

## 6. Local development

### Web (`apps/web/`)

```bash
cd apps/web
cp .env.example .env.local        # fill Supabase + PIPELINE_API_URL + PIPELINE_TOKEN
npm install
npm run dev                       # http://localhost:3000
```

> ⚠️ This is **Next.js 16 + React 19**, not the Next 14 some docs assume. The
> APIs/conventions differ — see `apps/web/AGENTS.md` and read
> `node_modules/next/dist/docs/` before writing components.

Required in `.env.local`: `NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (server-only),
`PIPELINE_API_URL` (dev → `http://localhost:8000`), `PIPELINE_TOKEN`.

### Pipeline (`services/pipeline/`) — no GPU needed locally

```bash
cd services/pipeline
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env              # keep MUSETALK_ENABLED=0 locally
uvicorn app.main:app --reload --port 8000
python -m scripts.smoke_test      # writes output/smoke.mp4
```

Local dev runs `MUSETALK_ENABLED=0` — the lip-sync step is replaced by an ffmpeg
loop+mux fallback, so the rest of the pipeline (TTS, concat, transcode, RTMP)
still works without a GPU.

---

## 7. Production deploy

- **Web → Vercel.** Push to the branch; Vercel builds and deploys. Set the same
  env vars in the Vercel project settings.
- **Pipeline → UCloud GPU host (Docker).** Full instructions in
  [`services/pipeline/README.md`](services/pipeline/README.md). Short version:

  ```bash
  cd services/pipeline
  cp .env.example .env             # PIPELINE_TOKEN, Azure, Supabase; HF_ENDPOINT=huggingface.co outside China
  docker compose up -d --build     # first run ~30-50 min (build + 15GB weights)
  curl http://localhost:8000/health
  ```

  Redeploy from your laptop: `PIPELINE_SSH=user@host bash services/pipeline/deploy.sh`.

**`PIPELINE_TOKEN` must match exactly** between `apps/web` (Vercel env) and
`services/pipeline/.env` — it's the only auth between the two services.

### GPU sizing (quick reference)

- **≥16 GB VRAM** (T4 / A10 / V100 / 4090 / A100): runs MuseTalk + GFPGAN.
- **8 GB cards**: set `GFPGAN_ENABLED=0`, expect OOM risk — not recommended.
- **Avoid Pascal (P40/P4)**: no usable fp16, very slow.
- One GPU is enough (jobs run one at a time).

---

## 8. Where to look next

- Front-end specifics → `apps/web/AGENTS.md`
- Pipeline deploy, TTS setup, Supabase Storage, troubleshooting →
  `services/pipeline/README.md`
- DB schema + RLS → `supabase/migrations/0001_initial_schema.sql`, `supabase/README.md`
- Project conventions + current mission → `CLAUDE.md`, `.kasidit/MISSION.md`
