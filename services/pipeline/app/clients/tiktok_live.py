"""TikTok LIVE chat client — the one place we talk to TikTok's live websocket.

Uses the TikTokLive connector (unofficial; the live chat stream is signed via
the Euler Stream sign server). READ-ONLY: we subscribe to a creator's public
live chat by @username. No login, no posting back to chat — TikTok exposes no
official API for either, and this module exists only to ingest/test comments.

Per the layer map this is a clients/ module (external network API). Task
lifecycle + the comment buffer live in services/tiktok_service.py.
"""
from TikTokLive import TikTokLiveClient


def make_client(username: str) -> TikTokLiveClient:
    """Build a client for a creator's live by @username (the '@' is optional)."""
    uid = username if username.startswith("@") else f"@{username}"
    return TikTokLiveClient(unique_id=uid)


def _first_attr(obj, *names):
    """First non-empty attribute among `names`, else ''."""
    for n in names:
        v = getattr(obj, n, None)
        if v:
            return v
    return ""


def normalize_comment(event) -> dict:
    """Flatten a TikTokLive CommentEvent into a plain JSON-able dict.

    Field names drift across the connector's 6.x line: the convenience shape is
    `event.comment` + `event.user.nickname`/`.unique_id`, the raw-proto shape is
    `event.content` + `event.user_info.nick_name`/`.username`/`.id`. Cover both
    so a version bump degrades to 'unknown'/'' instead of crashing the listener.
    """
    user = getattr(event, "user", None) or getattr(event, "user_info", None)
    nickname = _first_attr(user, "nickname", "nick_name", "unique_id", "username") or "unknown"
    user_id = _first_attr(user, "unique_id", "username", "id_str") or str(getattr(user, "id", "") or "")
    return {
        "user": nickname,
        "user_id": user_id,
        "text": _first_attr(event, "comment", "content"),
    }
