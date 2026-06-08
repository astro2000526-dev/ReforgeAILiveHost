"""System status: resources + all task state — consumed by the web /status page."""
import os
import shutil

from fastapi import APIRouter, Depends

from .. import state
from ..config import OUTPUT_DIR
from ..deps import verify_pipeline_token
from ..streaming import list_streams
from ..sysinfo import cpu_percent, gpu_info, mem_info

router = APIRouter()


@router.get("/system/status", dependencies=[Depends(verify_pipeline_token)])
async def system_status():
    try:
        load = os.getloadavg()
    except OSError:
        load = None
    disk = shutil.disk_usage(OUTPUT_DIR)
    return {
        "ok": True,
        "resources": {
            "cpu": {
                "percent": await cpu_percent(),
                "cores": os.cpu_count(),
                "load_1m": round(load[0], 2) if load else None,
            },
            "memory": mem_info(),
            "disk": {
                "total_bytes": disk.total,
                "used_bytes": disk.used,
                "percent": round(disk.used / disk.total * 100, 1),
            },
            "gpus": gpu_info(),
        },
        "tasks": {
            "render_jobs": state.render_jobs,
            "generation_jobs": state.jobs,
            "streams": list_streams(),
        },
    }
