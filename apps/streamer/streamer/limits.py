"""Per-client request limits, so one client can't crowd out everyone else."""

from dataclasses import dataclass, field


@dataclass(slots=True)
class Bucket:
    tokens: float
    at: float


@dataclass
class Limiter:
    """A token bucket per client: `burst` tokens to start with, refilled at `per_s`."""

    burst: float
    per_s: float
    max_tracked: int = 10_000
    buckets: dict[str, Bucket] = field(default_factory=dict)

    def take(self, client: str, cost: float, now: float) -> float:
        """0 when the request may go ahead, else the seconds until it could."""
        bucket = self.buckets.get(client)
        if bucket is None:
            if len(self.buckets) >= self.max_tracked:
                self.forget(now)
            bucket = self.buckets[client] = Bucket(self.burst, now)
        bucket.tokens = min(self.burst, bucket.tokens + (now - bucket.at) * self.per_s)
        bucket.at = now
        if bucket.tokens >= cost:
            bucket.tokens -= cost
            return 0.0
        return (cost - bucket.tokens) / self.per_s

    def forget(self, now: float) -> None:
        # A bucket idle long enough to have refilled is the same as no bucket.
        refill_s = self.burst / self.per_s
        self.buckets = {k: b for k, b in self.buckets.items() if now - b.at < refill_s}


def client_of(remote: str | None, forwarded: str | None, trust_proxy: bool) -> str:
    if trust_proxy and forwarded:
        return forwarded.rsplit(",", 1)[-1].strip()
    return remote or "unknown"
