import asyncio
import json
import time
from collections.abc import Awaitable, Callable
from typing import Any

from aiohttp import ClientResponse
from aiohttp.test_utils import TestClient, TestServer

from streamer.config import Box, Config
from streamer.fleet import Position
from streamer.health import Health
from streamer.server import Broadcaster, Service, build

T0 = 1_793_990_000.0


def position(mmsi: int = 368000001, heard_at: float = T0) -> Position:
    return Position(
        mmsi=mmsi,
        vessel_class="A",
        lat=48.72,
        lon=-122.68,
        sog_kn=1.0,
        cog_deg=1.0,
        heading_deg=1,
        nav_status=0,
        high_accuracy=True,
        transmit_second=1,
        heard_at=heard_at,
        name=None,
    )


def config(**overrides: Any) -> Config:
    values: dict[str, Any] = {
        "api_key": "k",
        "id_salt": b"s",
        "box": Box(48.0, -123.0, 49.0, -122.0),
        "host": "127.0.0.1",
        "port": 8787,
        "cors_origin": "*",
        "max_clients": 3,
        "event_buffer": 100,
        "client_queue": 100,
    }
    return Config(**{**values, **overrides})


async def idle_feed(_on_report: Callable[[Any], None], _health: Health) -> None:
    await asyncio.sleep(3600)


Scenario = Callable[[Any, Service], Awaitable[None]]


def with_client(scenario: Scenario, **overrides: Any) -> None:
    async def main() -> None:
        app, service = build(
            config(**overrides), feed=idle_feed, ping_every=0.05, status_every=0.02
        )
        async with TestClient(TestServer(app)) as client:
            await scenario(client, service)

    asyncio.run(main())


async def read_events(response: ClientResponse, count: int) -> list[dict[str, str]]:
    events: list[dict[str, str]] = []
    current: dict[str, str] = {}
    async with asyncio.timeout(3):
        async for raw in response.content:
            line = raw.decode().rstrip("\n")
            if not line:
                if current:
                    events.append(current)
                    current = {}
                    if len(events) == count:
                        return events
            elif not line.startswith(":"):
                field, _, value = line.partition(": ")
                current[field] = value
    return events


def test_vessels_returns_the_snapshot_with_feed_status_and_cors() -> None:
    async def scenario(client: Any, service: Service) -> None:
        service.ingest(position(), T0)
        response = await client.get("/v1/vessels")
        assert response.status == 200
        assert response.headers["Access-Control-Allow-Origin"] == "*"
        body = await response.json()
        assert body["feed"]["status"] == "down"
        assert len(body["vessels"]) == 1
        assert body["vessels"][0]["source"] == "aisstream"

    with_client(scenario)


def test_max_age_filters_and_is_validated() -> None:
    async def scenario(client: Any, service: Service) -> None:
        service.ingest(position(heard_at=time.time() - 100), time.time())
        for bad in ["-1", "0", "abc", "nan", "inf"]:
            response = await client.get("/v1/vessels", params={"max_age_s": bad})
            assert response.status == 400, bad
        recent = await client.get("/v1/vessels", params={"max_age_s": "60"})
        assert (await recent.json())["vessels"] == []
        older = await client.get("/v1/vessels", params={"max_age_s": "600"})
        assert len((await older.json())["vessels"]) == 1

    with_client(scenario)


def test_health_reports_counts_clients_and_vessels() -> None:
    async def scenario(client: Any, service: Service) -> None:
        service.ingest(position(), T0)
        body = await (await client.get("/healthz")).json()
        assert body["status"] == "down"
        assert body["counts"]["position"] == 1
        assert body["clients"] == 0
        assert body["vessels"] == 1

    with_client(scenario)


def test_stream_starts_with_a_snapshot_then_sends_updates() -> None:
    async def scenario(client: Any, service: Service) -> None:
        service.ingest(position(368000001), T0)
        response = await client.get("/v1/stream")
        assert response.headers["Content-Type"].startswith("text/event-stream")
        [first] = await read_events(response, 1)
        assert first["event"] == "snapshot"
        assert len(json.loads(first["data"])["vessels"]) == 1
        service.ingest(position(368000002), T0)
        [update] = await read_events(response, 1)
        assert update["event"] == "vessel"
        assert json.loads(update["data"])["lat"] == 48.72
        response.close()

    with_client(scenario)


def test_resuming_gets_only_what_was_missed() -> None:
    async def scenario(client: Any, service: Service) -> None:
        response = await client.get("/v1/stream")
        [snapshot] = await read_events(response, 1)
        response.close()
        service.ingest(position(368000001), T0)
        service.ingest(position(368000002), T0)
        resumed = await client.get("/v1/stream", headers={"Last-Event-ID": snapshot["id"]})
        events = await read_events(resumed, 2)
        assert [e["event"] for e in events] == ["vessel", "vessel"]
        resumed.close()

    with_client(scenario)


def test_resuming_after_a_restart_or_with_a_bad_id_gets_a_new_snapshot() -> None:
    async def scenario(client: Any, service: Service) -> None:
        for last_id in ["other-1", "garbage", f"{service.broadcaster.epoch}-999999"]:
            response = await client.get("/v1/stream", headers={"Last-Event-ID": last_id})
            [first] = await read_events(response, 1)
            assert first["event"] == "snapshot", last_id
            response.close()

    with_client(scenario)


def test_resuming_past_the_buffer_gets_a_new_snapshot() -> None:
    async def scenario(client: Any, service: Service) -> None:
        response = await client.get("/v1/stream")
        [snapshot] = await read_events(response, 1)
        response.close()
        for n in range(5):
            service.ingest(position(368000000 + n), T0)
        resumed = await client.get("/v1/stream", headers={"Last-Event-ID": snapshot["id"]})
        [first] = await read_events(resumed, 1)
        assert first["event"] == "snapshot"
        assert len(json.loads(first["data"])["vessels"]) == 5
        resumed.close()

    with_client(scenario, event_buffer=2)


def test_too_many_clients_are_refused() -> None:
    async def scenario(client: Any, _service: Service) -> None:
        open_streams = [await client.get("/v1/stream") for _ in range(2)]
        refused = await client.get("/v1/stream")
        assert refused.status == 503
        for stream in open_streams:
            stream.close()

    with_client(scenario, max_clients=2)


def test_pings_keep_an_idle_stream_open() -> None:
    async def scenario(client: Any, _service: Service) -> None:
        response = await client.get("/v1/stream")
        await read_events(response, 1)
        async with asyncio.timeout(2):
            while not (await response.content.readline()).startswith(b":"):
                pass
        response.close()

    with_client(scenario)


def test_status_changes_are_pushed_to_clients() -> None:
    async def scenario(client: Any, service: Service) -> None:
        response = await client.get("/v1/stream")
        await read_events(response, 1)
        service.health.connected = True
        service.health.heard(now=time.time())
        [event] = await read_events(response, 1)
        assert event["event"] == "status"
        assert json.loads(event["data"])["status"] == "live"
        response.close()

    with_client(scenario)


def test_ingest_counts_every_outcome() -> None:
    async def scenario(_client: Any, service: Service) -> None:
        service.ingest(position(), T0)
        service.ingest(position(heard_at=T0 - 60), T0)
        assert service.health.counts["position"] == 1
        assert service.health.counts["stale"] == 1
        assert list(service.health.latencies) == [0.0]

    with_client(scenario)


def test_a_client_that_falls_behind_is_cut_off_without_affecting_others() -> None:
    broadcaster = Broadcaster(buffer=10, queue_size=2)
    closed: list[str] = []
    slow = broadcaster.subscribe(lambda: closed.append("slow"))
    fast = broadcaster.subscribe(lambda: closed.append("fast"))
    for n in range(3):
        broadcaster.publish("vessel", {"n": n})
        fast.queue.get_nowait()
    assert closed == ["slow"]
    assert slow not in broadcaster.subscribers
    assert fast in broadcaster.subscribers


def test_events_are_numbered_and_old_ones_fall_out_of_the_buffer() -> None:
    broadcaster = Broadcaster(buffer=2, queue_size=2)
    for n in range(3):
        broadcaster.publish("vessel", {"n": n})
    assert broadcaster.since(f"{broadcaster.epoch}-2") is not None
    assert broadcaster.since(f"{broadcaster.epoch}-1") is not None
    assert broadcaster.since(f"{broadcaster.epoch}-0") is None
    missed = broadcaster.since(f"{broadcaster.epoch}-1")
    assert missed is not None
    assert len(missed) == 2


def test_a_feed_that_crashes_is_restarted() -> None:
    calls: list[int] = []

    async def crashing(_on_report: Any, _health: Health) -> None:
        calls.append(1)
        if len(calls) == 1:
            raise RuntimeError("bug")
        await asyncio.sleep(3600)

    async def main() -> None:
        app, service = build(config(), feed=crashing, restart_delay=0.01)
        async with TestClient(TestServer(app)):
            async with asyncio.timeout(2):
                while len(calls) < 2:
                    await asyncio.sleep(0.01)
            assert service.health.counts["feed_crashes"] == 1

    asyncio.run(main())
