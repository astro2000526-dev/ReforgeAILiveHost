---
topic: supabase-py 2.9 Storage upload + service_role
source: https://supabase.com/docs/reference/python/storage-from-upload
fetched: 2026-05-28
stack: supabase 2.9.1, storage3 (bundled)
---

# supabase-py 2.9 — Storage upload (current code pattern in pipeline)

## Create client with service_role key (bypass RLS)

```python
from supabase import Client, create_client

url = os.environ["SUPABASE_URL"]
key = os.environ["SUPABASE_SERVICE_KEY"]  # service_role, NEVER ship to browser
client: Client = create_client(url, key)
```

## Upload mp4 with content-type + upsert

```python
bucket = "generations"
object_path = f"{project_id}/{generation_id}.mp4"

with local_path.open("rb") as f:
    client.storage.from_(bucket).upload(
        path=object_path,
        file=f,
        file_options={
            "content-type": "video/mp4",
            "upsert": "true",        # string "true", NOT boolean True
            "cache-control": "3600",
        },
    )
```

## Get public URL (no API call, string concat only)

```python
url = client.storage.from_(bucket).get_public_url(object_path)

# storage3 appends "?" (empty query string) — strip if writing to DB:
url = url.rstrip("?")
```

## Gotchas

1. `file_options` keys must be **kebab-case strings** (`"content-type"`, NOT `content_type`).
2. `upsert` must be the **string** `"true"` / `"false"`, not boolean. Boolean gets stringified to Python's `True` and rejected by storage3.
3. `get_public_url` only works if bucket is **public-read**. For private buckets use `create_signed_url(object_path, expires_in=3600)`.
4. The upload is **synchronous (blocking I/O)** in supabase-py 2.x. Wrap in `asyncio.to_thread()` if calling from async code (current pipeline does this — see `storage.py`).

## Existing usage in pipeline

`services/pipeline/app/storage.py:88` — already follows this pattern. No changes needed for docker mission.

## httpx version pin (required)

`supabase==2.9.1` requires `httpx<0.28`. Already pinned in `requirements.txt`:
```
httpx>=0.27,<0.28
```
Do NOT bump httpx to 0.28+ without also bumping supabase.
