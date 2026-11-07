"""What the feed is doing right now, and a count of everything that happened to each message."""

import statistics
from collections import Counter, deque
from dataclasses import dataclass, field
from typing import Any, Literal

Status = Literal["live", "stale", "down"]


@dataclass(slots=True)
class Health:
    counts: Counter[str]
    stale_after: float = 60.0
    connected: bool = False
    compressed: bool | None = None
    last_message_at: float | None = None
    last_error: str | None = None
    latencies: deque[float] = field(default_factory=lambda: deque(maxlen=512))

    def heard(self, now: float) -> None:
        self.last_message_at = now

    def status(self, now: float) -> Status:
        if not self.connected:
            return "down"
        if self.last_message_at is None or now - self.last_message_at > self.stale_after:
            return "stale"
        return "live"

    def summary(self, now: float) -> dict[str, Any]:
        age = None if self.last_message_at is None else round(now - self.last_message_at, 1)
        median = round(statistics.median(self.latencies), 3) if self.latencies else None
        return {
            "status": self.status(now),
            "connected": self.connected,
            "compressed": self.compressed,
            "last_message_age_s": age,
            "latency_median_s": median,
            "last_error": self.last_error,
            "counts": dict(self.counts),
        }
