import asyncio
import json
import time
from collections.abc import Awaitable, Callable
from dataclasses import replace
from pathlib import Path
from typing import Any

from aiohttp import ClientResponse
from aiohttp.test_utils import TestClient, TestServer

from streamer.config import Box, Config
from streamer.fleet import Position, Static, iso
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


def identified(mmsi: int = 368000001, heard_at: float = T0) -> Static:
    return Static(mmsi, heard_at, "TEST SHIP", "WXY", 60, 30)


def with_archive(tmp_path: Path, scenario: Scenario) -> None:
    with_client(scenario, db_path=str(tmp_path / "ais.db"))


def test_history_without_an_archive_says_so() -> None:
    async def scenario(client: Any, _service: Service) -> None:
        for path in [
            "/v1/history",
            "/v1/track?mmsi=1",
            "/v1/reports",
            "/v1/catalog",
            "/v1/density",
            "/v1/activity",
            "/v1/coverage",
        ]:
            assert (await client.get(path)).status == 503, path

    with_client(scenario)


def test_reports_reach_the_archive_and_come_back_as_a_frame(tmp_path: Path) -> None:
    async def scenario(client: Any, service: Service) -> None:
        now = time.time()
        service.ingest(identified(heard_at=now), now)
        service.ingest(position(heard_at=now), now)
        assert service.recorder is not None
        service.recorder.flush()
        response = await client.get("/v1/history", params={"at": iso(now + 1), "window_s": "60"})
        assert response.status == 200
        assert response.headers["Access-Control-Allow-Origin"] == "*"
        body = await response.json()
        assert body["at"] == iso(now + 1)
        assert body["covered"] is True
        assert "coverage" in body
        [vessel] = body["vessels"]
        assert vessel["name"] == "TEST SHIP"
        health = await (await client.get("/healthz")).json()
        assert health["archive"]["written"] == 1

    with_archive(tmp_path, scenario)


def test_a_report_too_late_for_the_live_map_is_still_archived(tmp_path: Path) -> None:
    async def scenario(client: Any, service: Service) -> None:
        now = time.time()
        service.ingest(position(heard_at=now), now)
        service.ingest(position(heard_at=now - 300), now)
        assert service.health.counts["stale"] == 1
        assert service.recorder is not None
        service.recorder.flush()
        assert service.recorder.summary()["written"] == 2

    with_archive(tmp_path, scenario)


def test_a_duplicate_and_a_report_from_the_future_are_kept_and_flagged(tmp_path: Path) -> None:
    async def scenario(client: Any, service: Service) -> None:
        now = time.time()
        service.ingest(position(heard_at=now), now)
        service.ingest(position(heard_at=now + 1), now)
        service.ingest(position(mmsi=368000002, heard_at=now + 9000), now)
        assert service.recorder is not None
        service.recorder.flush()
        assert service.recorder.summary()["written"] == 3
        found = await client.get(
            "/v1/reports", params={"from": iso(now - 60), "to": iso(now + 10_000)}
        )
        flags = [r["flags"] for r in (await found.json())["reports"]]
        assert flags == [[], ["duplicate"], ["future_time"]]

    with_archive(tmp_path, scenario)


def test_a_last_known_position_shows_live_but_is_not_history(tmp_path: Path) -> None:
    async def scenario(client: Any, service: Service) -> None:
        now = time.time()
        service.ingest(replace(position(heard_at=now), last_known=True), now)
        [vessel] = (await (await client.get("/v1/vessels")).json())["vessels"]
        assert vessel["flags"] == ["last_known_position"]
        assert service.recorder is not None
        service.recorder.flush()
        assert service.recorder.summary()["written"] == 0

    with_archive(tmp_path, scenario)


def test_a_restart_refills_the_live_map_with_identities(tmp_path: Path) -> None:
    now = time.time()

    async def first(_client: Any, service: Service) -> None:
        service.ingest(identified(heard_at=now - 120), now - 120)
        service.ingest(position(heard_at=now - 60), now - 60)

    async def second(client: Any, service: Service) -> None:
        [vessel] = (await (await client.get("/v1/vessels")).json())["vessels"]
        assert vessel["name"] == "TEST SHIP"
        assert vessel["mmsi"] == 368000001
        assert service.health.counts["position"] == 0

    with_archive(tmp_path, first)
    with_archive(tmp_path, second)


def test_track_activity_and_coverage_endpoints(tmp_path: Path) -> None:
    async def scenario(client: Any, service: Service) -> None:
        now = time.time()
        service.ingest(identified(heard_at=now - 10), now - 10)
        service.ingest(position(heard_at=now - 10), now - 10)
        service.ingest(position(mmsi=338000002, heard_at=now - 10), now - 10)
        assert service.recorder is not None
        service.recorder.flush()
        window = {"from": iso(now - 3600), "to": iso(now + 60)}

        track = await client.get("/v1/track", params={"mmsi": "368000001", **window})
        assert track.status == 200
        assert len((await track.json())["points"]) == 1
        hidden = await client.get("/v1/track", params={"mmsi": "338000002", **window})
        assert hidden.status == 404

        activity = await client.get("/v1/activity", params=window)
        assert sum(r["reports"] for r in (await activity.json())["bins"]) == 2

        coverage = await (await client.get("/v1/coverage", params=window)).json()
        assert [s["source"] for s in coverage["segments"]] == ["aisstream"]
        assert coverage["gaps"]

    with_archive(tmp_path, scenario)


def test_history_inputs_are_validated(tmp_path: Path) -> None:
    async def scenario(client: Any, _service: Service) -> None:
        good = {"from": "2026-11-07T00:00:00Z", "to": "2026-11-07T01:00:00Z"}
        for path, params in [
            ("/v1/history", {"at": "yesterday"}),
            ("/v1/history", {"at": "2026-11-07T00:00:00"}),
            ("/v1/history", {"window_s": "0"}),
            ("/v1/history", {"window_s": "abc"}),
            ("/v1/history", {"window_s": "999999"}),
            ("/v1/track", good),
            ("/v1/track", {"mmsi": "abc", **good}),
            ("/v1/track", {"mmsi": "1", "from": good["to"], "to": good["from"]}),
            ("/v1/track", {"mmsi": "1", "max_points": "0", **good}),
            ("/v1/track", {"mmsi": "1", "max_points": "999999", **good}),
            ("/v1/track", {"mmsi": "1", "from": "2020-01-01T00:00:00Z", "to": good["to"]}),
            ("/v1/reports", {"from": "2020-01-01T00:00:00Z", "to": good["to"]}),
            ("/v1/reports", {"limit": "0", **good}),
            ("/v1/reports", {"limit": "999999", **good}),
            ("/v1/reports", {"box": "1,2,3", **good}),
            ("/v1/reports", {"type": "Spaceship", **good}),
            ("/v1/reports", {"mmsi": "abc", **good}),
            ("/v1/reports", {"after": "nonsense", **good}),
            ("/v1/reports", {"after": "1.0~x~live", **good}),
            ("/v1/reports", {"mmsi": "9" * 30, **good}),
            ("/v1/track", {"mmsi": "9" * 30, **good}),
            ("/v1/track", {"mmsi": "-1", **good}),
            ("/v1/history", {"at": "0001-01-01T00:00:00Z"}),
            ("/v1/history", {"at": "9999-12-31T23:59:59Z"}),
            ("/v1/coverage", {"to": "0001-01-01T00:00:00Z"}),
            ("/v1/catalog", {"type": "Spaceship", **good}),
            ("/v1/density", {"type": "Spaceship", **good}),
            ("/v1/activity", {"bin_s": "60", **good}),
            ("/v1/activity", {"from": good["to"], "to": good["from"]}),
            ("/v1/coverage", {"from": "nope"}),
        ]:
            assert (await client.get(path, params=params)).status == 400, (path, params)

    with_archive(tmp_path, scenario)


def test_reports_catalog_and_density_endpoints(tmp_path: Path) -> None:
    async def scenario(client: Any, service: Service) -> None:
        now = time.time()
        service.ingest(identified(heard_at=now - 10), now - 10)
        service.ingest(position(heard_at=now - 10), now - 10)
        service.ingest(position(mmsi=338000002, heard_at=now - 10), now - 10)
        assert service.recorder is not None
        service.recorder.flush()
        window = {"from": iso(now - 3600), "to": iso(now + 60)}

        found = await client.get(
            "/v1/reports",
            params={"box": "48,-123,49,-122", "type": "Passenger,Unknown", "limit": "10", **window},
        )
        assert found.status == 200
        body = await found.json()
        assert len(body["reports"]) == 2
        assert body["truncated"] is False
        hidden = await client.get("/v1/reports", params={"mmsi": "338000002", **window})
        assert hidden.status == 404
        first = await (await client.get("/v1/reports", params={"limit": "1", **window})).json()
        assert first["next"] is not None
        rest = await client.get(
            "/v1/reports", params={"limit": "1", "after": first["next"], **window}
        )
        assert (await rest.json())["reports"] != first["reports"]

        catalog = await (await client.get("/v1/catalog", params=window)).json()
        assert [v["mmsi"] for v in catalog["vessels"]] == [368000001]
        assert catalog["private"] == [{"type": "Unknown", "vessels": 1, "reports": 1}]

        density = await (await client.get("/v1/density", params=window)).json()
        assert density["cell_deg"] == 0.01
        assert [c["vessels"] for c in density["cells"]] == [1]

    with_archive(tmp_path, scenario)


def test_a_client_over_its_allowance_is_told_to_wait() -> None:
    async def scenario(client: Any, _service: Service) -> None:
        assert (await client.get("/healthz")).status == 200
        assert (await client.get("/healthz")).status == 200
        refused = await client.get("/healthz")
        assert refused.status == 429
        assert int(refused.headers["Retry-After"]) >= 1
        assert refused.headers["Access-Control-Allow-Origin"] == "*"
        other = await client.get("/healthz", headers={"X-Forwarded-For": "203.0.113.9"})
        assert other.status == 429

    with_client(scenario, rate_burst=2, rate_per_s=0.01)


def test_behind_a_trusted_proxy_each_forwarded_address_has_its_own_allowance() -> None:
    async def scenario(client: Any, _service: Service) -> None:
        first = {"X-Forwarded-For": "203.0.113.9"}
        assert (await client.get("/healthz", headers=first)).status == 200
        assert (await client.get("/healthz", headers=first)).status == 429
        second = {"X-Forwarded-For": "198.51.100.7"}
        assert (await client.get("/healthz", headers=second)).status == 200

    with_client(scenario, rate_burst=1, rate_per_s=0.01, trust_proxy=True)


def test_one_client_cannot_hold_every_stream() -> None:
    async def scenario(client: Any, _service: Service) -> None:
        mine = [await client.get("/v1/stream") for _ in range(2)]
        assert (await client.get("/v1/stream")).status == 429
        theirs = await client.get("/v1/stream", headers={"X-Forwarded-For": "198.51.100.7"})
        assert theirs.status == 200
        mine[0].close()
        await asyncio.sleep(0.1)
        again = await client.get("/v1/stream")
        assert again.status == 200
        for stream in [*mine[1:], theirs, again]:
            stream.close()

    with_client(scenario, streams_per_client=2, max_clients=10, trust_proxy=True)
