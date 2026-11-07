"""Synthetic radar and camera data for Lummi waters. Nothing here is real.

Usage: python generate.py <repo data.json> <out.json>

Output reuses data.json's shapes so the web app can merge it as is:
- `vessels`: radar tracks, same fields as data.json vessels, so ShipMap and newEntries work unchanged
- `sensors`: where each radar and camera sits and what it covers
- `detections`: camera sightings, each tied to a radar track
"""

import json
import math
import random
import sys
from datetime import UTC, datetime
from itertools import pairwise
from pathlib import Path

STEP = 300  # seconds between radar fixes, matches data.json's 5-minute tracks
M_PER_DEG_LAT = 111_320

SOURCE = {
    "id": "synthetic-sensors",
    "name": "Synthetic radar and camera data, invented for the demo",
    "url": "https://github.com/SkylerrSimpson/wwu-sj-hack",
    "retrieved": "2026-11-07",
}

SENSORS = [
    {
        "id": "radar-sandy-pt",
        "kind": "radar",
        "name": "Shore radar, Sandy Point (synthetic)",
        "lon": -122.712,
        "lat": 48.796,
        "range_m": 12_000,
    },
    {
        "id": "cam-gooseberry",
        "kind": "camera",
        "name": "Camera, Gooseberry Point (synthetic)",
        "lon": -122.676,
        "lat": 48.738,
        "range_m": 5_000,
        "bearing_deg": 330,
        "fov_deg": 100,
    },
]

# Each contact: (id, name, length_m, start time, [(lon, lat, minutes to reach it, minutes to stay)])
T0 = int(datetime(2024, 12, 6, 5, 0, tzinfo=UTC).timestamp())  # 9 PM Pacific, Dec 5
CONTACTS = [
    (
        "radar-1",
        "Radar contact 1 (synthetic)",
        12,
        T0,
        [
            (-122.760, 48.776, 0, 0),
            (-122.690, 48.775, 50, 0),
            (-122.672, 48.774, 15, 90),  # stops inside Lummi Bay, as a boat setting a net would
            (-122.760, 48.780, 60, 0),
        ],
    ),
    (
        "radar-2",
        "Radar contact 2 (synthetic)",
        40,
        T0 + 3600,
        [
            (-122.790, 48.700, 0, 0),
            (-122.790, 48.860, 90, 0),  # passes outside, never enters
        ],
    ),
    (
        "radar-3",
        "Radar contact 3 (synthetic)",
        8,
        T0 + 7200,
        [
            (-122.780, 48.760, 0, 0),
            (-122.735, 48.768, 30, 10),  # approaches the boundary, turns back
            (-122.790, 48.750, 30, 0),
        ],
    ),
]


def is_inside(lon: float, lat: float, ring: list[list[float]]) -> bool:
    inside = False
    for (ax, ay), (bx, by) in pairwise(ring):
        if (ay > lat) != (by > lat) and lon < ax + (lat - ay) * (bx - ax) / (by - ay):
            inside = not inside
    return inside


def offset_m(lon: float, lat: float, olon: float, olat: float) -> tuple[float, float]:
    """East and north metres from (olon, olat); flat-earth is fine at these few-km ranges."""
    return (
        (lon - olon) * M_PER_DEG_LAT * math.cos(math.radians(olat)),
        (lat - olat) * M_PER_DEG_LAT,
    )


def sees(sensor: dict, lon: float, lat: float) -> bool:
    east, north = offset_m(lon, lat, sensor["lon"], sensor["lat"])
    if math.hypot(east, north) > sensor["range_m"]:
        return False
    if sensor["kind"] != "camera":
        return True
    bearing = math.degrees(math.atan2(east, north)) % 360
    return abs((bearing - sensor["bearing_deg"] + 180) % 360 - 180) <= sensor["fov_deg"] / 2


def true_path(start: int, legs: list[tuple]) -> list[tuple[int, float, float]]:
    """Positions every STEP seconds along straight legs, holding still for each stay."""
    t, (lon, lat, _, stay) = start, legs[0]
    path = [(t + s, lon, lat) for s in range(0, stay * 60 + 1, STEP)]
    t = path[-1][0]
    for nlon, nlat, mins, stay in legs[1:]:
        n = max(1, mins * 60 // STEP)
        path += [
            (t + i * STEP, lon + (nlon - lon) * i / n, lat + (nlat - lat) * i / n)
            for i in range(1, n + 1)
        ]
        t, lon, lat = path[-1]
        path += [(t + s, lon, lat) for s in range(STEP, stay * 60 + 1, STEP)]
        t = path[-1][0]
    return path


def main(data_path: str, out_path: str) -> None:
    ring = json.loads(Path(data_path).read_text(encoding="utf-8"))["boundary"]["ring"]
    rng = random.Random(7)  # fixed seed: the same file every run
    radar, camera = SENSORS
    vessels: list[dict] = []
    detections: list[dict] = []

    for vid, name, length, start, legs in CONTACTS:
        track = []
        for t, lon, lat in true_path(start, legs):
            if not sees(radar, lon, lat):
                continue
            # About 25 m of radar position noise.
            nlat = lat + rng.gauss(0, 25) / M_PER_DEG_LAT
            nlon = lon + rng.gauss(0, 25) / (M_PER_DEG_LAT * math.cos(math.radians(lat)))
            track.append([t, round(nlon, 5), round(nlat, 5)])
            if sees(camera, lon, lat) and t % 600 == 0:  # one frame kept per 10 minutes
                detections.append(
                    {
                        "sensor": camera["id"],
                        "vesselId": vid,
                        "t": t,
                        "lon": round(nlon, 5),
                        "lat": round(nlat, 5),
                        "label": "small vessel" if length < 15 else "vessel",
                        "confidence": round(rng.uniform(0.55, 0.95), 2),
                    }
                )
        vessels.append(
            {
                "id": vid,
                "source": SOURCE["id"],
                "name": name,
                "type": "Unknown (no AIS)",
                "length_m": length,
                "priority": False,
                "track": track,
            }
        )

    # Self-checks: the scenario does what the demo needs.
    def entries(v: dict) -> int:
        flags = [is_inside(lon, lat, ring) for _, lon, lat in v["track"]]
        return sum(b and not a for a, b in pairwise(flags))

    by_id = {v["id"]: v for v in vessels}
    assert entries(by_id["radar-1"]) == 1, "radar-1 should enter Lummi waters exactly once"
    assert not any(
        is_inside(lon, lat, ring)
        for vid in ("radar-2", "radar-3")
        for _, lon, lat in by_id[vid]["track"]
    )
    assert all(v["track"] for v in vessels), "every contact should be in radar range"
    assert any(d["vesselId"] == "radar-1" for d in detections), "the camera should see radar-1"

    out = {"sources": [SOURCE], "sensors": SENSORS, "vessels": vessels, "detections": detections}
    Path(out_path).write_text(json.dumps(out, indent=2) + "\n", encoding="utf-8")
    print(f"wrote {len(vessels)} radar tracks, {len(detections)} camera detections to {out_path}")


if __name__ == "__main__":
    main(*sys.argv[1:3])
