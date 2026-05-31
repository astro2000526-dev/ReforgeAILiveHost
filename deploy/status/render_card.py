import sys, json
try:
    d = json.load(sys.stdin)
    a = d.get("active", {})
    allj = d.get("all", {})
except Exception:
    a, allj = {}, {}
def bar(pct):
    pct=max(0,min(100,int(pct)))
    return f"<div style='height:10px;background:#30363d;border-radius:5px;overflow:hidden;margin:4px 0'><div style='height:100%;width:{pct}%;background:linear-gradient(90deg,#3fb950,#58a6ff);transition:width .4s'></div></div>"
STAGE={"ai-tts":"1/4 สังเคราะห์เสียง (TTS)","ai-clone":"2/4 โคลนเสียง (OpenVoice)","ai-lipsync":"3/4 ลิปซิงค์","ai-encode":"4/4 เข้ารหัสวิดีโอ","template":"loop (ffmpeg)","testpattern":"test pattern"}
out=[]
if a:
    for k,v in a.items():
        pct=v.get("pct",0); src=v.get("source","")
        out.append(f"<div class=card style='grid-column:1/-1'><h2 style=margin-top:0>🎬 Rendering — {k[:8]}…</h2>{bar(pct)}<div class=big>{pct}% · {STAGE.get(src,src)}</div></div>")
else:
    # show last finished job result
    last=None
    for k,v in allj.items():
        if v.get("status") in ("done","failed"): last=(k,v)
    if last:
        k,v=last; st=v.get("status"); src=v.get("source","")
        col="ok" if st=="done" else "bad"
        errs=" · ".join(v.get("errors",[]))[:120]
        out.append(f"<div class=card><h2 style=margin-top:0>Last render</h2><div class=big><span class={col}>{st}</span> · {src}{('<br><span class=muted style=font-size:11px>'+errs+'</span>') if errs else ''}</div></div>")
    else:
        out.append("<div class=card><h2 style=margin-top:0>Rendering</h2><div class='big muted'>idle</div></div>")
print("".join(out))
