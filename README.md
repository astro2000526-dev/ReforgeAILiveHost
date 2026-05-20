# ReforgeAILiveHost

AI 数字人直播 SaaS（MVP）— 东南亚 Shopee 卖家专用。

## 仓库结构

```
.
├── apps/
│   └── web/               # Next.js 14 前端 + 轻 API 路由（部署 Vercel）
├── services/
│   └── pipeline/          # Python FastAPI：edge-tts + MuseTalk + ffmpeg + 推流（部署 RunPod GPU）
└── docs/                  # 设计文档、决策记录
```

## 本地起服务

**前端：**
```powershell
cd apps/web
npm install
npm run dev          # http://localhost:3000
```

**FastAPI 服务：**
```powershell
cd services/pipeline
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

## MVP 关键决策（来自 Day 0 评审）

1. **MuseTalk 跑法**：6 段 TTS 先 concat 成一条音频，对模板视频跑**一次** MuseTalk —— 避免段间跳脸、节省冷启动开销。
2. **edge-tts 调用**：用 `subprocess.run([...])` 数组形式或 `--file` 传文本，**禁止** shell 字符串拼接（脚本里 `'`、`"`、`$` 会注入）。
3. **RTMP 推流**：重编码到 `libx264 + aac`，GOP=2s（`-force_key_frames "expr:gte(t,n_forced*2)"`），加 `-fflags +genpts`，**不要** `-c copy + stream_loop` 的组合。
4. **Shopee 商品抓取**：MVP **只做手填**，反爬太重，自动抓取留 v1.1。
5. **stream_key 存储**：MVP 先明文存 + Supabase RLS 限制访问，验收通过后接入 pgcrypto 或 KMS。
