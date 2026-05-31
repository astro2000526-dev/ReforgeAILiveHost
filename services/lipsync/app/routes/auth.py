from __future__ import annotations

from fastapi import Header, HTTPException, status

from ..config import settings


def require_token(authorization: str | None = Header(default=None)) -> None:
    if settings.api_token is None:
        return
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "missing bearer token")
    token = authorization.split(" ", 1)[1].strip()
    if token != settings.api_token:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "invalid token")
