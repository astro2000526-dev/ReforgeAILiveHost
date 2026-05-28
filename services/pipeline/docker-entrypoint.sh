#!/usr/bin/env bash
# Container entrypoint for the pipeline service.
#
# Job 1: ensure model weights exist (they live on a host volume so they survive
#        rebuilds; on first boot of a fresh volume the dir is empty and we
#        download via MuseTalk's own script).
# Job 2: exec the CMD (uvicorn).
#
# Idempotent: skips download when expected files are already there.
set -euo pipefail

cd /workspace

WEIGHT_SENTINEL="MuseTalk/models/musetalkV15/unet.pth"

if [ ! -f "$WEIGHT_SENTINEL" ]; then
    echo "[entrypoint] weights missing at $WEIGHT_SENTINEL — downloading..."
    echo "[entrypoint] HF endpoint: ${HF_ENDPOINT:-default}"
    pushd MuseTalk >/dev/null
    bash download_weights.sh
    popd >/dev/null

    # Hard verify — fail loudly rather than letting MuseTalk crash later.
    for f in \
        "MuseTalk/models/musetalkV15/unet.pth" \
        "MuseTalk/models/musetalkV15/musetalk.json" \
        "MuseTalk/models/sd-vae" \
        "MuseTalk/models/whisper"
    do
        if [ ! -e "$f" ]; then
            echo "[entrypoint] ERROR: expected weight artifact missing: $f" >&2
            echo "[entrypoint] download_weights.sh may have failed. Try re-running:" >&2
            echo "[entrypoint]   docker compose exec pipeline bash -c 'cd MuseTalk && bash download_weights.sh'" >&2
            exit 1
        fi
    done
    echo "[entrypoint] weights ready."
else
    echo "[entrypoint] weights present, skipping download."
fi

# GFPGAN weight check (separate path; download_weights.sh of older MuseTalk
# revs doesn't fetch this). Non-fatal: GFPGAN_ENABLED=0 in .env means we skip
# the restore step entirely.
GFPGAN_W="MuseTalk/gfpgan_weights/GFPGANv1.4.pth"
if [ "${GFPGAN_ENABLED:-0}" = "1" ] && [ ! -f "$GFPGAN_W" ]; then
    echo "[entrypoint] GFPGAN enabled but weight missing at $GFPGAN_W."
    echo "[entrypoint] Download manually:"
    echo "[entrypoint]   mkdir -p MuseTalk/gfpgan_weights && \\"
    echo "[entrypoint]   wget -O $GFPGAN_W https://github.com/TencentARC/GFPGAN/releases/download/v1.3.0/GFPGANv1.4.pth"
    echo "[entrypoint] Continuing without GFPGAN."
    export GFPGAN_ENABLED=0
fi

echo "[entrypoint] starting: $*"
exec "$@"
