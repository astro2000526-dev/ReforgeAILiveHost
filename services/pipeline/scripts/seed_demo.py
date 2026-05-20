"""Apply the demo seed without running 0002_demo_seed.sql.

Why we can't just run the migration:
  0002_demo_seed.sql includes an `alter table … drop constraint` DDL statement
  that we can't execute through the Supabase REST API (it doesn't accept
  arbitrary SQL). And running the SQL editor manually is exactly what the user
  asked us to avoid.

Workaround:
  1. Create a real auth user with a pinned UUID via the GoTrue admin API.
     The schema's on_auth_user_created trigger will insert the matching
     profiles row, so we never need to drop the FK constraint.
  2. Insert the 3 demo avatars via supabase-py (no FK to auth, easy).

Run:
    python -m scripts.seed_demo
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

try:
    from dotenv import load_dotenv

    load_dotenv(Path(__file__).resolve().parent.parent / ".env")
except ImportError:
    pass

import httpx
from supabase import create_client


DEMO_USER_ID = "00000000-0000-0000-0000-000000000001"
DEMO_EMAIL = "demo@reforge.ai"

AVATARS = [
    {
        "id": "11111111-1111-1111-1111-111111111101",
        "name": "小美 — 元气女主播",
        "preview_image_url": "https://placehold.co/400x600/fde2e7/c43d6d?text=%E5%B0%8F%E7%BE%8E",
        "template_video_url": "https://placehold.co/template-xiaomei.mp4",
        "region": "CN",
        "gender": "female",
        "display_order": 10,
        "is_active": True,
    },
    {
        "id": "11111111-1111-1111-1111-111111111102",
        "name": "阿强 — 实力派带货",
        "preview_image_url": "https://placehold.co/400x600/dbeafe/1e40af?text=%E9%98%BF%E5%BC%BA",
        "template_video_url": "https://placehold.co/template-aqiang.mp4",
        "region": "CN",
        "gender": "male",
        "display_order": 20,
        "is_active": True,
    },
    {
        "id": "11111111-1111-1111-1111-111111111103",
        "name": "静静 — 知性温柔风",
        "preview_image_url": "https://placehold.co/400x600/dcfce7/166534?text=%E9%9D%99%E9%9D%99",
        "template_video_url": "https://placehold.co/template-jingjing.mp4",
        "region": "CN",
        "gender": "female",
        "display_order": 30,
        "is_active": True,
    },
]


def ensure_demo_auth_user(supabase_url: str, service_key: str) -> str:
    """Create (or look up) the demo auth user with a pinned UUID.

    Uses GoTrue admin API directly because gotrue-py's `create_user` doesn't
    expose the `id` field. The trigger on auth.users insert will populate
    public.profiles automatically.
    """
    base = supabase_url.rstrip("/")
    headers = {
        "apikey": service_key,
        "Authorization": f"Bearer {service_key}",
        "Content-Type": "application/json",
    }

    # Check if it already exists by listing users filtered by email.
    r = httpx.get(
        f"{base}/auth/v1/admin/users",
        headers=headers,
        params={"per_page": 200},
        timeout=30,
    )
    r.raise_for_status()
    for u in r.json().get("users", []):
        if u.get("id") == DEMO_USER_ID:
            return "exists"

    # Doesn't exist — create with pinned id.
    r = httpx.post(
        f"{base}/auth/v1/admin/users",
        headers=headers,
        json={
            "id": DEMO_USER_ID,
            "email": DEMO_EMAIL,
            "email_confirm": True,
            "user_metadata": {"company_name": "Demo 商家"},
        },
        timeout=30,
    )
    if r.status_code >= 400:
        raise RuntimeError(f"auth admin create_user failed: {r.status_code} {r.text}")
    return "created"


def main() -> int:
    url = os.getenv("SUPABASE_URL", "").strip()
    key = os.getenv("SUPABASE_SERVICE_KEY", "").strip()
    if not url or not key:
        print("ERROR: SUPABASE_URL and SUPABASE_SERVICE_KEY must be set in .env", file=sys.stderr)
        return 1

    print("== Demo auth user + profile ==")
    state = ensure_demo_auth_user(url, key)
    print(f"  - auth user {DEMO_USER_ID}: {state}")

    client = create_client(url, key)

    # Verify the trigger fired and the profile row exists.
    res = client.table("profiles").select("id, email, company_name").eq("id", DEMO_USER_ID).execute()
    profiles = res.data or []
    if not profiles:
        print("  - WARN: profile row not created by trigger; inserting manually")
        client.table("profiles").insert({
            "id": DEMO_USER_ID,
            "email": DEMO_EMAIL,
            "company_name": "Demo 商家",
        }).execute()
    else:
        prof = profiles[0]
        if prof.get("company_name") != "Demo 商家":
            client.table("profiles").update({"company_name": "Demo 商家"}).eq("id", DEMO_USER_ID).execute()
            print("  - profile: updated company_name")
        else:
            print(f"  - profile: ready ({prof.get('email')})")

    print()
    print("== Demo avatars ==")
    res = client.table("avatars").upsert(AVATARS).execute()
    print(f"  - upserted {len(res.data or [])} avatar(s)")

    print()
    print("All seed data ready. Open http://localhost:3000/dashboard.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
