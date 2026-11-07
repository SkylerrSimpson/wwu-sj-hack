"""Parsing runs on message shapes copied from the real feed, with invented identities."""

import asyncio
import json
import logging
import random
from collections import Counter
from collections.abc import Awaitable, Callable
from datetime import UTC, datetime
from typing import Any

import pytest
from aiohttp import WSMsgType, web
from aiohttp.test_utils import TestServer

from streamer import aisstream
from streamer.config import Box
from streamer.fleet import Position, Static
from streamer.health import Health

STAMP = "2026-11-07 19:15:49.160173018 +0000 UTC"
HEARD_AT = datetime(2026, 11, 7, 19, 15, 49, tzinfo=UTC).timestamp() + 0.160173


def message(kind: str, body: dict[str, Any], **meta: Any) -> str:
    return json.dumps(
        {
            "MetaData": {
                "MMSI": 368000001,
                "MMSI_String": 368000001,
                "ShipName": "TEST SHIP   ",
                "latitude": 48.72345,
                "longitude": -122.67741,
                "time_utc": STAMP,
                **meta,
            },
            "MessageType": kind,
            "Message": {kind: body},
        }
    )


def class_a(**overrides: Any) -> dict[str, Any]:
    return {
        "Cog": 220,
        "Latitude": 48.72345,
        "Longitude": -122.67741166666666,
        "NavigationalStatus": 0,
        "PositionAccuracy": True,
        "Sog": 9.5,
        "Timestamp": 48,
        "TrueHeading": 217,
        "UserID": 368000001,
        "Valid": True,
        **overrides,
    }


def only_position(raw: str) -> Position:
    [report] = aisstream.parse(raw)
    assert isinstance(report, Position)
    return report


def only_static(raw: str) -> Static:
    [report] = aisstream.parse(raw)
    assert isinstance(report, Static)
    return report


def test_position_report_keeps_the_real_values() -> None:
    p = only_position(message("PositionReport", class_a()))
    assert p.mmsi == 368000001
    assert p.vessel_class == "A"
    assert (p.lat, p.lon) == (48.72345, -122.677412)
    assert (p.sog_kn, p.cog_deg, p.heading_deg) == (9.5, 220, 217)
    assert (p.nav_status, p.transmit_second, p.high_accuracy) == (0, 48, True)
    assert p.name == "TEST SHIP"
    assert p.heard_at == pytest.approx(HEARD_AT, abs=1e-3)


@pytest.mark.parametrize(
    ("field", "unavailable", "read"),
    [
        ("Sog", 102.3, lambda p: p.sog_kn),
        ("Sog", 102.2, lambda p: p.sog_kn),
        ("Cog", 360, lambda p: p.cog_deg),
        ("TrueHeading", 511, lambda p: p.heading_deg),
        ("Timestamp", 60, lambda p: p.transmit_second),
        ("NavigationalStatus", 15, lambda p: p.nav_status),
    ],
)
def test_unavailable_values_become_none_not_fake_numbers(
    field: str, unavailable: float, read: Any
) -> None:
    assert read(only_position(message("PositionReport", class_a(**{field: unavailable})))) is None


def test_class_b_position_has_no_navigation_status() -> None:
    body = class_a()
    del body["NavigationalStatus"]
    p = only_position(message("StandardClassBPositionReport", body))
    assert p.vessel_class == "B"
    assert p.nav_status is None


@pytest.mark.parametrize(
    ("overrides", "reason"),
    [
        ({"Valid": False}, "invalid_flag"),
        ({"Latitude": 91.0}, "bad_position"),
        ({"Longitude": 181.0}, "bad_position"),
    ],
)
def test_unusable_positions_are_rejected_with_a_reason(
    overrides: dict[str, Any], reason: str
) -> None:
    with pytest.raises(aisstream.Rejected) as rejected:
        aisstream.parse(message("PositionReport", class_a(**overrides)))
    assert rejected.value.reason == reason


def test_unreadable_time_is_rejected() -> None:
    with pytest.raises(aisstream.Rejected) as rejected:
        aisstream.parse(message("PositionReport", class_a(), time_utc="yesterday"))
    assert rejected.value.reason == "bad_time"


def test_time_with_fewer_fractional_digits_parses() -> None:
    raw = message("PositionReport", class_a(), time_utc="2026-11-07 18:46:38.49729753 +0000 UTC")
    assert only_position(raw).heard_at % 60 == pytest.approx(38.497, abs=1e-3)


def test_time_without_a_fraction_parses() -> None:
    raw = message("PositionReport", class_a(), time_utc="2026-11-07 18:46:38 +0000 UTC")
    assert only_position(raw).heard_at % 60 == 38


def test_broken_json_is_rejected() -> None:
    with pytest.raises(aisstream.Rejected) as rejected:
        aisstream.parse("{not json")
    assert rejected.value.reason == "bad_json"


def test_a_missing_field_is_rejected_not_a_crash() -> None:
    body = class_a()
    del body["Latitude"]
    with pytest.raises(aisstream.Rejected) as rejected:
        aisstream.parse(message("PositionReport", body))
    assert rejected.value.reason == "bad_shape"


def test_an_unknown_message_type_is_rejected() -> None:
    with pytest.raises(aisstream.Rejected) as rejected:
        aisstream.parse(message("AidsToNavigationReport", {}))
    assert rejected.value.reason == "unsupported_type"


def test_ship_static_data() -> None:
    s = only_static(
        message(
            "ShipStaticData",
            {
                "Name": "TEST SHIP@@@@",
                "CallSign": "WXY1234 ",
                "Type": 60,
                "Dimension": {"A": 20, "B": 15, "C": 5, "D": 5},
                "Valid": True,
            },
        )
    )
    assert (s.name, s.callsign, s.type_code, s.length_m) == ("TEST SHIP", "WXY1234", 60, 35)


def test_static_report_part_a_carries_only_the_name() -> None:
    s = only_static(
        message(
            "StaticDataReport",
            {
                "PartNumber": False,
                "ReportA": {"Name": "SMALL BOAT", "Valid": True},
                "ReportB": {
                    "CallSign": "",
                    "ShipType": 0,
                    "Dimension": {"A": 0, "B": 0, "C": 0, "D": 0},
                    "Valid": False,
                },
                "Valid": True,
            },
        )
    )
    assert (s.name, s.callsign, s.type_code, s.length_m) == ("SMALL BOAT", None, None, None)


def test_static_report_part_b_carries_type_and_length() -> None:
    s = only_static(
        message(
            "StaticDataReport",
            {
                "PartNumber": True,
                "ReportA": {"Name": "", "Valid": False},
                "ReportB": {
                    "CallSign": "WAB9999",
                    "ShipType": 37,
                    "Dimension": {"A": 6, "B": 4, "C": 2, "D": 1},
                    "Valid": True,
                },
                "Valid": True,
            },
        )
    )
    assert (s.name, s.callsign, s.type_code, s.length_m) == (None, "WAB9999", 37, 10)


def test_extended_class_b_is_both_a_position_and_static() -> None:
    body = class_a(Name="BIG B", Type=36, Dimension={"A": 8, "B": 4, "C": 2, "D": 2})
    position, static = aisstream.parse(message("ExtendedClassBPositionReport", body))
    assert isinstance(position, Position)
    assert isinstance(static, Static)
    assert (static.name, static.type_code, static.length_m) == ("BIG B", 36, 12)


def test_confirmation_is_not_a_report() -> None:
    raw = json.dumps(
        {"Message": {"CompressionEnabled": True}, "MessageType": "SubscriptionConfirmation"}
    )
    assert aisstream.parse(raw) == []


def test_provider_error_is_raised() -> None:
    with pytest.raises(aisstream.FeedError, match="Api Key Is Not Valid"):
        aisstream.parse(json.dumps({"error": "Api Key Is Not Valid"}))


def test_subscription_uses_the_box_and_filters_types() -> None:
    sub = aisstream.subscription("secret", Box(48.6, -122.9, 48.9, -122.4))
    assert sub["APIKey"] == "secret"
    assert sub["BoundingBoxes"] == [[[48.6, -122.9], [48.9, -122.4]]]
    assert "PositionReport" in sub["FilterMessageTypes"]
    assert "StaticDataReport" in sub["FilterMessageTypes"]


def test_backoff_grows_stays_capped_and_jitters() -> None:
    rng = random.Random(1)
    delays = [aisstream.backoff(n, rng=rng) for n in range(12)]
    assert 0.5 <= delays[0] <= 1
    assert delays[3] > delays[0]
    assert all(d <= 60 for d in delays)
    assert aisstream.backoff(11, rng=rng) != aisstream.backoff(11, rng=rng)


def test_being_rate_limited_waits_longer() -> None:
    assert aisstream.backoff(0, rate_limited=True, rng=random.Random(1)) >= 30


BOX = Box(48.0, -123.0, 49.0, -122.0)
Script = Callable[[web.WebSocketResponse], Awaitable[None]]


async def hold(ws: web.WebSocketResponse) -> None:
    await ws.receive()


async def closes(ws: web.WebSocketResponse) -> None:
    await ws.close()


async def sends_a_position(ws: web.WebSocketResponse) -> None:
    await ws.send_str(message("PositionReport", class_a()))
    await hold(ws)


class FakeFeed:
    """A local server speaking the provider's protocol, so the real client code runs."""

    def __init__(self, *scripts: Script) -> None:
        self.scripts = list(scripts)
        self.subscriptions: list[dict[str, Any]] = []
        self.compressed: list[bool] = []
        self.connections = 0

    async def handle(self, request: web.Request) -> web.WebSocketResponse:
        ws = web.WebSocketResponse(compress=True)
        await ws.prepare(request)
        self.connections += 1
        self.compressed.append(bool(ws.compress))
        first = await asyncio.wait_for(ws.receive(), timeout=3)
        assert first.type == WSMsgType.TEXT
        self.subscriptions.append(json.loads(first.data))
        await (self.scripts.pop(0) if self.scripts else hold)(ws)
        return ws


Done = Callable[[list[Any], Health, FakeFeed], bool]


async def run_until(
    feed: FakeFeed,
    done: Done,
    *,
    silence_after: float = 5,
    on_report: Callable[[Any], None] | None = None,
) -> tuple[list[Any], Health]:
    app = web.Application()
    app.router.add_get("/", feed.handle)
    server = TestServer(app)
    await server.start_server()
    seen: list[Any] = []
    state = Health(counts=Counter())
    task = asyncio.create_task(
        aisstream.run(
            str(server.make_url("/")),
            "secret-key",
            BOX,
            on_report or seen.append,
            state,
            silence_after=silence_after,
            retry_delay=lambda *_: 0.01,
        )
    )
    try:
        async with asyncio.timeout(5):
            while not done(seen, state, feed):
                await asyncio.sleep(0.01)
    finally:
        task.cancel()
        await asyncio.gather(task, return_exceptions=True)
        await server.close()
    return seen, state


def one_seen(seen: list[Any], _state: Health, _feed: FakeFeed) -> bool:
    return len(seen) == 1


def two_connections(_seen: list[Any], _state: Health, feed: FakeFeed) -> bool:
    return feed.connections >= 2


def test_client_subscribes_at_once_compressed_and_delivers_reports() -> None:
    async def binary(ws: web.WebSocketResponse) -> None:
        await ws.send_bytes(message("PositionReport", class_a()).encode())
        await hold(ws)

    feed = FakeFeed(binary)
    seen, state = asyncio.run(run_until(feed, lambda seen, s, _: len(seen) == 1 and s.connected))
    assert feed.subscriptions[0]["APIKey"] == "secret-key"
    assert feed.compressed == [True]
    assert state.compressed is True
    assert isinstance(seen[0], Position)
    assert state.counts["messages"] == 1
    assert state.last_message_at is not None


def test_client_resubscribes_after_the_server_closes() -> None:
    feed = FakeFeed(closes, sends_a_position)
    _, state = asyncio.run(run_until(feed, one_seen))
    assert len(feed.subscriptions) == 2
    assert state.counts["reconnects"] == 1


def test_a_silent_connection_is_dropped_and_retried() -> None:
    feed = FakeFeed(hold, sends_a_position)
    _, state = asyncio.run(run_until(feed, one_seen, silence_after=0.05))
    assert feed.connections == 2
    assert "silent" in (state.last_error or "")


def test_a_bad_message_doesnt_end_the_connection() -> None:
    async def script(ws: web.WebSocketResponse) -> None:
        await ws.send_str("{not json")
        await sends_a_position(ws)

    feed = FakeFeed(script)
    _, state = asyncio.run(run_until(feed, one_seen))
    assert feed.connections == 1
    assert state.counts["rejected_bad_json"] == 1


def test_a_bug_while_handling_a_report_doesnt_end_the_connection() -> None:
    delivered: list[Any] = []

    def explodes_once(report: Any) -> None:
        delivered.append(report)
        if len(delivered) == 1:
            raise RuntimeError("bug")

    async def script(ws: web.WebSocketResponse) -> None:
        await ws.send_str(message("PositionReport", class_a()))
        await sends_a_position(ws)

    feed = FakeFeed(script)
    _, state = asyncio.run(run_until(feed, lambda *_: len(delivered) == 2, on_report=explodes_once))
    assert feed.connections == 1
    assert state.counts["handler_errors"] == 1


def test_a_report_outside_the_box_is_counted_not_delivered() -> None:
    async def script(ws: web.WebSocketResponse) -> None:
        await ws.send_str(message("PositionReport", class_a(Latitude=10.0)))
        await sends_a_position(ws)

    feed = FakeFeed(script)
    seen, state = asyncio.run(run_until(feed, one_seen))
    assert state.counts["outside_box"] == 1
    assert seen[0].lat == 48.72345


def test_provider_error_reconnects_and_is_visible_in_health() -> None:
    async def refuses(ws: web.WebSocketResponse) -> None:
        await ws.send_str(json.dumps({"error": "Api Key Is Not Valid"}))
        await hold(ws)

    feed = FakeFeed(refuses)
    _, state = asyncio.run(run_until(feed, two_connections))
    assert "Api Key Is Not Valid" in (state.last_error or "")


def test_the_key_never_reaches_the_logs(caplog: pytest.LogCaptureFixture) -> None:
    caplog.set_level(logging.DEBUG)
    feed = FakeFeed(closes, closes)
    _, state = asyncio.run(run_until(feed, two_connections))
    assert "secret-key" not in caplog.text
    assert "secret-key" not in (state.last_error or "")
