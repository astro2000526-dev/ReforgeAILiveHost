---
topic: docker compose GPU access (NVIDIA)
source: https://docs.docker.com/compose/how-tos/gpu-support/
fetched: 2026-05-28
stack: docker compose v2
---

# Docker Compose — NVIDIA GPU access

## Standard YAML syntax (current)

```yaml
services:
  pipeline:
    image: nvidia/cuda:12.1.0-cudnn8-runtime-ubuntu22.04
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: 1
              capabilities: [gpu]
```

## Variants

### All GPUs
```yaml
count: all
```

### Specific GPUs (mutually exclusive with count)
```yaml
device_ids: ['0', '3']
capabilities: [gpu]
```

### Extra capabilities (compute, utility, etc.)
```yaml
capabilities: [gpu, utility, compute]
```

## Rules

- `capabilities` is **mandatory** — omitting it = deploy error.
- `count` and `device_ids` are **mutually exclusive**.
- Host must have NVIDIA Container Toolkit installed before `docker compose up`.

## How to verify on host

```bash
# Toolkit installed?
nvidia-container-cli info

# Quick GPU smoke from compose
docker compose run --rm pipeline nvidia-smi
```

## For our pipeline (Reforge)

```yaml
services:
  pipeline:
    build: .
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: 1
              capabilities: [gpu]
    volumes:
      - ./data/models:/workspace/MuseTalk/models
      - ./data/tmp:/workspace/tmp
      - ./data/output:/workspace/output
    env_file: .env
    ports:
      - "8000:8000"
    restart: unless-stopped
```
