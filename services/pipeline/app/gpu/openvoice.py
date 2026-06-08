"""Voice cloning (OpenVoice v2 tone conversion).

Converts the TTS audio's TIMBRE to match a reference voice (extracted from
the avatar's own video), keeping the spoken Thai/English content. Cached
converter; CPU device (this container's torch can't always see the GPU).
torch/openvoice/wavmark imports stay lazy inside functions (GPU layer rule).
"""
import asyncio
import os
from pathlib import Path

_ov_converter = None

# Legacy absolute install path — kept as a graceful fallback for deploys that
# relied on it; override with OPENVOICE_CONVERTER_FALLBACK if yours differs.
_LEGACY_CONVERTER_DIR = "/home/pipeline/.local/lib/python3.10/site-packages/openvoice_cli/checkpoints/converter"


def _get_ov_converter():
    global _ov_converter
    if _ov_converter is not None:
        return _ov_converter
    import os as _os
    import wavmark

    class _D:
        def to(self, *a, **k):
            return self
    wavmark.load_model = lambda *a, **k: _D()          # skip watermark (CN-blocked)
    import openvoice_cli
    from openvoice_cli.api import ToneColorConverter
    ToneColorConverter.add_watermark = lambda self, audio, message: audio
    # Locate the bundled converter checkpoint relative to the installed package
    # (works whether openvoice-cli is a --user or system install). Fall back to
    # the legacy hard-coded path + an OPENVOICE_CONVERTER_DIR override.
    cdir = _os.getenv("OPENVOICE_CONVERTER_DIR") or _os.path.join(
        _os.path.dirname(openvoice_cli.__file__), "checkpoints", "converter")
    if not _os.path.exists(_os.path.join(cdir, "checkpoint.pth")):
        cdir = os.getenv("OPENVOICE_CONVERTER_FALLBACK", _LEGACY_CONVERTER_DIR)
    conv = ToneColorConverter(_os.path.join(cdir, "config.json"), device="cpu")
    conv.load_ckpt(_os.path.join(cdir, "checkpoint.pth"))
    _ov_converter = conv
    return conv


def _voice_clone_sync(src_wav: Path, ref_wav: Path, out_wav: Path) -> None:
    conv = _get_ov_converter()
    src_se = conv.extract_se(str(src_wav))
    tgt_se = conv.extract_se(str(ref_wav))
    conv.convert(str(src_wav), src_se, tgt_se, str(out_wav))


async def voice_clone(src_wav: Path, ref_wav: Path, out_wav: Path) -> None:
    await asyncio.to_thread(_voice_clone_sync, src_wav, ref_wav, out_wav)
