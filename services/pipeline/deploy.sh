#!/usr/bin/env bash
# Deploy the pipeline service to a UCloud (or any) GPU host.
#
# Usage:
#   bash deploy.sh                 # default: pulls + rebuilds + restarts
#   bash deploy.sh --no-build      # pull + restart, reuse existing image
#   bash deploy.sh --rebuild       # force a clean rebuild (no cache)
#
# Environment overrides:
#   PIPELINE_SSH=user@host         # SSH target. If unset, runs locally.
#   PIPELINE_DIR=/path/on/host     # Repo path on the remote (default: ~/ReforgeAILiveHost)
#
# What it does:
#   1. (remote) git fetch + checkout the branch you're on locally
#   2. (remote) git pull
#   3. (remote) docker compose pull + up -d (with --build unless --no-build)
#   4. (remote) prune dangling images so the disk doesn't bloat
#   5. (remote) docker compose ps  +  last 20 lines of pipeline log
set -euo pipefail

MODE="default"
case "${1:-}" in
    --no-build) MODE="no-build" ;;
    --rebuild)  MODE="rebuild" ;;
    "") ;;
    *) echo "unknown arg: $1" >&2; exit 1 ;;
esac

LOCAL_BRANCH="$(git rev-parse --abbrev-ref HEAD)"
REMOTE_HOST="${PIPELINE_SSH:-}"
REMOTE_DIR="${PIPELINE_DIR:-\$HOME/ReforgeAILiveHost}"

# Compose the remote-side script. Heredoc so we can preview before sending.
REMOTE_SCRIPT=$(cat <<EOF
set -euo pipefail
cd ${REMOTE_DIR}/services/pipeline

echo "==> sync repo"
git fetch --all --prune
git checkout ${LOCAL_BRANCH}
git pull --ff-only origin ${LOCAL_BRANCH}

echo "==> compose pull"
docker compose pull --ignore-pull-failures || true

case "${MODE}" in
    rebuild)
        echo "==> rebuild (no cache)"
        docker compose build --no-cache pipeline
        ;;
    no-build)
        echo "==> skipping build"
        ;;
    *)
        echo "==> build (incremental)"
        docker compose build pipeline
        ;;
esac

echo "==> up -d"
docker compose up -d

echo "==> prune dangling images"
docker image prune -f >/dev/null

echo "==> status"
docker compose ps
echo
echo "==> last 20 log lines"
docker compose logs --tail 20 pipeline
EOF
)

if [ -n "${REMOTE_HOST}" ]; then
    echo "Deploying to ${REMOTE_HOST}:${REMOTE_DIR} (branch ${LOCAL_BRANCH}, mode ${MODE})"
    ssh "${REMOTE_HOST}" "bash -s" <<< "${REMOTE_SCRIPT}"
else
    echo "PIPELINE_SSH not set — running locally (branch ${LOCAL_BRANCH}, mode ${MODE})"
    eval "${REMOTE_SCRIPT}"
fi
