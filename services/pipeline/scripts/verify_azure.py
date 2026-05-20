"""Verify Azure provider wiring without making an actual API call."""
from app.tts import get_provider, TTSError
from app.tts.azure import _build_ssml, _voice_to_lang


def main():
    tricky_text = "Today's deal: 50% off & only $9 \"limited\" stock! <urgent>"
    ssml = _build_ssml(text=tricky_text, voice="th-TH-PremwadeeNeural", rate="+10%")
    print("SSML escape test:")
    print(" ", ssml)
    print()

    print("lang extraction:")
    for v in [
        "th-TH-PremwadeeNeural",
        "en-US-JennyNeural",
        "zh-CN-XiaoxiaoNeural",
        "id-ID-GadisNeural",
        "vi-VN-HoaiMyNeural",
    ]:
        print(f"  {v:30} -> {_voice_to_lang(v)}")
    print()

    print("Factory should error cleanly when AZURE_SPEECH_KEY is missing:")
    try:
        get_provider()
        print("  FAIL: expected TTSError")
    except TTSError as e:
        print(f"  OK got expected error: {str(e)[:90]}...")


if __name__ == "__main__":
    main()
