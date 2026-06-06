"""AI script generation — prompt building + segment parsing for the local Qwen.

Network call itself lives in app/clients/ollama.py.
"""
import re

from ..clients import ollama
from ..schemas import ScriptRequest

LANG_WORD = {"th": "ภาษาไทย", "en": "English", "zh": "中文"}

_TAG_MAP = {"เปิดตัว": "intro", "ปัญหา": "pain", "แนะนำสินค้า": "product", "สาธิต": "demo", "ราคา": "price", "ปิดการขาย": "cta"}


def build_prompt(req: ScriptRequest) -> str:
    lang = LANG_WORD.get(req.language[:2], "ภาษาไทย")
    info = f"สินค้า: {req.product_title or '(ไม่ระบุ)'}\n"
    if req.selling_points:
        info += "จุดขาย: " + ", ".join(req.selling_points) + "\n"
    if req.price_now:
        info += f"ราคา: {req.price_now}" + (f" (ปกติ {req.price_original})" if req.price_original else "") + "\n"
    # Presenter persona — keep the voice/character consistent with the avatar.
    if req.avatar_name or req.avatar_desc:
        info += f"พิธีกร: {req.avatar_name}".rstrip() + (f" — {req.avatar_desc}" if req.avatar_desc else "") + "\n"
    # Existing script — improve/continue it, don't throw it away.
    ctx = ""
    if (req.existing_script or "").strip():
        ctx = ("\nสคริปต์เดิมที่มีอยู่ (ใช้เป็นบริบท ปรับปรุงให้ดีขึ้น คงโทน/สินค้า/ข้อมูลเดิม "
               "ไม่ใช่เขียนใหม่หมดแบบไม่เกี่ยว):\n\"\"\"\n" + req.existing_script.strip()[:2000] + "\n\"\"\"\n")
    return (
        f"คุณเป็นนักขายไลฟ์มืออาชีพ เขียนสคริปต์ขายของสด {lang} 6 ช่วงตามลำดับนี้: "
        "เปิดตัว, ปัญหา, แนะนำสินค้า, สาธิต, ราคา, ปิดการขาย. "
        "แต่ละช่วง 1-2 ประโยค กระชับ เป็นธรรมชาติ ชวนซื้อ. "
        "อ้างอิงข้อมูลสินค้า/พิธีกร/สคริปต์เดิมด้านล่างทั้งหมดเป็นบริบท. "
        "ตอบเป็น 6 บรรทัด บรรทัดละช่วง ขึ้นต้นด้วย [เปิดตัว] [ปัญหา] [แนะนำสินค้า] [สาธิต] [ราคา] [ปิดการขาย] "
        "ห้ามมีคำอธิบายอื่น.\n\n" + info + ctx
    )


def parse_segments(text: str) -> list[dict]:
    """Parse [tag] lines → segments; fallback splits non-empty lines."""
    segments = []
    for line in text.splitlines():
        line = line.strip()
        m = re.match(r"^\[?\s*([^\]\d.][^\]]*?)\s*\]?[:：]?\s*(.+)$", line)
        if not m:
            continue
        tag, body = m.group(1).strip(), m.group(2).strip()
        typ = _TAG_MAP.get(tag, None)
        if typ and body:
            segments.append({"type": typ, "text": body, "duration_sec": 32})
    # fallback: if parsing failed, split non-empty lines into generic segments
    if not segments:
        lines = [l.strip(" -•*") for l in text.splitlines() if l.strip()]
        order = ["intro", "pain", "product", "demo", "price", "cta"]
        segments = [{"type": order[min(i, 5)], "text": l, "duration_sec": 32} for i, l in enumerate(lines[:6])]
    return segments


async def generate_script(req: ScriptRequest) -> dict:
    text = await ollama.generate(req.llm_url, req.model, build_prompt(req))
    return {"ok": True, "script_segments": parse_segments(text), "raw": text[:1000]}
