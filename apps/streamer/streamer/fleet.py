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
TYPES = {*TYPE_WORDS.values(), *DECADE_WORDS.values(), "Other", "Unknown"}


@dataclass(frozen=True, slots=True)
class Position:
    mmsi: int
    vessel_class: Literal["A", "B"] | None
    lat: float
    lon: float
    sog_kn: float | None
    cog_deg: float | None
    heading_deg: int | None
    nav_status: int | None
    high_accuracy: bool | None
    transmit_second: int | None
    heard_at: float
    name: str | None
    # From a static message's metadata: where the provider last placed it, of unknown age.
    last_known: bool = False


@dataclass(frozen=True, slots=True)
class Static:
    mmsi: int
    heard_at: float
    name: str | None
    callsign: str | None
    type_code: int | None
    length_m: int | None
    imo: int | None = None
    width_m: int | None = None
    draft_m: float | None = None
    destination: str | None = None
    cargo: int | None = None


Report = Position | Static


class VesselRecord(TypedDict):
    id: str
    mmsi: int | None
    name: str
    type: str
    length_m: int | None
    callsign: str | None
    imo: int | None
    width_m: int | None
    draft_m: float | None
    destination: str | None
    vessel_class: Literal["A", "B"] | None
    lat: float
    lon: float
    sog_kn: float | None
    cog_deg: float | None
    heading_deg: int | None
    nav_status: int | None
    high_accuracy: bool | None
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
    imo: int | None = None
    width_m: int | None = None
    draft_m: float | None = None
    destination: str | None = None
    cargo: int | None = None


def below(value: float | None, limit: float) -> float | None:
    return value if value is not None and value < limit else None


def type_word(code: int | None) -> str:
    if code is None:
        return "Unknown"
    if code in TYPE_WORDS:
        return TYPE_WORDS[code]
    return DECADE_WORDS.get(code // 10, "Other") if 10 <= code <= 99 else "Other"


def is_identified(type_code: int | None) -> bool:
    # An unknown type stays private: it may be a pleasure boat whose type hasn't arrived.
    return type_code is not None and type_word(type_code) not in PRIVATE


def vessel_id(salt: bytes, key: str) -> str:
    # A keyed hash, so a client can follow a boat without learning its MMSI, which looks up
    # its owner.
    return f"v-{hmac.new(salt, key.encode(), hashlib.sha256).hexdigest()[:16]}"


def public_record(
    record_id: str,
    position: Position,
    identity: Static | None,
    received_at: float,
    flags: list[str],
    source: str,
) -> VesselRecord:
    type_code = identity.type_code if identity else None
    length_m = identity.length_m if identity else None
    kind = type_word(type_code)
    identified = is_identified(type_code)
    label = "Unidentified vessel" if type_code is None else kind
    generic = f"{label}, {length_m} m" if length_m else label
    name = identity.name if identity else None
    return {
        "id": record_id,
        "mmsi": position.mmsi if identified else None,
        "name": (name or generic) if identified else generic,
        "type": kind,
        "length_m": length_m,
        "callsign": identity.callsign if identified and identity else None,
        "imo": identity.imo if identified and identity else None,
        "width_m": identity.width_m if identified and identity else None,
        "draft_m": identity.draft_m if identified and identity else None,
        "destination": identity.destination if identified and identity else None,
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
        "received_at": iso(received_at),
        "flags": flags,
        "source": source,
    }


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
            # The id doesn't change when the vessel's type arrives.
            vessel = Vessel(id=vessel_id(self._salt, str(mmsi)), last_heard=heard_at)
            self._vessels[mmsi] = vessel
        return vessel

    def _apply_position(
        self, report: Position, received_at: float
    ) -> tuple[VesselRecord | None, str]:
        if report.heard_at > received_at + MAX_FUTURE_S:
            return None, "future_time"
        vessel = self._vessel(report.mmsi, report.heard_at)
        previous = vessel.position
        if report.last_known and previous is not None:
            # It only fills a blank: anything a vessel actually reported is better.
            if not previous.last_known:
                return None, "last_known_ignored"
            if (previous.lat, previous.lon) == (report.lat, report.lon):
                return None, "last_known_unchanged"
        if previous is not None and previous.last_known:
            # Its age is unknown, so it can't make a real report stale or look like a jump.
            previous = None
        if previous is not None:
            if report.heard_at < previous.heard_at:
                return None, "stale"
            if is_duplicate(previous, report):
                return None, "duplicate"
        # Flagged, not hidden: a jump can be bad GPS or a spoofed identity, and an officer
        # should see either one.
        flags = ["position_jump"] if previous is not None and is_jump(previous, report) else []
        if report.last_known:
            flags.append("last_known_position")
        if not 200_000_000 <= report.mmsi <= 799_999_999:
            flags.append("nonstandard_mmsi")
        vessel.position = report
        vessel.received_at = received_at
        vessel.flags = flags
        vessel.last_heard = max(vessel.last_heard, report.heard_at)
        vessel.name = vessel.name or report.name
        return self._record(vessel), "last_known" if report.last_known else "position"

    def _apply_static(self, report: Static, received_at: float) -> tuple[VesselRecord | None, str]:
        vessel = self._vessel(report.mmsi, min(report.heard_at, received_at))
        before = self._record(vessel) if vessel.position else None
        vessel.name = report.name or vessel.name
        vessel.callsign = report.callsign or vessel.callsign
        vessel.type_code = report.type_code or vessel.type_code
        vessel.length_m = report.length_m or vessel.length_m
        vessel.imo = report.imo or vessel.imo
        vessel.width_m = report.width_m or vessel.width_m
        vessel.draft_m = report.draft_m or vessel.draft_m
        vessel.destination = report.destination or vessel.destination
        vessel.cargo = report.cargo or vessel.cargo
        vessel.last_heard = max(vessel.last_heard, min(report.heard_at, received_at))
        if before is None:
            return None, "static_pending"
        after = self._record(vessel)
        return (None, "static_unchanged") if after == before else (after, "static")

    def _record(self, vessel: Vessel) -> VesselRecord:
        position = vessel.position
        assert position is not None
        identity = Static(
            position.mmsi,
            position.heard_at,
            vessel.name,
            vessel.callsign,
            vessel.type_code,
            vessel.length_m,
            vessel.imo,
            vessel.width_m,
            vessel.draft_m,
            vessel.destination,
            vessel.cargo,
        )
        return public_record(
            vessel.id, position, identity, vessel.received_at, vessel.flags, self._source
        )
