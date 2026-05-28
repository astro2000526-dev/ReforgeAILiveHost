---
topic: FastAPI Bearer token auth (single shared secret)
source: https://fastapi.tiangolo.com/tutorial/security/
fetched: 2026-05-28
stack: fastapi 0.115.5
---

# FastAPI 0.115 — Bearer token dependency (no OAuth2/JWT)

## Minimum viable pattern

```python
import os
from fastapi import Depends, FastAPI, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

app = FastAPI()
security = HTTPBearer()

PIPELINE_TOKEN = os.environ["PIPELINE_TOKEN"]  # crash on boot if missing

async def verify_token(
    credentials: HTTPAuthorizationCredentials = Depends(security),
) -> None:
    if credentials.credentials != PIPELINE_TOKEN:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="invalid pipeline token",
        )

@app.post("/generate", dependencies=[Depends(verify_token)])
async def generate_endpoint(...):
    ...
```

## Why `dependencies=[Depends(...)]` (not parameter Depends)

For pure auth checks that don't pass anything to the handler, putting the dep
in the **path decorator's `dependencies=`** keeps the handler signature clean.

```python
# good — no unused token param polluting the function
@app.post("/stream/start", dependencies=[Depends(verify_token)])
async def stream_start(req: StreamStartRequest): ...

# also fine but verbose
@app.post("/stream/start")
async def stream_start(
    req: StreamStartRequest,
    _: None = Depends(verify_token),
): ...
```

## Apply to a group of endpoints (FastAPI 0.115 API)

```python
from fastapi import APIRouter, Depends

protected = APIRouter(dependencies=[Depends(verify_token)])

@protected.post("/generate")
async def generate(...): ...

@protected.post("/stream/start")
async def stream_start(...): ...

app.include_router(protected)
```

## Health endpoint stays open

`/health` should NOT have the auth dep, so load balancer / k8s probe still works:

```python
@app.get("/health")
async def health():
    return {"ok": True}
```

## Caller side (Next.js)

```ts
await fetch(`${PIPELINE_URL}/generate`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${process.env.PIPELINE_TOKEN}`,
  },
  body: JSON.stringify(payload),
})
```

## Gotcha

The doc snippet returned by AI sometimes writes `HTTPAuthCredentials` — the
actual class name is **`HTTPAuthorizationCredentials`**. Import from
`fastapi.security`.

## OpenAPI docs

`HTTPBearer` auto-adds the "Authorize" button at `/docs`. Click → paste raw
token (no "Bearer " prefix). FastAPI handles the formatting.
