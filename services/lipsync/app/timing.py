from __future__ import annotations

import time
from contextlib import contextmanager
from dataclasses import dataclass, field
from typing import Dict, Iterator

from .logging_setup import get_logger

log = get_logger(__name__)


@dataclass
class Timings:
    stages: Dict[str, float] = field(default_factory=dict)

    def add(self, name: str, seconds: float) -> None:
        self.stages[name] = round(seconds * 1000.0, 2)

    def total_ms(self) -> float:
        return round(sum(self.stages.values()), 2)

    def as_dict(self) -> dict:
        d = dict(self.stages)
        d["total_ms"] = self.total_ms()
        return d


@contextmanager
def stage(name: str, t: Timings) -> Iterator[None]:
    t0 = time.perf_counter()
    try:
        yield
    finally:
        elapsed = time.perf_counter() - t0
        t.add(name, elapsed)
        log.info("stage %s ms=%.2f", name, elapsed * 1000.0)
