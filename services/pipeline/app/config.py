from pathlib import Path
import os

BASE_DIR = Path(__file__).resolve().parent.parent
TMP_DIR = BASE_DIR / "tmp"
OUTPUT_DIR = BASE_DIR / "output"
TMP_DIR.mkdir(exist_ok=True)
OUTPUT_DIR.mkdir(exist_ok=True)

FFMPEG_BIN = os.getenv("FFMPEG_BIN", "ffmpeg")

MUSETALK_ENABLED = os.getenv("MUSETALK_ENABLED", "0") == "1"
