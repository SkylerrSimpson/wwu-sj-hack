"""Everything specific to AISStream. Moving provider means replacing this module."""

import asyncio
import json
import logging
import random
import re
import time
from collections.abc import Callable
from datetime import UTC, datetime
from typing import Any, Literal

import aiohttp

from streamer.config import Box
from streamer.fleet import Position, Report, Static
from streamer.health import Health

log = logging.getLogger(__name__)

SOURCE = "aisstream"
URL = "wss://stream.aisstream.io/v0/stream"

POSITION_KINDS: dict[str, Literal["A", "B"]] = {
    "PositionReport": "A",
    "StandardClassBPositionReport": "B",
    "ExtendedClassBPositionReport": "B",
}
STATIC_KINDS = {"ShipStaticData", "StaticDataReport"}
CONFIRMATION = "SubscriptionConfirmation"

# The Lummi box's longest silence over 8 minutes of daytime traffic was 18 seconds.
SILENCE_AFTER_S = 120.0
STABLE_AFTER_S = 60.0
MAX_BACKOFF_S = 60.0
RATE_LIMITED_BACKOFF_S = 30.0
HEARTBEAT_S = 30.0
HANDSHAKE_TIMEOUT_S = 20.0
# Uncompressed connections are subject to the provider's per-user bandwidth limit.
COMPRESSION_WINDOW_BITS = 15

TIME = re.compile(r"^(\d{4}-\d\d-\d\d \d\d:\d\d:\d\d)(\.\d+)? \+0000 UTC$")
RNG = random.Random()


class Rejected(Exception):
    """One message that can't be used. The stream carries on."""

    def __init__(self, reason: str) -> None:
        super().__init__(reason)
        self.reason = reason


class FeedError(Exception):
    """The connection itself has a problem and has to be replaced."""


def subscription(api_key: str, box: Box) -> dict[str, Any]:
    return {
        "APIKey": api_key,
        "BoundingBoxes": [[[box.south, box.west], [box.north, box.east]]],
        "FilterMessageTypes": [*POSITION_KINDS, *STATIC_KINDS],
    }


def parse_time(text: str) -> float:
    found = TIME.match(text)
    if found is None:
        raise Rejected("bad_time")
    try:
        whole = datetime.strptime(found.group(1), "%Y-%m-%d %H:%M:%S")
    except ValueError:
        raise Rejected("bad_time") from None
    return whole.replace(tzinfo=UTC).timestamp() + float(found.group(2) or 0)


def clean(text: str) -> str | None:
    # AIS pads unused characters of a text field with @.
    return text.replace("@", " ").strip() or None


def length_of(dimension: dict[str, int]) -> int | None:
    return (dimension["A"] + dimension["B"]) or None


def below(value: float, limit: float) -> float | None:
    return value if value < limit else None


def parse_position(kind: str, body: dict[str, Any], meta: dict[str, Any], heard: float) -> Position:
    if not body["Valid"]:
        raise Rejected("invalid_flag")
    lat, lon = float(body["Latitude"]), float(body["Longitude"])
    if not (-90 <= lat <= 90 and -180 <= lon <= 180):
        raise Rejected("bad_position")
    heading = int(body["TrueHeading"])
    second = int(body["Timestamp"])
    status = body.get("NavigationalStatus")
    return Position(
        mmsi=int(meta["MMSI"]),
        vessel_class=POSITION_KINDS[kind],
        lat=round(lat, 6),
        lon=round(lon, 6),
        # 102.3 knots, 360 degrees, heading 511, second 60 and status 15 all mean "not available",
        # and 102.2 knots means "that or faster", which isn't a measurement either.
        sog_kn=below(float(body["Sog"]), 102.2),
        cog_deg=below(float(body["Cog"]), 360),
        heading_deg=heading if heading < 360 else None,
        nav_status=None if status is None or status == 15 else int(status),
        high_accuracy=bool(body["PositionAccuracy"]),
        transmit_second=second if second < 60 else None,
        heard_at=heard,
        name=clean(str(meta.get("ShipName", ""))),
    )


def parse_static(kind: str, body: dict[str, Any], mmsi: int, heard: float) -> Static:
    if not body["Valid"]:
        raise Rejected("invalid_flag")
    if kind == "StaticDataReport":
        # Class B sends its name and its details as two separate parts; only one is filled in.
        part_a, part_b = body["ReportA"], body["ReportB"]
        has_b = bool(part_b["Valid"])
        return Static(
            mmsi=mmsi,
            heard_at=heard,
            name=clean(part_a["Name"]) if part_a["Valid"] else None,
            callsign=clean(part_b["CallSign"]) if has_b else None,
            type_code=(int(part_b["ShipType"]) or None) if has_b else None,
            length_m=length_of(part_b["Dimension"]) if has_b else None,
        )
    return Static(
        mmsi=mmsi,
        heard_at=heard,
        name=clean(body["Name"]),
        callsign=clean(body.get("CallSign", "")),
        type_code=int(body["Type"]) or None,
        length_m=length_of(body["Dimension"]),
    )


def last_known_position(kind: str, meta: dict[str, Any], heard: float) -> Position | None:
    """A static message's metadata has only the last position the provider knew, of unknown age.
    It agreed with a second source within 10 m for moored boats, but says nothing about a mover."""
    lat, lon = float(meta["latitude"]), float(meta["longitude"])
    if not (-90 <= lat <= 90 and -180 <= lon <= 180) or (lat == 0 and lon == 0):
        return None
    return Position(
        mmsi=int(meta["MMSI"]),
        vessel_class="A" if kind == "ShipStaticData" else "B",
        lat=round(lat, 6),
        lon=round(lon, 6),
        sog_kn=None,
        cog_deg=None,
        heading_deg=None,
        nav_status=None,
        high_accuracy=None,
        transmit_second=None,
        heard_at=heard,
        name=clean(str(meta.get("ShipName", ""))),
        last_known=True,
    )


def parse(raw: str | bytes) -> list[Report]:
    """The reports in one provider message, identity before position."""
    try:
        data = json.loads(raw)
    except ValueError:
        raise Rejected("bad_json") from None
    if not isinstance(data, dict):
        raise Rejected("bad_shape")
    if "error" in data:
        raise FeedError(str(data["error"]))
    kind = data.get("MessageType")
    if kind == CONFIRMATION:
        return []
    if kind not in POSITION_KINDS and kind not in STATIC_KINDS:
        raise Rejected("unsupported_type")
    try:
        meta = data["MetaData"]
        body = data["Message"][kind]
        heard = parse_time(meta["time_utc"])
        if kind in STATIC_KINDS:
            static = parse_static(kind, body, int(meta["MMSI"]), heard)
            known = last_known_position(kind, meta, heard)
            return [static] if known is None else [static, known]
        position = parse_position(kind, body, meta, heard)
        if kind == "ExtendedClassBPositionReport":
            return [position, parse_static("ShipStaticData", body, position.mmsi, heard)]
        return [position]
    except (KeyError, TypeError, ValueError, AttributeError):
        raise Rejected("bad_shape") from None


def backoff(attempt: int, rate_limited: bool = False, rng: random.Random = RNG) -> float:
    delay: float = min(MAX_BACKOFF_S, 2.0**attempt) * rng.uniform(0.5, 1.0)
    return max(delay, RATE_LIMITED_BACKOFF_S) if rate_limited else delay


def handle_message(
    raw: str | bytes, box: Box, on_report: Callable[[Report], None], health: Health
) -> None:
    health.heard(time.time())
    health.counts["messages"] += 1
    try:
        reports = parse(raw)
    except Rejected as rejected:
        health.counts[f"rejected_{rejected.reason}"] += 1
        return
    for report in reports:
        if isinstance(report, Position) and not box.contains(report.lat, report.lon):
            health.counts["outside_box"] += 1
            continue
        try:
            on_report(report)
        except Exception:
            health.counts["handler_errors"] += 1
            log.exception("handling one report failed")


async def read_until_broken(
    ws: aiohttp.ClientWebSocketResponse,
    box: Box,
    on_report: Callable[[Report], None],
    health: Health,
    silence_after: float,
) -> None:
    while True:
        try:
            message = await ws.receive(timeout=silence_after)
        except TimeoutError:
            raise FeedError(f"silent for {silence_after:g} s") from None
        if message.type not in (aiohttp.WSMsgType.TEXT, aiohttp.WSMsgType.BINARY):
            raise FeedError(f"connection closed, code {ws.close_code}")
        handle_message(message.data, box, on_report, health)


async def run(
    url: str,
    api_key: str,
    box: Box,
    on_report: Callable[[Report], None],
    health: Health,
    *,
    silence_after: float = SILENCE_AFTER_S,
    retry_delay: Callable[[int, bool], float] = backoff,
) -> None:
    """Holds one subscription for as long as the process lives."""
    attempt = 0
    connected_before = False
    timeout = aiohttp.ClientTimeout(total=HANDSHAKE_TIMEOUT_S)
    async with aiohttp.ClientSession(timeout=timeout) as session:
        while True:
            started = time.monotonic()
            rate_limited = False
            try:
                async with session.ws_connect(
                    url, compress=COMPRESSION_WINDOW_BITS, heartbeat=HEARTBEAT_S
                ) as ws:
                    # The provider closes a connection with no subscription after 3 seconds.
                    await ws.send_json(subscription(api_key, box))
                    health.connected = True
                    health.compressed = bool(ws.compress)
                    if not health.compressed:
                        log.warning("the feed refused compression: messages may be dropped")
                    if connected_before:
                        health.counts["reconnects"] += 1
                    connected_before = True
                    log.info("feed connected")
                    await read_until_broken(ws, box, on_report, health, silence_after)
            except (aiohttp.ClientError, OSError, FeedError) as error:
                rate_limited = (
                    isinstance(error, aiohttp.WSServerHandshakeError) and error.status == 429
                )
                health.last_error = f"{type(error).__name__}: {error}"
                log.warning("feed lost: %s", health.last_error)
            finally:
                health.connected = False
            if time.monotonic() - started >= STABLE_AFTER_S:
                attempt = 0
            await asyncio.sleep(retry_delay(attempt, rate_limited))
            attempt += 1
