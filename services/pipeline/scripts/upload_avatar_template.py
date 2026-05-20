r"""Upload avatar template videos to Supabase Storage and update DB rows.

Usage (PowerShell):

    # Single video for all 3 demo avatars (everyone shares the same template):
    python -m scripts.upload_avatar_template --all D:\path\to\template.mp4

    # Different video per avatar (any subset is fine — unspecified ones are kept):
    python -m scripts.upload_avatar_template `
        --xiaomei   D:\videos\xiaomei.mp4 `
        --aqiang    D:\videos\aqiang.mp4 `
        --jingjing  D:\videos\jingjing.mp4

What it does:
    1. Ensures the `avatars` bucket exists and is public.
    2. Uploads each video to avatars/<slug>/template.mp4 with upsert.
    3. Updates the matching avatars row with the public URL.

Slug -> avatar id mapping is below; aligns with seed_demo.py.
"""
from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

try:
    from dotenv import load_dotenv

    load_dotenv(Path(__file__).resolve().parent.parent / ".env")
except ImportError:
    pass

from supabase import create_client


BUCKET = "avatars"

# slug → (avatar_id, display_name). Slugs match the seed.
AVATAR_SLOTS = {
    "xiaomei":  ("11111111-1111-1111-1111-111111111101", "小美 — 元气女主播"),
    "aqiang":   ("11111111-1111-1111-1111-111111111102", "阿强 — 实力派带货"),
    "jingjing": ("11111111-1111-1111-1111-111111111103", "静静 — 知性温柔风"),
}


def ensure_bucket(client) -> None:
    existing = {b.name for b in client.storage.list_buckets()}
    if BUCKET in existing:
        info = client.storage.get_bucket(BUCKET)
        if not getattr(info, "public", False):
            client.storage.update_bucket(BUCKET, options={"public": True})
            print(f"  - bucket '{BUCKET}': flipped to public")
        else:
            print(f"  - bucket '{BUCKET}': ready (public)")
    else:
        # Free-tier projects reject bucket `file_size_limit` overrides, so we
        # don't pass one. Supabase's project-wide default (50 MB at the time of
        # writing) applies. Compress longer templates before uploading.
        client.storage.create_bucket(BUCKET, options={"public": True})
        print(f"  - bucket '{BUCKET}': created (public)")


def upload_for_slot(client, slug: str, local_path: Path) -> str:
    avatar_id, display = AVATAR_SLOTS[slug]
    if not local_path.exists():
        raise FileNotFoundError(f"{slug}: video not found at {local_path}")

    object_path = f"{slug}/template.mp4"
    store = client.storage.from_(BUCKET)
    with local_path.open("rb") as f:
        store.upload(
            path=object_path,
            file=f,
            file_options={
                "content-type": "video/mp4",
                "upsert": "true",
                "cache-control": "3600",
            },
        )
    url = store.get_public_url(object_path)
    # `get_public_url` from supabase-py sometimes returns a trailing `?`
    # — strip it so the URL is clean when written to DB.
    url = url.rstrip("?")

    client.table("avatars").update({"template_video_url": url}).eq("id", avatar_id).execute()
    print(f"  - {slug} ({display})")
    print(f"      uploaded {local_path.name} ({local_path.stat().st_size / 1024 / 1024:.1f} MB)")
    print(f"      url: {url}")
    return url


def main() -> int:
    parser = argparse.ArgumentParser(description="Upload avatar template videos.")
    parser.add_argument("--all", type=Path, help="One video to use for every demo avatar")
    parser.add_argument("--xiaomei", type=Path)
    parser.add_argument("--aqiang", type=Path)
    parser.add_argument("--jingjing", type=Path)
    args = parser.parse_args()

    url = os.getenv("SUPABASE_URL", "").strip()
    key = os.getenv("SUPABASE_SERVICE_KEY", "").strip()
    if not url or not key:
        print("ERROR: SUPABASE_URL and SUPABASE_SERVICE_KEY must be set in .env", file=sys.stderr)
        return 1

    # Resolve which file goes to which slug.
    plan: dict[str, Path] = {}
    if args.all:
        plan = {slug: args.all for slug in AVATAR_SLOTS}
    if args.xiaomei:
        plan["xiaomei"] = args.xiaomei
    if args.aqiang:
        plan["aqiang"] = args.aqiang
    if args.jingjing:
        plan["jingjing"] = args.jingjing

    if not plan:
        print("ERROR: pass --all <path> or per-slot flags (--xiaomei / --aqiang / --jingjing)", file=sys.stderr)
        parser.print_help()
        return 2

    client = create_client(url, key)

    print("== Bucket ==")
    ensure_bucket(client)
    print()
    print("== Uploads ==")
    for slug, path in plan.items():
        upload_for_slot(client, slug, path)

    print()
    print(f"Done. {len(plan)} avatar(s) updated.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
