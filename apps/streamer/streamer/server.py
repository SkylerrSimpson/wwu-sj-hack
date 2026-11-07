"""The HTTP API: a snapshot, a live stream, and health. Reads only; no client can change anything."""

import asyncio
import json
import logging
import math
import secrets
import time
from collections import Counter, deque
from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field
from typing import Any

from aiohttp import web

from streamer import aisstream
from streamer.config import Config
from streamer.fleet import Fleet, Position, Report, iso
from streamer.health import Health

log = logging.getLogger(__name__)

# Keeps a moored boat that goes quiet overnight, and still bounds memory on a home server.
FORGET_AFTER_S = 24 * 3600.0
PRUNE_EVERY_S = 3600.0
COVERAGE = (
    "Only vessels transmitting AIS and heard by this feed appear here. "
    "No vessel heard does not mean no vessel present."
)

Feed = Callable[[Callable[[Report], None], Health], Awaitable[None]]


@dataclass(eq=False, slots=True)
class Subscriber:
    queue: asyncio.Queue[bytes]
    cut_off: Callable[[], None]


class Broadcaster:
    """Numbers events, keeps recent ones for resuming, and never waits on a client."""

    def __init__(self, buffer: int, queue_size: int) -> None:
        self.epoch = secrets.token_hex(4)
        self.seq = 0
        self.subscribers: set[Subscriber] = set()
        self._recent: deque[tuple[int, bytes]] = deque(maxlen=buffer)
        self._queue_size = queue_size

    def frame(self, event: str, payload: Any) -> bytes:
        data = json.dumps(payload, separators=(",", ":"))
        return f"id: {self.epoch}-{self.seq}\nevent: {event}\ndata: {data}\n\n".encode()

    def publish(self, event: str, payload: Any) -> None:
        self.seq += 1
        encoded = self.frame(event, payload)
        self._recent.append((self.seq, encoded))
        for subscriber in list(self.subscribers):
            try:
                subscriber.queue.put_nowait(encoded)
            except asyncio.QueueFull:
                # It reconnects with its last id and catches up, or gets a new snapshot.
                self.subscribers.discard(subscriber)
                subscriber.cut_off()

    def subscribe(self, cut_off: Callable[[], None]) -> Subscriber:
        subscriber = Subscriber(asyncio.Queue(maxsize=self._queue_size), cut_off)
        self.subscribers.add(subscriber)
        return subscriber

    def unsubscribe(self, subscriber: Subscriber) -> None:
        self.subscribers.discard(subscriber)

    def close_all(self) -> None:
        for subscriber in list(self.subscribers):
            self.subscribers.discard(subscriber)
            subscriber.cut_off()

    def since(self, last_id: str) -> list[bytes] | None:
        """The frames after last_id, or None when they can't all be replayed."""
        epoch, _, seq_text = last_id.rpartition("-")
        if epoch != self.epoch or not seq_text.isdecimal():
            return None
        seq = int(seq_text)
        oldest = self._recent[0][0] if self._recent else self.seq + 1
        if seq > self.seq or seq < oldest - 1:
            return None
        return [encoded for number, encoded in self._recent if number > seq]


@dataclass(slots=True)
class Service:
    fleet: Fleet
    health: Health
    broadcaster: Broadcaster
    tasks: list[asyncio.Task[None]] = field(default_factory=list)

    def ingest(self, report: Report, received_at: float) -> None:
        record, outcome = self.fleet.apply(report, received_at)
        self.health.counts[outcome] += 1
        if outcome == "position" and isinstance(report, Position):
            self.health.latencies.append(received_at - report.heard_at)
        if record is not None:
            self.broadcaster.publish("vessel", record)

    def feed_state(self, now: float) -> dict[str, Any]:
        summary = self.health.summary(now)
        return {"status": summary["status"], "last_message_age_s": summary["last_message_age_s"]}

    def snapshot(self, now: float, max_age_s: float | None = None) -> dict[str, Any]:
        return {
            "generated_at": iso(now),
            "coverage": COVERAGE,
            "feed": self.feed_state(now),
            "vessels": self.fleet.snapshot(now, max_age_s),
        }


def build(
    config: Config,
    *,
    feed: Feed | None = None,
    ping_every: float = 15.0,
    status_every: float = 5.0,
    restart_delay: float = 5.0,
) -> tuple[web.Application, Service]:
    service = Service(
        fleet=Fleet(id_salt=config.id_salt, source=aisstream.SOURCE),
        health=Health(counts=Counter()),
        broadcaster=Broadcaster(config.event_buffer, config.client_queue),
    )
    broadcaster = service.broadcaster

    async def default_feed(on_report: Callable[[Report], None], health: Health) -> None:
        await aisstream.run(aisstream.URL, config.api_key, config.box, on_report, health)

    run_feed = feed or default_feed

    def on_report(report: Report) -> None:
        service.ingest(report, time.time())

    async def supervise_feed() -> None:
        # The feed retries by itself; this catches a bug in that code, so one can't end the stream.
        while True:
            try:
                await run_feed(on_report, service.health)
            except Exception:
                service.health.counts["feed_crashes"] += 1
                service.health.connected = False
                log.exception("the feed crashed and will be restarted")
            await asyncio.sleep(restart_delay)

    async def watch() -> None:
        # Silence produces no events, so the status has to be checked on a clock.
        status = service.health.status(time.time())
        last_prune = time.time()
        while True:
            await asyncio.sleep(status_every)
            now = time.time()
            current = service.health.status(now)
            if current != status:
                status = current
                log.info("feed is %s", status)
                broadcaster.publish("status", service.feed_state(now))
            if now - last_prune >= PRUNE_EVERY_S:
                service.fleet.prune(now - FORGET_AFTER_S)
                last_prune = now

    async def vessels(request: web.Request) -> web.Response:
        max_age_s: float | None = None
        if "max_age_s" in request.query:
            try:
                max_age_s = float(request.query["max_age_s"])
            except ValueError:
                raise web.HTTPBadRequest(text="max_age_s must be a number") from None
            if not math.isfinite(max_age_s) or max_age_s <= 0:
                raise web.HTTPBadRequest(text="max_age_s must be above zero")
        return web.json_response(service.snapshot(time.time(), max_age_s))

    async def health(_request: web.Request) -> web.Response:
        now = time.time()
        return web.json_response(
            {
                **service.health.summary(now),
                "vessels": len(service.fleet),
                "clients": len(broadcaster.subscribers),
            }
        )

    async def stream(request: web.Request) -> web.StreamResponse:
        if len(broadcaster.subscribers) >= config.max_clients:
            raise web.HTTPServiceUnavailable(text="too many clients", headers={"Retry-After": "30"})
        task = asyncio.current_task()
        assert task is not None

        def cut_off() -> None:
            service.health.counts["clients_cut_off"] += 1
            task.cancel()

        # Nothing awaits between subscribing and reading the state, so no event can fall between.
        subscriber = broadcaster.subscribe(cut_off)
        last_id = request.headers.get("Last-Event-ID")
        missed = broadcaster.since(last_id) if last_id else None
        opening = (
            missed
            if missed is not None
            else [broadcaster.frame("snapshot", service.snapshot(time.time()))]
        )
        response = web.StreamResponse(
            headers={
                "Content-Type": "text/event-stream",
                "Cache-Control": "no-cache",
                "X-Accel-Buffering": "no",
            }
        )
        try:
            await response.prepare(request)
            for frame in opening:
                await response.write(frame)
            while True:
                try:
                    frame = await asyncio.wait_for(subscriber.queue.get(), ping_every)
                except TimeoutError:
                    frame = b": ping\n\n"
                await response.write(frame)
        except ConnectionResetError:
            pass
        finally:
            broadcaster.unsubscribe(subscriber)
        return response

    async def allow_cross_origin(_request: web.Request, response: web.StreamResponse) -> None:
        response.headers["Access-Control-Allow-Origin"] = config.cors_origin

    async def start(_app: web.Application) -> None:
        service.tasks.extend([asyncio.create_task(supervise_feed()), asyncio.create_task(watch())])

    async def close_clients(_app: web.Application) -> None:
        broadcaster.close_all()

    async def stop(_app: web.Application) -> None:
        for task in service.tasks:
            task.cancel()
        await asyncio.gather(*service.tasks, return_exceptions=True)

    app = web.Application()
    app.router.add_get("/v1/vessels", vessels)
    app.router.add_get("/v1/stream", stream)
    app.router.add_get("/healthz", health)
    app.on_response_prepare.append(allow_cross_origin)
    app.on_startup.append(start)
    app.on_shutdown.append(close_clients)
    app.on_cleanup.append(stop)
    return app, service
