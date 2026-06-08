# sovits — GPT-SoVITS HQ TTS worker

Optional high-quality, zero-shot TTS engine for the pipeline, served by the
upstream **[RVC-Boss/GPT-SoVITS](https://github.com/RVC-Boss/GPT-SoVITS)**
`api.py` server. Disabled by default — the pipeline only uses it when a render
asks for it (`tts_engine="sovits"`) **and** `GPT_SOVITS_URL` is set.

The pipeline never imports GPT-SoVITS. It talks to this box purely over HTTP via
`app/gpu/sovits_client.py`, exactly like it talks to the `lipsync` service.

## How the pipeline reaches it

```
pipeline  ──HTTP POST /──▶  GPT-SoVITS api.py  (port 9880)
                            reads refer_wav_path from its OWN filesystem
          ◀── WAV bytes ──
```

- URL: env `GPT_SOVITS_URL` (default `http://sovits:9880` in compose), or a
  per-request override forwarded from Settings.
- Timeout: env `SOVITS_HTTP_TIMEOUT` (seconds, default `300`).
- Request body our client sends to api.py:
  ```json
  {
    "text": "...",
    "text_language": "th|zh|en",
    "refer_wav_path": "/workspace/sovits/refs/<voice>.wav",
    "prompt_text": "<transcript of the reference clip>",
    "prompt_language": "th|zh|en",
    "speed": 1.0,
    "pitch": 0.0,           // best-effort; plain api.py ignores it
    "emotion": "..."        // best-effort; plain api.py ignores it
  }
  ```
  Response is raw `audio/wav` bytes.

> `pitch` (semitones, -12..12) and `emotion` are part of OUR adapter contract so
> the GPU-boundary signature stays stable. Stock upstream `api.py` has no such
> knobs and ignores the extra keys; a pitch/emotion-capable fork can honor them
> without any pipeline change.

## Deploy GPT-SoVITS api.py on the GPU box

You can run it directly on the host or in a container. Either way:

1. **Clone + install**
   ```bash
   git clone https://github.com/RVC-Boss/GPT-SoVITS.git
   cd GPT-SoVITS
   pip install -r requirements.txt
   ```
2. **Download pretrained models** — follow the upstream README. The weights go
   under `GPT_SoVITS/pretrained_models/` (chinese-hubert-base, chinese-roberta,
   the GPT `s1` ckpt + SoVITS `s2` pth, etc.). In compose this directory is the
   mounted volume `${DATA_DIR}/sovits/models`.
3. **Run the API server** on port 9880:
   ```bash
   python api.py -p 9880
   # optionally pin a default model set with -s <sovits.pth> -g <gpt.ckpt>
   ```
   Health: `curl http://localhost:9880/` returns 400 with a JSON message when
   given no body — that confirms it's up.

## Reference-wav convention (voice → reference)

GPT-SoVITS is zero-shot: each "voice" is defined by a short reference clip plus
the transcript of that clip. Our client maps a `voice` id to files under
`SOVITS_REF_DIR` (default `/workspace/sovits/refs`, mounted from
`${DATA_DIR}/sovits/refs`):

```
SOVITS_REF_DIR/
  premwadee.wav      # 3-10s clean reference clip (the target voice)
  premwadee.txt      # line 1: exact transcript of premwadee.wav
                     # line 2 (optional): reference language code (th|zh|en)
```

- `refer_wav_path` is read by **api.py on the worker box**, so the wav must live
  on that box at the path our client builds (`SOVITS_REF_DIR/<voice>.wav`).
- The matching `.txt` is read by the client to fill `prompt_text` /
  `prompt_language`. Mount `${DATA_DIR}/sovits/refs` into BOTH the sovits and
  pipeline containers if you want the pipeline to read the prompts; otherwise
  put the prompt text where the client can reach it.
- If `voice` is already a `.wav` path, the client uses it verbatim and looks for
  a sibling `.txt` for the prompt.

## Enable it

1. Uncomment the `sovits` service in `deploy/docker-compose.yml`.
2. Uncomment `GPT_SOVITS_URL` (+ `SOVITS_REF_DIR`, `SOVITS_HTTP_TIMEOUT`) on the
   `pipeline` service.
3. Drop your reference clips into `${DATA_DIR}/sovits/refs`.
4. `docker compose up -d --build sovits` then redeploy `pipeline`.
5. Web sends `tts_engine: "sovits"` (+ optional `tts_pitch`, `tts_emotion`) on
   the render request — plumbed web-side separately.

> This directory intentionally has no Dockerfile yet — provide one based on the
> upstream GPT-SoVITS image when you're ready to containerize, or run api.py on
> the host and point `GPT_SOVITS_URL` at it.
