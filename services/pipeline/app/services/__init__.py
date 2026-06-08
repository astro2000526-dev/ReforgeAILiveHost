"""Orchestration layer — process flow only.

Services compose clients/ (network APIs), gpu/ (inference boundary),
media (CPU ffmpeg), state (in-memory jobs) and storage. No torch, no raw
endpoint handling here.
"""
