"""Host resource readers for /system/status.

All best-effort: /proc/* exists in the Linux container, nvidia-smi only on the
GPU box — each falls back to None/[] so the same code runs on the Mac no-GPU
deploy.
"""
import asyncio
import subprocess
from pathlib import Path


def read_proc_cpu() -> tuple[int, int] | None:
    """(busy, total) jiffies from the aggregate cpu line of /proc/stat."""
    try:
        nums = [int(p) for p in Path("/proc/stat").read_text().splitlines()[0].split()[1:]]
        total = sum(nums)
        idle = nums[3] + (nums[4] if len(nums) > 4 else 0)  # idle + iowait
        return total - idle, total
    except Exception:
        return None


async def cpu_percent() -> float | None:
    a = read_proc_cpu()
    if not a:
        return None
    await asyncio.sleep(0.25)
    b = read_proc_cpu()
    if not b:
        return None
    busy, total = b[0] - a[0], b[1] - a[1]
    return round(busy / total * 100, 1) if total > 0 else None


def mem_info() -> dict | None:
    """MemTotal/MemAvailable from /proc/meminfo (kB → bytes)."""
    try:
        info: dict[str, int] = {}
        for line in Path("/proc/meminfo").read_text().splitlines():
            k, v = line.split(":", 1)
            info[k.strip()] = int(v.strip().split()[0]) * 1024
        total = info["MemTotal"]
        avail = info.get("MemAvailable", info.get("MemFree", 0))
        return {
            "total_bytes": total,
            "used_bytes": total - avail,
            "percent": round((total - avail) / total * 100, 1),
        }
    except Exception:
        return None


def gpu_info() -> list[dict]:
    try:
        r = subprocess.run(
            [
                "nvidia-smi",
                "--query-gpu=name,utilization.gpu,memory.used,memory.total,temperature.gpu",
                "--format=csv,noheader,nounits",
            ],
            capture_output=True, text=True, timeout=5,
        )
        if r.returncode != 0:
            return []
        gpus = []
        for line in r.stdout.strip().splitlines():
            name, util, mem_used, mem_total, temp = [p.strip() for p in line.split(",")]
            gpus.append({
                "name": name,
                "util_percent": float(util),
                "mem_used_mb": float(mem_used),
                "mem_total_mb": float(mem_total),
                "temp_c": float(temp),
            })
        return gpus
    except Exception:
        return []
