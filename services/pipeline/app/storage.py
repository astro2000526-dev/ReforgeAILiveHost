"""Supabase Storage uploader for generated videos.

Why this lives in the pipeline (not Web):
  The mp4 is on the GPU box's local disk. Vercel can't reach it. So the
  pipeline service is the only place that can push the file out. After
  upload we return a public URL — Vercel reads it and writes it to
  `generations.output_video_url` via the Next.js API route.

Bucket model (MVP):
  - One bucket: `generations` (or override via SUPABASE_STORAGE_BUCKET).
  - Public read. The videos aren't secrets; making the bucket public skips
    the signed-URL refresh dance which would otherwise hit us when a user
    reopens a project the next day.
  - Object path: `<project_id>/<generation_id>.mp4` — generation_id namespaces
    re-runs so we never overwrite a previous take.

If you don't want a public bucket, switch `_make_url` to `create_signed_url`
with a long TTL. The rest of the pipeline doesn't care which kind of URL it gets.
"""
from __future__ import annotations

import asyncio
import os
from pathlib import Path

from supabase import Client, create_client


class StorageError(RuntimeError):
    """Raised when the upload can't proceed (no creds, bucket missing, IO error)."""


_client: Client | None = None


def storage_enabled() -> bool:
    """True if SUPABASE_URL + SUPABASE_SERVICE_KEY are configured.

    When False, `generate()` skips the upload step and returns only a local
    Path. Useful for local smoke tests that don't want to push to prod buckets.
    """
    return bool(os.getenv("SUPABASE_URL", "").strip()) and bool(
        os.getenv("SUPABASE_SERVICE_KEY", "").strip()
    )


def _get_client() -> Client:
    global _client
    if _client is not None:
        return _client
    url = os.getenv("SUPABASE_URL", "").strip()
    key = os.getenv("SUPABASE_SERVICE_KEY", "").strip()
    if not url or not key:
        raise StorageError(
            "SUPABASE_URL and SUPABASE_SERVICE_KEY must be set to upload videos"
        )
    _client = create_client(url, key)
    return _client


def _bucket_name() -> str:
    return os.getenv("SUPABASE_STORAGE_BUCKET", "generations").strip() or "generations"


def _make_url(client: Client, bucket: str, object_path: str) -> str:
    # `get_public_url` on supabase-py returns the public URL string directly
    # (no API call). It's correct only if the bucket is public — which is what
    # we want for MVP. See module docstring.
    # storage3 appends a trailing "?" (empty query string) — harmless to
    # browsers/ffmpeg but ugly when written to the DB; strip it.
    return client.storage.from_(bucket).get_public_url(object_path).rstrip("?")


async def upload_video(
    local_path: Path, project_id: str, generation_id: str
) -> str:
    """Upload an mp4 and return its public URL.

    Caller must ensure storage_enabled() before calling.
    """
    if not local_path.exists():
        raise StorageError(f"video not found: {local_path}")

    client = _get_client()
    bucket = _bucket_name()
    object_path = f"{project_id}/{generation_id}.mp4"

    def _do_upload() -> str:
        store = client.storage.from_(bucket)
        with local_path.open("rb") as f:
            # upsert=true so re-generating the same (project, generation) pair
            # overwrites instead of 409'ing. We're using a uuid for generation_id
            # so the actual key is unique per run; upsert is defense in depth.
            store.upload(
                path=object_path,
                file=f,
                file_options={
                    "content-type": "video/mp4",
                    "upsert": "true",
                    "cache-control": "3600",
                },
            )
        return _make_url(client, bucket, object_path)

    return await asyncio.to_thread(_do_upload)
