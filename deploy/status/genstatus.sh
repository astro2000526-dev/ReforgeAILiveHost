#!/usr/bin/env bash
OUT=/var/www/status/index.html
IP=${HOST_IP:-127.0.0.1}
esc(){ sed 's/&/\&amp;/g;s/</\&lt;/g;s/>/\&gt;/g'; }
code(){ curl -s -o /dev/null -w '%{http_code}' --max-time 3 "$1" 2>/dev/null; }
bar(){ printf '<div class=trk><i style="width:%s%%;background:%s"></i></div>' "$1" "$2"; }

pipe=$(curl -s --max-time 3 http://127.0.0.1:8000/health 2>/dev/null); [ -n "$pipe" ] && pok=1 || pok=0
webc=$(code http://127.0.0.1:3000/); { [ "$webc" = 200 ]||[ "$webc" = 307 ]||[ "$webc" = 308 ]; } && wok=1 || wok=0
[ "$(code http://127.0.0.1:3001/)" = 200 ] && rok=1 || rok=0
[ "$(code http://127.0.0.1:8088/health)" = 200 ] && gok=1 || gok=0
[ "$(code http://127.0.0.1:8001/health)" = 200 ] && lok=1 || lok=0
lmodel=$(curl -s --max-time 3 http://127.0.0.1:8001/health 2>/dev/null | grep -o '"model":"[a-z0-9_]*"' | cut -d'"' -f4)
qok=$(docker exec reforge-qwen ollama list 2>/dev/null | grep -c qwen || echo 0)

st(){ [ "$1" = 1 ] && echo "<span class=ok>● UP</span>" || echo "<span class=bad>● DOWN</span>"; }
dot(){ [ "$1" = 1 ] && echo "<span class=ok>●</span>" || echo "<span class=bad>●</span>"; }

# GPU: sample util a few times to catch brief render spikes
gutil=0; for i in 1 2 3 4; do u=$(nvidia-smi --query-gpu=utilization.gpu --format=csv,noheader,nounits 2>/dev/null|head -1|tr -d ' '); [ "${u:-0}" -gt "$gutil" ] 2>/dev/null && gutil=$u; done
gmu=$(nvidia-smi --query-gpu=memory.used --format=csv,noheader,nounits 2>/dev/null|head -1|tr -d ' '); gmu=${gmu:-0}
gmt=$(nvidia-smi --query-gpu=memory.total --format=csv,noheader,nounits 2>/dev/null|head -1|tr -d ' '); gmt=${gmt:-24564}
gmp=$(( gmu*100/gmt ))
gtemp=$(nvidia-smi --query-gpu=temperature.gpu,power.draw --format=csv,noheader 2>/dev/null|head -1|esc)
ramu=$(free -m|awk 'NR==2{print $3}'); ramt=$(free -m|awk 'NR==2{print $2}'); ramp=$(( ramu*100/ramt ))
load=$(uptime|awk -F'load average:' '{print $2}'); upt=$(uptime -p)
drootp=$(df / | tail -1|awk '{print $5}'|tr -d '%'); droot=$(df -h /|tail -1|awk '{print $3"/"$2}')
ddatap=$(df /data 2>/dev/null|tail -1|awk '{print $5}'|tr -d '%'); ddata=$(df -h /data 2>/dev/null|tail -1|awk '{print $3"/"$2}')
dk=$(systemctl is-active docker); ng=$(systemctl is-active nginx)
ps=$(docker ps --format '{{.Names}} | {{.Status}}' 2>/dev/null | esc)
RENDER=$(curl -s --max-time 3 http://127.0.0.1:8000/render/active 2>/dev/null | python3 /usr/local/bin/render_card.py 2>/dev/null)
# lipsync single-worker is blocked (no /health) while rendering → BUSY, not DOWN
lbusy=0; { [ "$lok" = 0 ] && [ -n "$RENDER" ]; } && lbusy=1
lup=$lok; [ "$lbusy" = 1 ] && lup=1
pblog=$(tail -n 10 /data/build.log 2>/dev/null|esc); wblog=$(tail -n 8 /data/web-build.log 2>/dev/null|esc)
now=$(date '+%Y-%m-%d %H:%M:%S %Z')
up=0; for x in $pok $wok $rok $gok $lup; do up=$((up+x)); done

cat > "$OUT" <<HTML
<!doctype html><html><head><meta charset=utf-8><meta http-equiv=refresh content=5><meta name=viewport content="width=device-width,initial-scale=1">
<title>Reforge — Status</title><style>
*{box-sizing:border-box}body{background:#0d1117;color:#c9d1d9;font:14px/1.6 ui-monospace,Menlo,monospace;margin:0;padding:20px}
h1{font-size:19px;color:#58a6ff;margin:0 0 3px}.sub{color:#8b949e;font-size:12px;margin-bottom:14px}
h2{font-size:11px;text-transform:uppercase;color:#8b949e;letter-spacing:.06em;margin:18px 0 9px}
a{color:#58a6ff;text-decoration:none}a:hover{text-decoration:underline}
.ok{color:#3fb950}.bad{color:#f85149}.warn{color:#d29922}.muted{color:#8b949e}
.banner{padding:11px 15px;border-radius:8px;margin-bottom:14px;font-weight:500}
.green{background:#0f2e1a;border:1px solid #238636;color:#3fb950}.yellow{background:#2d2410;border:1px solid #9e6a03;color:#d29922}
.slist{border:1px solid #30363d;border-radius:8px;overflow:hidden;margin-bottom:6px}
.srow{display:grid;grid-template-columns:150px 1fr 100px 1.3fr;padding:10px 13px;border-bottom:1px solid #21262d;align-items:center;font-size:13px}
.srow:last-child{border-bottom:none}.srow:first-child{background:#161b22;font-size:11px;text-transform:uppercase;color:#8b949e}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:12px}
.card{background:#161b22;border:1px solid #30363d;border-radius:8px;padding:13px}
.card h2{margin:0 0 7px}.big{font-size:13px;color:#e6edf3}
.trk{height:8px;background:#30363d;border-radius:4px;overflow:hidden;margin:4px 0}.trk i{display:block;height:100%}
.spin{display:inline-block;animation:sp 1s linear infinite}@keyframes sp{to{transform:rotate(360deg)}}
pre{background:#161b22;border:1px solid #30363d;border-radius:6px;padding:9px;overflow:auto;max-height:150px;white-space:pre-wrap;font-size:11px;margin:0 0 10px}
</style></head><body>
<h1>ReforgeAILiveHost — Server Status</h1>
<div class=sub>${IP} · RTX 4090 · auto-refresh 5s · ${now}</div>
$( [ $up -ge 5 ] && echo "<div class='banner green'>✓ All systems operational — ${up}/5 up</div>" || echo "<div class='banner yellow'><span class=spin>◐</span> ${up}/5 services up</div>" )

<h2>Links &amp; Status</h2>
<div class=slist>
<div class=srow><div>Service</div><div>URL</div><div>Status</div><div>Purpose</div></div>
<div class=srow><div><b>Status</b></div><div><a href="http://status.${IP}.nip.io/">status.${IP}.nip.io</a></div><div>$(st 1)</div><div class=muted>this page</div></div>
<div class=srow><div><b>Console</b></div><div><a href="http://console.${IP}.nip.io/">console.${IP}.nip.io</a></div><div>$(st $wok)</div><div class=muted>dashboard / avatars / render / stream</div></div>
<div class=srow><div><b>API pipeline</b></div><div><a href="http://api.${IP}.nip.io/health">api.${IP}.nip.io</a></div><div>$(st $pok)</div><div class=muted>TTS · clone · render · stream</div></div>
<div class=srow><div><b>Lipsync</b></div><div><a href="http://api.${IP}.nip.io/lipsync/health">api/lipsync</a></div><div>$([ "$lbusy" = 1 ] && echo "<span class=ok>● BUSY</span>" || st $lok)</div><div class=muted>${lmodel:-lipsync} GPU</div></div>
<div class=srow><div><b>Qwen LLM</b></div><div class=muted>127.0.0.1:11434</div><div>$([ "$qok" -ge 1 ] 2>/dev/null && echo "$(st 1)" || echo "<span class=warn>◐ pull</span>")</div><div class=muted>auto-script (ollama)</div></div>
<div class=srow><div><b>DB / gateway</b></div><div class=muted>127.0.0.1:8088</div><div>$(st $gok)</div><div class=muted>postgrest $(dot $rok)</div></div>
</div>

<h2>Resources</h2>
<div class=grid>
${RENDER}
<div class=card><h2>GPU — RTX 4090</h2><div class=big>util ${gutil}% $(bar ${gutil} '#d29922')
vram ${gmu}/${gmt} MiB $(bar ${gmp} '#3fb950')
<div style="font-size:11px;color:#8b949e;margin-top:4px">${gtemp}</div></div></div>
<div class=card><h2>RAM</h2><div class=big>${ramu}/${ramt} MiB $(bar ${ramp} '#58a6ff')
<div style=margin-top:4px>load ${load}</div><div style="font-size:11px;color:#8b949e">${upt}</div></div></div>
<div class=card><h2>Disk</h2><div class=big>/ ${droot} $(bar ${drootp:-0} '#58a6ff')
/data ${ddata} $(bar ${ddatap:-0} '#3fb950')</div></div>
<div class=card><h2>Core</h2><div class=big>docker $([ "$dk" = active ]&&dot 1||dot 0) nginx $([ "$ng" = active ]&&dot 1||dot 0)<br>pipeline $(dot $pok) web $(dot $wok) lipsync $(dot $lup)<br>postgrest $(dot $rok) gateway $(dot $gok)</div></div>
<div class=card><h2>Containers</h2><div class=big style="font-size:11px">${ps}</div></div>
</div>

<h2>Build Logs</h2>
<p class=muted style=margin-bottom:3px>Pipeline</p><pre>${pblog}</pre>
<p class=muted style=margin-bottom:3px>Web</p><pre>${wblog}</pre>
</body></html>
HTML
