# Local setup (Mac / no-GPU)

Run the **web + db + PostgREST + nginx** stack locally on a Mac with Docker Desktop —
no NVIDIA GPU needed. Video generation (`pipeline` / `lipsync` / `qwen`) stays off;
everything else (UI, auth, DB, Facebook-comment reading) works.

> The full-stack one-click `./init.sh` is for the **UCloud GPU host** only — it needs
> `nvidia-smi` and writes to `/data`, so it fails on macOS. Use `./init-local.sh` here.

## 1. Prerequisites

- **Docker Desktop** running (`docker info` must succeed)
- `openssl`, `curl`, `envsubst` (`brew install gettext` for `envsubst`)

## 2. Start

```bash
cd deploy
./init-local.sh
```

First run builds the web image (a few minutes). It will:

- write local overrides into `deploy/.env` (`HOST_IP=127.0.0.1`, a writable `DATA_DIR`,
  `DB_HOST_PORT=5433`, `HTTP_PORT=8080`)
- generate secrets, bring up `db`, seed/migrate, then `rest` + `web` + `nginx`
- skip every GPU service

When it finishes:

```
Console : http://console.127.0.0.1.nip.io:8080   (= localhost)
DB      : postgres://postgres@127.0.0.1:5433
```

## 3. Ports

Defaults dodge conflicts with another local "console" project. Override per-run:

```bash
HTTP_PORT=9090 LOCAL_DB_PORT=5455 ./init-local.sh
```

| service | host port | why not the default |
|---------|-----------|---------------------|
| nginx   | **8080**  | a native nginx often holds `:80` |
| db      | **5433**  | another Postgres often holds `:5432` |

The internal compose network still uses `:80` / `:5432`, so `rest` / `web` / seeding
are unaffected — only the host-published port changes (env-driven in `docker-compose.yml`,
so the UCloud deploy keeps its `80` / `5432` defaults).

## 4. Facebook Live comments (optional)

To use the live comment reader + AI auto-reply (`/live/fb-test`):

1. Open **Settings** → section *Facebook Live · comments*
2. Paste a **Page Access Token** + **Live Video ID**, Save

⚠️ Requires a **Facebook Page** — personal profiles are not supported by the Graph API.

- Token: developers.facebook.com → Graph API Explorer → *Get Page Access Token*
  (permissions `pages_read_engagement` + `pages_manage_engagement`)
- Video ID: `GET /me/live_videos?fields=id,status&access_token=<TOKEN>`, pick the `LIVE` one
- AI replies route through the pipeline `/llm` (Qwen) — that part needs the GPU host;
  comment **reading + posting** work without a GPU.

## 5. Manage

```bash
docker compose -f deploy/docker-compose.yml ps                 # status
docker compose -f deploy/docker-compose.yml logs -f web        # web logs
docker compose -f deploy/docker-compose.yml down               # stop all
```

## Alternative: plain `npm run dev`

For pure frontend work against **Supabase cloud** (not the local Postgres):

```bash
cd apps/web && npm run dev
```

If lang/dark toggles or other interactivity break in dev, the cause is usually a
stale build or drifted deps — `rm -rf .next && npm install && npm run dev`.
