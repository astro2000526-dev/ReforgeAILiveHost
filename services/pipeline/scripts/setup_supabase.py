"""One-time Supabase setup helper.

What it does:
  1. Creates the Storage bucket configured by SUPABASE_STORAGE_BUCKET
     (idempotent — skips if it already exists).
  2. Ensures the bucket is set to public so the Next.js side can hand video
     URLs straight to ffmpeg / <video> tags without signed-URL refresh.
  3. Verifies that the SQL migrations under supabase/migrations/ have actually
     been applied by probing for tables and demo seed rows. If anything is
     missing it prints the exact next step (the Supabase REST API doesn't
     allow arbitrary SQL execution, so the migrations themselves still need
     to be pasted into the Dashboard SQL editor the first time).

Run:
    python -m scripts.setup_supabase
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

# Load .env from the pipeline root so this works as `python -m scripts.setup_supabase`.
try:
    from dotenv import load_dotenv

    load_dotenv(Path(__file__).resolve().parent.parent / ".env")
except ImportError:
    pass

from supabase import create_client


def main() -> int:
    url = os.getenv("SUPABASE_URL", "").strip()
    key = os.getenv("SUPABASE_SERVICE_KEY", "").strip()
    bucket = os.getenv("SUPABASE_STORAGE_BUCKET", "generations").strip() or "generations"
    if not url or not key:
        print("ERROR: SUPABASE_URL and SUPABASE_SERVICE_KEY must be set in .env", file=sys.stderr)
        return 1

    client = create_client(url, key)
    storage = client.storage

    print(f"== Storage bucket '{bucket}' ==")
    existing_names = {b.name for b in storage.list_buckets()}
    if bucket in existing_names:
        # Make sure it's public — flip it if needed.
        info = storage.get_bucket(bucket)
        is_public = getattr(info, "public", False)
        if not is_public:
            storage.update_bucket(bucket, options={"public": True})
            print(f"  - already existed; flipped to public")
        else:
            print(f"  - already exists and is public — nothing to do")
    else:
        storage.create_bucket(bucket, options={"public": True})
        print(f"  - created (public read enabled)")

    print()
    print("== Migrations check ==")
    missing: list[str] = []

    def probe(table: str, *, expect_rows: bool = False, label: str | None = None) -> None:
        try:
            res = client.table(table).select("*", count="exact").limit(1).execute()
            count = res.count or 0
            shown = label or table
            if expect_rows and count == 0:
                print(f"  - {shown}: table OK but EMPTY (seed not applied?)")
                missing.append(f"{table} (seed)")
            else:
                print(f"  - {shown}: OK ({count} row{'s' if count != 1 else ''})")
        except Exception as e:
            msg = str(e)
            # PostgREST returns a structured "relation does not exist" when the
            # table is missing. Anything else is unexpected.
            if "PGRST" in msg or "does not exist" in msg or "relation" in msg.lower():
                print(f"  - {table}: MISSING")
                missing.append(table)
            else:
                print(f"  - {table}: UNKNOWN ERROR — {msg[:200]}")
                missing.append(table)

    probe("profiles", expect_rows=True, label="profiles (demo seed)")
    probe("avatars", expect_rows=True, label="avatars (demo seed)")
    probe("projects")
    probe("generations")
    probe("streams")

    print()
    if missing:
        print("Some tables / seeds are missing. Paste the SQL into the Supabase")
        print("Dashboard → SQL Editor → New query:")
        for fname in ("0001_initial_schema.sql", "0002_demo_seed.sql"):
            print(f"  - supabase/migrations/{fname}")
        return 2

    print("All set. Pipeline can upload to Storage and the Web side can read rows.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
