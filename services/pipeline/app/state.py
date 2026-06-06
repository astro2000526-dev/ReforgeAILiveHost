"""Single owner of the pipeline's in-memory job state.

DB rows are the source of truth; these dicts only track live progress of
work running in THIS process (lost on restart — by design, matches the
ffmpeg-subprocess lifetime). Replace with Redis when a real queue lands.

Stream handles (_streams) stay in app/streaming.py — they own subprocess
lifecycles; readers go through streaming.list_streams()/stream_status() only.
"""

# /generate path (legacy full pipeline): project_id -> {status, stage, progress, ...}
jobs: dict[str, dict] = {}

# /render path (live render): project_id -> {status, pct, duration, source, ...}
render_jobs: dict[str, dict] = {}

# project_ids with a cancel requested; checked between render stages.
render_cancel: set[str] = set()
