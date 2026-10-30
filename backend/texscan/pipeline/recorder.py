import time
from collections.abc import Callable
from dataclasses import dataclass, field
from typing import Any

from texscan.pipeline.types import Image


@dataclass
class Recorder:
    """Collects intermediate images (insertion order = processing order) and per-step timings."""

    stages: dict[str, Image] = field(default_factory=dict)
    timings_ms: dict[str, float] = field(default_factory=dict)

    def step(self, name: str, fn: Callable[..., Any], *args: Any, **kwargs: Any) -> Any:
        start = time.perf_counter()
        result = fn(*args, **kwargs)
        self.timings_ms[name] = (time.perf_counter() - start) * 1000
        return result
