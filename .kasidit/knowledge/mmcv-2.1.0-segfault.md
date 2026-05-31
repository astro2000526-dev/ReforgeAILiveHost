# mmcv 2.1.0 — Segmentation fault on `import mmcv.ops` (`_ext`)

Source: https://github.com/open-mmlab/mmcv/blob/v2.1.0/docs/en/faq.md
Cached: 2026-06-01 · stack: services/lipsync (Python, torch 2.1.1+cu121, mmcv 2.1.0, RTX 4090 / sm_89)

## Symptom (ours)
`python -c "from mmcv.ops import nms"` → exit **139 (SIGSEGV)** on the lipsync host.
Blocks MuseTalk (dwpose → mmpose → mmcv ops). Wav2Lip is unaffected (no mmcv).

## FAQ — Segmentation Fault
**Cause:** GCC version incompatibility, incorrect PyTorch installation, or MMCV compilation issues.
**Fixes:**
- GCC >= 5.4  (ours = gcc 11 ✓, so not the cause)
- Verify torch CUDA: `python -c 'import torch; print(torch.cuda.is_available())'`  (ours = True)
- Verify mmcv: `python -c 'import mmcv; import mmcv.ops'`  ← this is what segfaults
- **"Check whether the running environment is the same as that when mmcv was compiled"**

## Diagnosis
The **prebuilt** wheel (`mmcv==2.1.0 -f .../cu121/torch2.1/index.html`) was compiled
against a different torch patch / ABI than the installed torch 2.1.1 → `_ext.so`
symbol/ABI mismatch → segfault on load. FAQ's own fix = **build from source in our env**.

## Fix to apply (build from source, matching our torch + arch)
```bash
pip uninstall -y mmcv mmcv-full
MMCV_WITH_OPS=1 FORCE_CUDA=1 TORCH_CUDA_ARCH_LIST=8.9 \
  pip install --no-build-isolation --no-binary mmcv mmcv==2.1.0
# verify:
python -c "import torch; from mmcv.ops import nms; \
  print(nms(torch.tensor([[0,0,10,10]],dtype=torch.float32).cuda(), \
  torch.tensor([0.9]).cuda(), 0.5)[0].shape)"
```
- `--no-build-isolation` is REQUIRED (build env needs the installed torch + setuptools/pkg_resources).
- `TORCH_CUDA_ARCH_LIST=8.9` = RTX 4090.
- Compile takes ~35 min (CUDA ops, single-thread).

## VERDICT (2026-06-01, detached build test) — source-build does NOT fix it
```
MMCV_BUILD_EXIT=0     # compiled fine from source against torch 2.1.1 + sm_89
TEST_EXIT=139         # `from mmcv.ops import nms` + GPU nms STILL segfaults
```
Even mmcv compiled-from-source ON THIS HOST segfaults on the GPU op. So it is
**NOT** the prebuilt-wheel ABI mismatch the FAQ assumed.

NOT a driver problem: driver **550.76 / CUDA 12.4** is modern; Wav2Lip on the
same torch 2.1.1+cu121 uses the GPU fine. The crash is in mmcv 2.1.0's compiled
CUDA ops on **Ada / sm_89 (RTX 4090)** — a deeper mmcv↔Ada incompatibility.

~~Conclusion: MuseTalk is NOT viable on this host.~~ ← THIS WAS WRONG.

## ACTUAL ROOT CAUSE (2026-06-01, faulthandler) — it is NOT mmcv/GPU at all
Stepped `python -X faulthandler`:
- `import torch` ✓ · `import mmcv` ✓ · **`import mmcv._ext` ✓ (the compiled .so loads fine)**
- crash happens at **`torch.jit.script`** while `mmengine` imports
  `torch.distributed.optim.functional_adagrad` → recursive `try_compile_fn` →
  C-stack overflow → SIGSEGV. **A torch 2.1.1 TorchScript bug, not mmcv, not Ada,
  not the driver** (driver 550.76/CUDA 12.4 is fine; Wav2Lip on cu121 works).

## THE FIX (verified) — one env var
```
PYTORCH_JIT=0
```
With it: `from mmcv.ops import nms` + GPU nms → `GPU_NMS_OK torch.Size([1,5])`,
and `import mmcv, mmdet, mmpose` all succeed. **No rebuild, no source-build
needed** — the stock prebuilt mmcv works once TorchScript is disabled.

**Conclusion: MuseTalk IS viable on the 4090.** Set `PYTORCH_JIT=0` +
`LIPSYNC_MODEL=musetalk` on the lipsync container (weights already present,
7.3GB). Source-building mmcv was a red herring (it "failed" only because the
test line also tripped the same torch.jit crash). Lesson: get the faulthandler
backtrace FIRST before theorising about ABI/arch/driver.
