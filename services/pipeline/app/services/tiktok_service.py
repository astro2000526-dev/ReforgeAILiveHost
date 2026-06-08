"""TikTok LIVE ingest — connect to a creator's live, buffer recent comments.

Test/read-only flow. One background asyncio task per @username runs the signed
websocket (clients/tiktok_live.py); each CommentEvent appends to a bounded
deque the API layer polls. This module is the single owner of that in-memory
registry — mirrors state.py's role for render jobs.

Chaining note: to drive the host, the web side polls /tiktok/comments then
feeds picked text to /llm + /live/feed. Not built here — this is ingest only.
"""
import asyncio
import logging
from collections import deque
from dataclasses import dataclass, field

from TikTokLive.events import CommentEvent, ConnectEvent, DisconnectEvent

from ..clients.tiktok_live import make_client, normalize_comment

log = logging.getLogger("pipeline.tiktok")

_MAX_COMMENTS = 200  # ring buffer per listener — enough for incremental polling


@dataclass
class _Listener:
    username: str
    client: object
    task: asyncio.Task | None = None
    comments: deque = field(default_factory=lambda: deque(maxlen=_MAX_COMMENTS))
    connected: bool = False
    error: str | None = None
    seq: int = 0  # monotonic id so callers can poll with ?since=<last_id>


_listeners: dict[str, _Listener] = {}


def _key(username: str) -> str:
    return username.lstrip("@").lower()


async def connect(username: str) -> dict:
    """Spawn (or reuse) a background listener for a creator's live chat.

    Returns immediately with status; the websocket connects asynchronously.
    Poll /tiktok/sessions or /tiktok/comments to see whether it went live or
    errored (e.g. creator offline → error set on the listener).
    """
    key = _key(username)
    existing = _listeners.get(key)
    if existing and existing.task and not existing.task.done():
        return status(username)  # already running — idempotent

    client = make_client(username)
    lis = _Listener(username=key, client=client)

    @client.on(ConnectEvent)
    async def _on_connect(_):
        lis.connected = True
        lis.error = None
        log.info("tiktok connected: @%s", key)

    @client.on(DisconnectEvent)
    async def _on_disconnect(_):
        lis.connected = False
        log.info("tiktok disconnected: @%s", key)

    @client.on(CommentEvent)
    async def _on_comment(event: CommentEvent):
        lis.seq += 1
        lis.comments.append({"id": lis.seq, **normalize_comment(event)})

    async def _run():
        try:
            # connect() does the room/is-live fetch then returns the running
            # websocket Task — await THAT to block until the live ends. (It
            # only schedules; not awaiting it would end _run immediately.)
            client_task = await client.connect()
            await client_task
        except asyncio.CancelledError:
            raise
        except Exception as e:
            lis.error = f"{type(e).__name__}: {str(e)[:200]}"
            log.warning("tiktok listen failed @%s: %s", key, lis.error)
        finally:
            lis.connected = False

    lis.task = asyncio.create_task(_run())
    _listeners[key] = lis
    return status(username)


async def disconnect(username: str) -> dict:
    """Stop a listener and drop its websocket. Raises KeyError if unknown."""
    key = _key(username)
    lis = _listeners.get(key)
    if not lis:
        raise KeyError(username)
    try:
        await lis.client.disconnect()
    except Exception:  # already closed / never connected — fine
        pass
    if lis.task and not lis.task.done():
        lis.task.cancel()
    lis.connected = False
    return status(username)


def comments(username: str, since: int = 0, limit: int = 50) -> dict:
    """Return buffered comments with id > since (most recent `limit`)."""
    key = _key(username)
    lis = _listeners.get(key)
    if not lis:
        raise KeyError(username)
    items = [c for c in lis.comments if c["id"] > since][-limit:]
    last = items[-1]["id"] if items else since
    return {
        "username": key,
        "comments": items,
        "last_id": last,
        "connected": lis.connected,
        "error": lis.error,
    }


def status(username: str) -> dict:
    key = _key(username)
    lis = _listeners.get(key)
    if not lis:
        return {"username": key, "running": False, "connected": False, "error": None, "count": 0}
    return {
        "username": key,
        "running": bool(lis.task and not lis.task.done()),
        "connected": lis.connected,
        "error": lis.error,
        "count": len(lis.comments),
    }


def list_all() -> list[dict]:
    return [status(k) for k in _listeners]
