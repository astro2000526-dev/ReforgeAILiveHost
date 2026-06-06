"""HTTP layer — thin routers only. Logic lives in app/services."""
from .generate import router as generate_router
from .gpu_worker import router as gpu_worker_router
from .health import router as health_router
from .live import router as live_router
from .render import router as render_router
from .script import router as script_router
from .stream import router as stream_router
from .system import router as system_router
from .uploads import router as uploads_router

all_routers = [
    health_router,
    script_router,
    uploads_router,
    render_router,
    generate_router,
    stream_router,
    live_router,
    system_router,
    gpu_worker_router,
]
