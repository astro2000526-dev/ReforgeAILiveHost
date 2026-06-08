"""FastAPI dependencies shared by all routers.

Single shared secret between Web (Next.js) and this service. The Web side
sends `Authorization: Bearer <PIPELINE_TOKEN>` from inside its API routes,
so the token never reaches the browser. Health stays open for liveness
probes (load balancer / docker healthcheck).
"""
import os
import secrets

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

_PIPELINE_TOKEN = (os.getenv("PIPELINE_TOKEN") or "").strip()
_security = HTTPBearer(auto_error=True)


async def verify_pipeline_token(
    credentials: HTTPAuthorizationCredentials = Depends(_security),
) -> None:
    if not _PIPELINE_TOKEN:
        # Fail closed: an unset token in prod is more dangerous than a 503.
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="PIPELINE_TOKEN not configured on the pipeline service",
        )
    # constant-time compare so we don't leak the secret length via timing.
    if not secrets.compare_digest(credentials.credentials, _PIPELINE_TOKEN):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="invalid pipeline token",
        )
