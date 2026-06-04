# ReforgeAILiveHost

AI digital-human livestream studio — turn a presenter photo/video + a script
into a lip-synced clip, stream it 24/7 over RTMP, read live comments and
auto-reply with AI, and even let the system **find news and produce sales-pitch
clips on its own** while the GPU would otherwise sit idle.

> **One sentence:** pick a presenter → AI writes the script (Qwen) → TTS →
> Wav2Lip lip-sync → ffmpeg → mp4 in the gallery or straight to Facebook /
> Shopee / TikTok Live.

---

## 1. Quick start

### A. Production — one command on a GPU server

```bash
git clone <repo> reforge
cd reforge/deploy
./init.sh
```

That's the whole install. When it finishes (first run ~30 min: image builds +
~700 MB weights + ~2 GB Qwen model):

```
Console : http://console.<your-ip>.nip.io
API     : http://api.<your-ip>.nip.io
Status  : http://status.<your-ip>.nip.io
```

Requirements: Linux + NVIDIA GPU (≥8 GB VRAM, e.g. RTX 4090) +
[nvidia-container-toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html),
Docker + compose v2, ~15 GB disk, public IPv4 (for nip.io wildcard DNS).
`init.sh` is idempotent — re-run it any time; secrets/models/DB are kept.
Details + knobs: [`deploy/README.md`](deploy/README.md).

### B. Local development — no GPU needed

```bash
# Web only (against an existing API/Supabase):
cd apps/web
cp .env.example .env.local       # Supabase keys + PIPELINE_API_URL + PIPELINE_TOKEN
npm install && npm run dev       # http://localhost:3000

# Or the whole stack on a Mac/laptop (CPU mode, lip-sync mocked):
cd deploy && ./init-local.sh     # see deploy/LOCAL_SETUP.md
```

> ⚠️ The web app is **Next.js 16 + React 19** — conventions differ from older
> docs/LLM training data. Read `apps/web/AGENTS.md` and
> `node_modules/next/dist/docs/` before writing components.

---

## 2. Architecture

One GPU box runs everything via `deploy/docker-compose.yml`:

```
            browser ──► nginx :80  (console.* / api.* / status.* vhosts)
                          │
        ┌─────────────────┼──────────────────────────────┐
        ▼                 ▼                              ▼
  web (Next.js 16)   pipeline (FastAPI)             status page
  UI + API gateway   TTS → lip-sync → ffmpeg → RTMP
  gallery news loop       │            │
        │            lipsync (Wav2Lip, GPU)
        │            qwen (ollama, Qwen2.5:3b — scripts + replies)
        ▼                 │
  nginx :8088 ──► rest (PostgREST) ──► db (Postgres 15)
  (internal DB gateway)        rendered mp4s → DATA_DIR, served by nginx
```

| Service  | Source                | Role |
|----------|-----------------------|------|
| web      | `apps/web/`           | Next.js console + API routes (the only public API) + server-side gallery loop |
| pipeline | `services/pipeline/`  | Orchestration: TTS (Azure/MMS/edge) + OpenVoice clone + ffmpeg render/RTMP |
| lipsync  | `services/lipsync/`   | Wav2Lip lip-sync on GPU (MuseTalk opt-in via `LIPSYNC_MODEL=musetalk`) |
| qwen     | ollama image          | Local LLM — script generation, news sales-pitch, live auto-reply |
| db, rest | postgres + postgrest  | Lean-Supabase: same schema/RLS as Supabase cloud, no vendor lock |
| nginx    | nginx:alpine          | Public vhosts on :80, internal PostgREST gateway on :8088, serves rendered mp4s |

**Two rules that keep the seams clean:**

1. Web ↔ pipeline talk **only** through `apps/web/src/lib/pipeline-client.ts`,
   authenticated with the shared `PIPELINE_TOKEN` bearer.
2. The pipeline writes job status **directly** to the DB (service key) — it
   never proxies status back through web. DB rows are the source of truth;
   in-memory `_streams`/`_jobs` are just a live cache.

---

## 3. Features ↔ where they live

| Feature | UI | Key code |
|---------|----|----------|
| Project wizard → render clip | `/projects/new`, `/projects/[id]` | `api/projects/[id]/render` → pipeline `/render` |
| **Auto news clips (gallery)** | `/gallery` | `lib/gallery-loop.ts` (server loop) + `api/gallery/*` + `lib/news.ts` |
| Live comments + AI auto-reply | `/live`, `/live/fb-test` | `lib/facebook.ts`, `api/fb/*`, `api/ai-reply` |
| Presenters (avatars) CRUD | `/avatars` | `api/avatars/*`, uploads via `api/uploads` |
| System status / GPU monitor | `/status` | `lib/system-status.ts`, `api/system/*` |
| Settings (live config, no redeploy) | `/settings` | `api/config` → `system_config` table |

### The gallery loop (auto news → sales-pitch clips)

Press **Start** on `/gallery` and the server loops until someone presses Stop:

1. fetch headlines — **Brave Search News API** if a key is set in Settings,
   else Google News RSS (free fallback, no key),
2. skip headlines already turned into clips (dedup on the article URL),
3. Qwen writes a short script that narrates the news and pitches your product,
4. render through the normal pipeline, clip appears in the gallery grid,
5. repeat.

The loop runs **inside the web container** (`lib/gallery-loop.ts`) — closing
the browser doesn't stop it; every open page shows the same live on/off state
via SSE (`/api/gallery/loop/stream`); a container restart resumes a running
loop (`src/instrumentation.ts`).

### Settings & secrets

All runtime behaviour (TTS provider/voice, render mode, voice clone, video
quality, lip blend, Azure key, Facebook Page token, **Brave API key**, …) is
edited live in **Console → Settings** and stored in the `system_config` table —
no redeploy. Saved API keys preview masked (last 5 chars; `(20)***AbCdE` when
more than 10 chars are hidden).

---

## 4. Repository layout

```
.
├── apps/web/                  # Next.js 16 console + API gateway
│   └── src/
│       ├── app/               # pages: dashboard / projects / avatars / gallery / live / status / settings
│       ├── app/api/           # route handlers — the public API
│       ├── components/        # shadcn/ui + shared widgets (KeyInput, UploadTile, …)
│       ├── lib/               # pipeline-client, gallery-loop, news, sse, i18n, system-config…
│       └── instrumentation.ts # server-boot hook (resumes gallery loop)
├── services/
│   ├── pipeline/              # FastAPI: TTS + voice clone + ffmpeg + RTMP (own README)
│   └── lipsync/               # FastAPI: Wav2Lip / MuseTalk lip-sync (GPU)
├── deploy/                    # ★ one-command production deploy
│   ├── init.sh                # the one command (idempotent)
│   ├── init-local.sh          # Mac/laptop CPU variant
│   ├── docker-compose.yml     # the 7 services
│   ├── nginx/                 # vhost template (console/api/status + :8088 gateway)
│   ├── scripts/               # secrets, model download, db bootstrap
│   └── README.md / LOCAL_SETUP.md
└── supabase/
    └── migrations/            # 0001 schema+RLS · 0002 demo seed · 0003 runtime drift
```

i18n: every UI string lives in `apps/web/src/lib/i18n.ts` as a flat
`'ns.key'` dict ×3 locales (EN/中文/ไทย) — add keys to **all three**.

---

## 5. Data model (Postgres)

| Table | Purpose |
|-------|---------|
| `profiles` | seller account (1:1 auth user; demo user in MVP) |
| `avatars` | presenter templates — preview image + template video |
| `projects` | one per project: avatar, script segments, voice, language. Auto-news clips are projects tagged `product_info.source='auto-news'` |
| `generations` | one per render job — status, progress, output mp4 URL, `meta` jsonb (mode/voice/quality…) |
| `streams` | one per RTMP push — live/stopped, ffmpeg handle |
| `system_config` | key-value: live app settings (`system_config_v1`), gallery loop state (`gallery_loop_v1`) |

RLS is on; the browser gets the anon key, server routes + pipeline use the
service key.

---

## 6. Configuration

`deploy/.env` (generated by `init.sh`, **git-ignored — never commit**):

| Var | Meaning |
|-----|---------|
| `HOST_IP` | public IP for nip.io vhosts — **set manually if the box is NAT'd** (auto-detect picks the internal 10.x) |
| `DATA_DIR` | models, Postgres data, rendered mp4s (default `/data/reforge`) |
| `HF_MIRROR` | `https://hf-mirror.com` in China, `https://huggingface.co` elsewhere |
| `PIPELINE_TOKEN`, `JWT_SECRET`, `ANON_KEY`, `SERVICE_KEY`, `SUPERPASS`, `AUTHPASS` | generated secrets |
| `LIPSYNC_MODEL` | `wav2lip` (default) or `musetalk` (+6 GB weights, slower, higher quality) |

Everything else (provider keys, voices, quality, …) lives in **Settings** in
the app — see §3.

---

## 7. Operating in production

```bash
cd /root/reforge/deploy           # (or wherever you cloned)
docker compose ps                 # health
docker compose logs -f pipeline   # tail a service
docker compose down               # stop (data persists in DATA_DIR)
```

**Redeploy after code changes** (code is baked into images — a restart alone
is NOT enough):

```bash
cd /root/reforge && git pull
cd deploy && set -a && . ./.env && set +a
docker compose build web pipeline lipsync
docker compose up -d web pipeline lipsync nginx --force-recreate
```

(~2 min when only `web` changed; build just the services you touched.)

### Troubleshooting quick hits

- **Weird/robotic voice while Azure is configured** → Settings → TTS → tone:
  voice clone ON pipes Azure audio through OpenVoice. Switch to *original*.
- **Gallery says "all current headlines already used"** → dedup works; set a
  news *topic* for a fresh result set, or wait for new headlines (5 min auto-retry).
- **Renders fail with EACCES** → `chown -R 1000:1000 $DATA_DIR/pipeline`
  (pipeline container runs as uid 1000).
- **lipsync crashloops `ImportError ... build_model`** → missing
  `__init__.py` files; make sure your global gitignore doesn't swallow `_*`.
- Slow image pulls with retries → prune dead registry mirrors in
  `/etc/docker/daemon.json`.

---

## 8. Key design decisions

1. **One lip-sync run per clip, not per segment** — concat TTS audio first;
   avoids inter-segment face jumps and per-segment model cold-starts.
2. **Wav2Lip by default, MuseTalk opt-in** — MuseTalk needs mmcv CUDA ops that
   segfault on some hosts plus 6 GB of weights.
3. **Never shell-out user text** — TTS via SDK/HTTP only; scripts with
   `'"$` can't inject.
4. **Re-encode for RTMP, never `-c copy`** — `libx264+aac`, GOP=2s,
   `-fflags +genpts`; copy+loop causes PTS resets that platforms read as
   disconnects.
5. **Azure is the quality TTS** (Thai neural voices, 500K chars/month free);
   MMS-TTS runs offline as the no-key default, edge-tts as last resort.
6. **SSE, not WebSocket** — `next start` route handlers can't upgrade to WS;
   SSE gives the same server-push through nginx with auto-reconnect
   (`lib/sse.ts`).
7. **Lean-Supabase on the box** — plain Postgres + PostgREST with the same
   schema/keys as Supabase cloud, so the web code is identical in both worlds.

---

## 9. Where to look next

- One-command deploy details → [`deploy/README.md`](deploy/README.md)
- Local laptop stack → [`deploy/LOCAL_SETUP.md`](deploy/LOCAL_SETUP.md)
- Pipeline internals (TTS, RTMP, storage) → [`services/pipeline/README.md`](services/pipeline/README.md)
- DB schema + RLS → `supabase/migrations/`
- Front-end conventions → `apps/web/AGENTS.md`
- Project conventions + current mission → `CLAUDE.md`, `.kasidit/MISSION.md`
