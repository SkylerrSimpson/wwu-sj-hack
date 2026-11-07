"""The only writer of apps/web/public/data.json."""

import csv
import io
import json
import re
import zipfile
from datetime import UTC, datetime
from itertools import pairwise
from pathlib import Path
from typing import TypedDict

from check import OUT, is_private, problems_in

RAW = Path(__file__).resolve().parent / "raw"
STEP = 300  # seconds between kept positions of one vessel

SOURCES = [
    {
        "id": "ais",
        "name": "NOAA MarineCadastre AIS, Dec 5 to 9 2024, via the event organizers",
        "url": "https://marinecadastre.gov/ais",
        "retrieved": "2026-11-07",
    },
    {
        "id": "boundary",
        "name": "Lummi Indian Reservation boundary (KML), via the event organizers",
        "url": "https://lumminaturalresources.org/",
        "retrieved": "2026-11-07",
    },
    {
        "id": "demo",
        "name": "Synthetic demo vessel, invented for the demo",
        "url": "https://github.com/SkylerrSimpson/wwu-sj-hack",
        "retrieved": "2026-11-07",
    },
]

# Invented for the demo: the Lummi Island ferry and the patrol boat, the two working vessels seen inside.
# The fleet name patterns (XWL, WSF, SWN, NKK) are the app's, matched on name and callsign at runtime.
LISTED = {"368011730": "Whatcom County ferry", "338162321": "Law enforcement, listed"}

TYPE_WORDS = {
    "30": "Fishing",
    "31": "Tug",
    "32": "Tug",
    "52": "Tug",
    "36": "Sailing",
    "37": "Pleasure craft",
    "54": "Anti-pollution",
    "55": "Law enforcement",
}


class Vessel(TypedDict):
    id: str
    source: str
    name: str
    type: str
    length_m: int | None
    callsign: str
    fleet: str | None
    priority: bool
    track: list[list[float]]


def fetch() -> tuple[list[dict[str, str]], str]:
    with zipfile.ZipFile(RAW / "ais-2024-12-05-to-09.zip") as z, z.open(z.namelist()[0]) as f:
        rows = list(csv.DictReader(io.TextIOWrapper(f, encoding="utf-8", newline="")))
    return rows, (RAW / "lummi-reservation-boundary.kml").read_text(encoding="utf-8")


def type_word(code: str) -> str:
    if code in TYPE_WORDS:
        return TYPE_WORDS[code]
    decade = code[:1] if len(code) == 2 else ""
    return {"6": "Passenger", "7": "Cargo", "8": "Tanker"}.get(decade, "Other")


def length_m(row: dict[str, str]) -> int | None:
    return int(float(row["Length"])) if row["Length"] else None


def ring_from_kml(kml: str) -> list[list[float]]:
    found = re.search(r"<coordinates>(.*?)</coordinates>", kml, re.DOTALL)
    assert found, "no <coordinates> in the KML"
    return [[float(p.split(",")[0]), float(p.split(",")[1])] for p in found.group(1).split()]


def inside(lon: float, lat: float, ring: list[list[float]]) -> bool:
    hit = False
    for (x1, y1), (x2, y2) in pairwise(ring):
        if (y1 > lat) != (y2 > lat) and lon < x1 + (lat - y1) * (x2 - x1) / (y2 - y1):
            hit = not hit
    return hit


def tracks(rows: list[dict[str, str]]) -> list[Vessel]:
    """One position per vessel per STEP seconds, duplicates dropped; vessels in id order."""
    seen: set[tuple[str, int]] = set()
    vessels: dict[str, Vessel] = {}
    for r in rows:
        t = int(datetime.fromisoformat(r["BaseDateTime"]).replace(tzinfo=UTC).timestamp())
        if (r["MMSI"], t // STEP) in seen:
            continue
        seen.add((r["MMSI"], t // STEP))
        kind = type_word(r["VesselType"])
        length = length_m(r)
        private = is_private(kind, length)
        name = r["VesselName"].strip()
        if private or not name:
            name = f"{kind}, {length} m" if length else kind
        v = vessels.setdefault(
            r["MMSI"],
            {
                "id": r["MMSI"],
                "source": "ais",
                "name": name,
                "type": kind,
                "length_m": length,
                "callsign": "" if private else r["CallSign"].strip(),
                "fleet": LISTED.get(r["MMSI"]),
                "priority": r["MMSI"] in LISTED,
                "track": [],
            },
        )
        v["track"].append([t, round(float(r["LON"]), 5), round(float(r["LAT"]), 5)])
    for v in vessels.values():
        v["track"].sort()
    anonymous = [
        vessels[k]
        for k in sorted(vessels)
        if is_private(vessels[k]["type"], vessels[k]["length_m"])
    ]
    for n, v in enumerate(anonymous, 1):
        v["id"] = f"private-{n}"
    return sorted(vessels.values(), key=lambda v: v["id"])


def demo_vessel(start: int, ring: list[list[float]]) -> Vessel:
    """Crosses the Gooseberry Point to Sandy Point line into Lummi Bay at 13:30 UTC on day one,
    backs out, and crosses in again at 14:30; k counts steps east along that line."""
    t0 = start + 13 * 3600
    steps_east = [*range(9), *range(7, 1, -1), *range(3, 9)]
    track: list[list[float]] = [
        [t0 + i * STEP, round(-122.745 + k * 0.0075, 5), round(48.775 - k * 0.0005, 5)]
        for i, k in enumerate(steps_east)
    ]
    assert not inside(track[0][1], track[0][2], ring) and inside(track[-1][1], track[-1][2], ring)
    return {
        "id": "demo",
        "source": "demo",
        "name": "Demo vessel (synthetic)",
        "type": "Fishing",
        "length_m": 21,
        "callsign": "",
        "fleet": None,
        "priority": False,
        "track": track,
    }


def stamp(t: int) -> str:
    return datetime.fromtimestamp(t, UTC).strftime("%Y-%m-%dT%H:%M:%SZ")


def build() -> dict:
    rows, kml = fetch()
    ring = ring_from_kml(kml)
    vessels = tracks(rows)
    start = min(int(v["track"][0][0]) for v in vessels)
    end = max(int(v["track"][-1][0]) for v in vessels)
    return {
        "sources": SOURCES,
        "window": {"start": stamp(start), "end": stamp(end)},
        "boundary": {"source": "boundary", "ring": ring},
        "vessels": [demo_vessel(start, ring), *vessels],
    }


if __name__ == "__main__":
    data = build()
    problems = problems_in(data)
    if problems:
        raise SystemExit("\n".join(["refusing to write an invalid data.json:", *problems]))
    # Compact: 4 MB, against about 40 MB with one number per line.
    OUT.write_text(json.dumps(data, separators=(",", ":")) + "\n", encoding="utf-8")
    print(f"wrote {len(data['vessels'])} vessels to {OUT}")
