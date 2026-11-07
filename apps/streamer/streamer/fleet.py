"""The latest known state of every vessel, and the only place a public record is built."""

import hashlib
import hmac
from dataclasses import dataclass, field
from datetime import UTC, datetime
from math import asin, cos, radians, sin, sqrt
from typing import Literal, TypedDict

# Knots above which a move can't be a real vessel; below MIN_JUMP_KM it's GPS noise.
MAX_PLAUSIBLE_KN = 80.0
MIN_JUMP_KM = 1.0
# Several receivers relay one transmission, each with its own stamp.
DUPLICATE_WINDOW_S = 5.0
# A clock that far ahead would make every honest report after it look out of order.
MAX_FUTURE_S = 300.0

# The same words and privacy rule as data/build.py, so live and recorded vessels read alike.
TYPE_WORDS = {
    30: "Fishing",
    31: "Tug",
    32: "Tug",
    52: "Tug",
    36: "Sailing",
    37: "Pleasure craft",
    54: "Anti-pollution",
    55: "Law enforcement",
}
DECADE_WORDS = {6: "Passenger", 7: "Cargo", 8: "Tanker"}
PRIVATE = {"Fishing", "Sailing", "Pleasure craft"}


@dataclass(frozen=True, slots=True)
class Position:
    mmsi: int
    vessel_class: Literal["A", "B"]
    lat: float
    lon: float
    sog_kn: float | None
    cog_deg: float | None
    heading_deg: int | None
    nav_status: int | None
    high_accuracy: bool
    transmit_second: int | None
    heard_at: float
    name: str | None


@dataclass(frozen=True, slots=True)
class Static:
    mmsi: int
    heard_at: float
    name: str | None
    callsign: str | None
    type_code: int | None
    length_m: int | None


Report = Position | Static


class VesselRecord(TypedDict):
    id: str
    mmsi: int | None
    name: str
    type: str
    length_m: int | None
    callsign: str | None
    vessel_class: Literal["A", "B"]
    lat: float
    lon: float
    sog_kn: float | None
    cog_deg: float | None
    heading_deg: int | None
    nav_status: int | None
    high_accuracy: bool
    transmit_second: int | None
    heard_at: str
    received_at: str
    flags: list[str]
    source: str


@dataclass(slots=True)
class Vessel:
    id: str
    last_heard: float
    position: Position | None = None
    received_at: float = 0.0
    flags: list[str] = field(default_factory=list)
    name: str | None = None
    callsign: str | None = None
    type_code: int | None = None
    length_m: int | None = None


def type_word(code: int | None) -> str:
    if code is None:
        return "Unknown"
    if code in TYPE_WORDS:
        return TYPE_WORDS[code]
    return DECADE_WORDS.get(code // 10, "Other") if 10 <= code <= 99 else "Other"


def iso(timestamp: float) -> str:
    return (
        datetime.fromtimestamp(timestamp, UTC)
        .isoformat(timespec="milliseconds")
        .replace("+00:00", "Z")
    )


def distance_km(a: Position, b: Position) -> float:
    dlat = radians(b.lat - a.lat)
    dlon = radians(b.lon - a.lon)
    h = sin(dlat / 2) ** 2 + cos(radians(a.lat)) * cos(radians(b.lat)) * sin(dlon / 2) ** 2
    return 2 * 6371.0 * asin(sqrt(h))


def is_duplicate(previous: Position, new: Position) -> bool:
    return new.heard_at - previous.heard_at <= DUPLICATE_WINDOW_S and (
        new.lat,
        new.lon,
        new.transmit_second,
    ) == (previous.lat, previous.lon, previous.transmit_second)


def is_jump(previous: Position, new: Position) -> bool:
    km = distance_km(previous, new)
    hours = max(new.heard_at - previous.heard_at, 1.0) / 3600
    return km > MIN_JUMP_KM and km / 1.852 / hours > MAX_PLAUSIBLE_KN


class Fleet:
    def __init__(self, id_salt: bytes, source: str) -> None:
        self._salt = id_salt
        self._source = source
        self._vessels: dict[int, Vessel] = {}

    def __len__(self) -> int:
        return len(self._vessels)

    def apply(self, report: Report, received_at: float) -> tuple[VesselRecord | None, str]:
        """Returns the record to publish, if any, and what happened, for the health counts."""
        if isinstance(report, Position):
            return self._apply_position(report, received_at)
        return self._apply_static(report, received_at)

    def snapshot(self, now: float, max_age_s: float | None = None) -> list[VesselRecord]:
        heard = [
            v
            for v in self._vessels.values()
            if v.position and (max_age_s is None or now - v.position.heard_at <= max_age_s)
        ]
        heard.sort(key=lambda v: v.position.heard_at if v.position else 0, reverse=True)
        return [self._record(v) for v in heard]

    def prune(self, before: float) -> int:
        gone = [mmsi for mmsi, v in self._vessels.items() if v.last_heard < before]
        for mmsi in gone:
            del self._vessels[mmsi]
        return len(gone)

    def _vessel(self, mmsi: int, heard_at: float) -> Vessel:
        vessel = self._vessels.get(mmsi)
        if vessel is None:
            # A keyed hash, so a client can follow a boat without learning its MMSI, which
            # looks up its owner. The id doesn't change when the vessel's type arrives.
            digest = hmac.new(self._salt, str(mmsi).encode(), hashlib.sha256).hexdigest()
            vessel = Vessel(id=f"v-{digest[:16]}", last_heard=heard_at)
            self._vessels[mmsi] = vessel
        return vessel

    def _apply_position(
        self, report: Position, received_at: float
    ) -> tuple[VesselRecord | None, str]:
        if report.heard_at > received_at + MAX_FUTURE_S:
            return None, "future_time"
        vessel = self._vessel(report.mmsi, report.heard_at)
        previous = vessel.position
        if previous is not None:
            if report.heard_at < previous.heard_at:
                return None, "stale"
            if is_duplicate(previous, report):
                return None, "duplicate"
        # Flagged, not hidden: a jump can be bad GPS or a spoofed identity, and an officer
        # should see either one.
        flags = ["position_jump"] if previous is not None and is_jump(previous, report) else []
        if not 200_000_000 <= report.mmsi <= 799_999_999:
            flags.append("nonstandard_mmsi")
        vessel.position = report
        vessel.received_at = received_at
        vessel.flags = flags
        vessel.last_heard = max(vessel.last_heard, report.heard_at)
        vessel.name = vessel.name or report.name
        return self._record(vessel), "position"

    def _apply_static(self, report: Static, received_at: float) -> tuple[VesselRecord | None, str]:
        vessel = self._vessel(report.mmsi, min(report.heard_at, received_at))
        before = self._record(vessel) if vessel.position else None
        vessel.name = report.name or vessel.name
        vessel.callsign = report.callsign or vessel.callsign
        vessel.type_code = report.type_code or vessel.type_code
        vessel.length_m = report.length_m or vessel.length_m
        vessel.last_heard = max(vessel.last_heard, min(report.heard_at, received_at))
        if before is None:
            return None, "static_pending"
        after = self._record(vessel)
        return (None, "static_unchanged") if after == before else (after, "static")

    def _record(self, vessel: Vessel) -> VesselRecord:
        position = vessel.position
        assert position is not None
        kind = type_word(vessel.type_code)
        # An unknown type stays private: it may be a pleasure boat whose type hasn't arrived.
        identified = vessel.type_code is not None and kind not in PRIVATE
        label = "Unidentified vessel" if vessel.type_code is None else kind
        generic = f"{label}, {vessel.length_m} m" if vessel.length_m else label
        return {
            "id": vessel.id,
            "mmsi": position.mmsi if identified else None,
            "name": (vessel.name or generic) if identified else generic,
            "type": kind,
            "length_m": vessel.length_m,
            "callsign": vessel.callsign if identified else None,
            "vessel_class": position.vessel_class,
            "lat": position.lat,
            "lon": position.lon,
            "sog_kn": position.sog_kn,
            "cog_deg": position.cog_deg,
            "heading_deg": position.heading_deg,
            "nav_status": position.nav_status,
            "high_accuracy": position.high_accuracy,
            "transmit_second": position.transmit_second,
            "heard_at": iso(position.heard_at),
            "received_at": iso(vessel.received_at),
            "flags": vessel.flags,
            "source": self._source,
        }
