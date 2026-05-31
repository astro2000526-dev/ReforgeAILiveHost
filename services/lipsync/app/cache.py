from __future__ import annotations

import hashlib
from collections import OrderedDict
from threading import Lock
from typing import Any

from .config import settings


def avatar_key(image_bytes: bytes) -> str:
    return hashlib.sha256(image_bytes).hexdigest()


class AvatarCache:
    """LRU cache for avatar face detection/landmarks/latents.

    Value is opaque to the cache; model code decides what to store
    (face box, landmarks, VAE latents, etc.).
    """

    def __init__(self, max_size: int | None = None) -> None:
        self._max = max_size or settings.max_cache_avatars
        self._store: "OrderedDict[str, Any]" = OrderedDict()
        self._lock = Lock()

    def get(self, key: str) -> Any | None:
        with self._lock:
            if key not in self._store:
                return None
            self._store.move_to_end(key)
            return self._store[key]

    def put(self, key: str, value: Any) -> None:
        with self._lock:
            if key in self._store:
                self._store.move_to_end(key)
                self._store[key] = value
                return
            self._store[key] = value
            while len(self._store) > self._max:
                self._store.popitem(last=False)

    def __len__(self) -> int:
        with self._lock:
            return len(self._store)


cache = AvatarCache()
