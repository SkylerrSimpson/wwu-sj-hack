"""Synthetic radar, thermal camera and LIDAR data for Lummi waters. Nothing here is real.

Usage: python generate.py <repo data.json> <out dir>

Writes two files to <out dir>:
- `detections.csv`: one row per sensor hit, flat for plotting. Each row has the sensor's
  estimate (position, size, speed, boat or not, confidence) and the ground truth behind it.
- `sensors.json`: `sources`, `sensors` (where each sits and what it covers), `vessels` (radar
  tracks of the boats, same fields as data.json vessels, so ShipMap and newEntries take them
  unchanged) and `detections` (the CSV rows again).
"""

import csv
import json
import math
import random
import sys
from datetime import UTC, datetime
from itertools import pairwise
from pathlib import Path
from typing import Any

M_PER_DEG_LAT = 111_320
SWEEP = 60  # seconds between radar sweeps
TRACK_STEP = 300  # data.json's tracks are one position per 5 minutes
T0 = int(datetime(2024, 12, 6, 5, 0, tzinfo=UTC).timestamp())  # 9 PM Pacific, Dec 5
T_END = T0 + 6 * 3600

SOURCE = {
    "id": "synthetic-sensors",
    "name": "Synthetic radar, thermal camera and LIDAR data, invented for the demo",
    "url": "https://github.com/SkylerrSimpson/wwu-sj-hack",
    "retrieved": "2026-11-07",
}

# Positions are rough, placed by eye; the scenario is synthetic.
# every_s: how often the sensor reports; pos_m: position noise; size_err: relative size noise;
# judge_noise: how unsure its boat-or-not judgement is.
SENSORS: list[dict[str, Any]] = [
    {
        "id": "radar-sandy-pt",
        "kind": "radar",
        "name": "Shore radar, Sandy Point (synthetic)",
        "lon": -122.712,
        "lat": 48.796,
        "range_m": 12_000,
        "every_s": SWEEP,
        "pos_m": 25,
        "size_err": 0.4,
        "judge_noise": 1.0,
    },
    {
        "id": "cam-gooseberry",
        "kind": "camera",
        "name": "Thermal camera, Gooseberry Point (synthetic)",
        "lon": -122.676,
        "lat": 48.738,
        "range_m": 5_000,
        "bearing_deg": 330,
        "fov_deg": 100,
        "every_s": 120,
        "pos_m": 15,
        "size_err": 0.2,
        "judge_noise": 0.6,
    },
    {
        "id": "lidar-lummi-bay",
        "kind": "lidar",
        "name": "LIDAR, Lummi Bay mouth (synthetic)",
        "lon": -122.684,
        "lat": 48.790,
        "range_m": 2_500,
        "every_s": SWEEP,
        "pos_m": 1,
        "size_err": 0.05,
        "judge_noise": 0.4,
    },
]

# Ground truth. Legs are (lon, lat, minutes to reach it, minutes to stay there).
OBJECTS: list[dict[str, Any]] = [
    {
        "id": "radar-1",
        "kind": "boat",
        "name": "Radar contact 1 (synthetic)",
        "size_m": 12,
        "start": T0,
        "legs": [
            (-122.760, 48.776, 0, 0),
            (-122.690, 48.775, 50, 0),
            (-122.672, 48.774, 15, 90),  # stops inside Lummi Bay, as a boat setting a net would
            (-122.760, 48.780, 60, 0),
        ],
    },
    {
        "id": "radar-2",
        "kind": "boat",
        "name": "Radar contact 2 (synthetic)",
        "size_m": 40,
        "start": T0 + 3600,
        "legs": [(-122.790, 48.700, 0, 0), (-122.790, 48.860, 90, 0)],  # passes outside
    },
    {
        "id": "radar-3",
        "kind": "boat",
        "name": "Radar contact 3 (synthetic)",
        "size_m": 8,
        "start": T0 + 7200,
        "legs": [
            (-122.780, 48.760, 0, 0),
            (-122.735, 48.768, 30, 10),  # approaches the boundary, turns back
            (-122.790, 48.750, 30, 0),
        ],
    },
    {
        "id": "birds-1",
        "kind": "bird",
        "size_m": 1,
        "start": T0 + 1800,
        "legs": [
            (-122.700, 48.780, 0, 0),
            (-122.660, 48.800, 8, 0),
            (-122.690, 48.770, 8, 0),
            (-122.650, 48.760, 8, 0),
        ],
    },
    {
        "id": "log-1",
        "kind": "debris",
        "size_m": 4,
        "start": T0,
        "legs": [(-122.700, 48.785, 0, 0), (-122.680, 48.770, 360, 0)],  # drifts about 0.3 kn
    },
    {
        "id": "buoy-1",
        "kind": "buoy",
        "size_m": 2,
        "start": T0,
        "legs": [(-122.740, 48.790, 0, 360)],
    },
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
    if "fov_deg" not in sensor:
        return True
    bearing = math.degrees(math.atan2(east, north)) % 360
    return abs((bearing - sensor["bearing_deg"] + 180) % 360 - 180) <= sensor["fov_deg"] / 2


def true_path(start: int, legs: list[tuple]) -> dict[int, tuple[float, float]]:
    """Position every SWEEP seconds along straight legs, holding still for each stay."""
    t, (lon, lat, _, stay) = start, legs[0]
    path = {t + s: (lon, lat) for s in range(0, stay * 60 + 1, SWEEP)}
    t = max(path)
    for nlon, nlat, mins, stay in legs[1:]:
        n = max(1, mins * 60 // SWEEP)
        for i in range(1, n + 1):
            path[t + i * SWEEP] = (lon + (nlon - lon) * i / n, lat + (nlat - lat) * i / n)
        t, (lon, lat) = t + n * SWEEP, (nlon, nlat)
        for s in range(SWEEP, stay * 60 + 1, SWEEP):
            path[t + s] = (lon, lat)
        t = max(path)
    return path


def speed_course(a: tuple[float, float], b: tuple[float, float], dt: int) -> tuple[float, float]:
    east, north = offset_m(b[0], b[1], a[0], a[1])
    return math.hypot(east, north) / dt * 1.944, math.degrees(math.atan2(east, north)) % 360


def judge(size: float, speed: float, noise: float, rng: random.Random) -> tuple[bool, float]:
    """A stand-in classifier: big or steadily moving reads as a boat. Returns (boat, confidence)."""
    # shortcut: a hand-set logistic score, not a trained model; replace with real labelled data.
    # Speed is capped so fast small things (birds) don't read as boats.
    score = 0.7 * (size - 5) + 0.3 * min(speed, 6) - 0.3 + rng.gauss(0, noise)
    p = 1 / (1 + math.exp(-score))
    return p >= 0.5, round(max(p, 1 - p), 2)


def label(boat: bool, size: float) -> str:
    if boat:
        return "small vessel" if size < 15 else "vessel"
    return "bird" if size < 1.5 else "debris"


def row(
    sensor: dict,
    t: int,
    truth: dict,
    lon: float,
    lat: float,
    size: float,
    speed: float,
    course: float,
    rng: random.Random,
) -> dict:
    boat, conf = judge(size, speed, sensor["judge_noise"], rng)
    return {
        "t": t,
        "time_utc": datetime.fromtimestamp(t, UTC).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "sensor": sensor["id"],
        "kind": sensor["kind"],
        "lon": round(lon, 5),
        "lat": round(lat, 5),
        "size_m": round(size, 1),
        "speed_kn": round(speed, 1),
        "course_deg": round(course),
        "boat": boat,
        "label": label(boat, size),
        "confidence": conf,
        "truth_id": truth["id"],
        "truth_kind": truth["kind"],
    }


def generate(rng: random.Random) -> list[dict]:
    rows = []
    paths = {o["id"]: true_path(o["start"], o["legs"]) for o in OBJECTS}
    for sensor in SENSORS:
        for t in range(T0, T_END + 1, sensor["every_s"]):
            for o in OBJECTS:
                pos = paths[o["id"]].get(t)
                if pos is None or not sees(sensor, *pos):
                    continue
                prev = paths[o["id"]].get(t - SWEEP, pos)
                speed, course = speed_course(prev, pos, SWEEP)
                d = sensor["pos_m"]
                lat = pos[1] + rng.gauss(0, d) / M_PER_DEG_LAT
                lon = pos[0] + rng.gauss(0, d) / (M_PER_DEG_LAT * math.cos(math.radians(pos[1])))
                size = o["size_m"] * math.exp(rng.gauss(0, sensor["size_err"]))
                speed = max(0.0, speed + rng.gauss(0, 0.3))
                rows.append(row(sensor, t, o, lon, lat, size, speed, course, rng))
            # Sea clutter: brief false echoes near the radar, about one sweep in three.
            if sensor["kind"] == "radar" and rng.random() < 0.35:
                r, b = rng.uniform(300, 2500), rng.uniform(150, 330)
                lon = sensor["lon"] + r * math.sin(math.radians(b)) / (
                    M_PER_DEG_LAT * math.cos(math.radians(sensor["lat"]))
                )
                lat = sensor["lat"] + r * math.cos(math.radians(b)) / M_PER_DEG_LAT
                truth = {"id": "clutter", "kind": "clutter"}
                size, speed = rng.uniform(0.5, 3), rng.uniform(0, 4)
                rows.append(row(sensor, t, truth, lon, lat, size, speed, rng.uniform(0, 360), rng))
    return sorted(rows, key=lambda r: (r["t"], r["sensor"]))


def tracks(rows: list[dict]) -> list[dict]:
    """The boats' radar fixes, thinned to data.json's 5-minute track shape."""
    vessels = []
    for o in OBJECTS:
        if o["kind"] != "boat":
            continue
        track = [
            [r["t"], r["lon"], r["lat"]]
            for r in rows
            if r["truth_id"] == o["id"] and r["kind"] == "radar" and r["t"] % TRACK_STEP == 0
        ]
        vessels.append(
            {
                "id": o["id"],
                "source": SOURCE["id"],
                "name": o["name"],
                "type": "Unknown (no AIS)",
                "length_m": o["size_m"],
                "priority": False,
                "track": track,
            }
        )
    return vessels


def main(data_path: str, out_dir: str) -> None:
    ring = json.loads(Path(data_path).read_text(encoding="utf-8"))["boundary"]["ring"]
    rows = generate(random.Random(7))  # fixed seed: the same files every run
    vessels = tracks(rows)

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
    assert all(v["track"] for v in vessels), "every boat should be in radar range"
    for s in SENSORS:
        mine = [r for r in rows if r["sensor"] == s["id"]]
        right = sum(r["boat"] == (r["truth_kind"] == "boat") for r in mine)
        assert mine and 0.7 < right / len(mine) < 1, f"{s['id']}: expected mostly right, some wrong"
    assert {r["truth_id"] for r in rows if r["kind"] == "lidar"} >= {"radar-1"}

    out = Path(out_dir)
    with open(out / "detections.csv", "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=list(rows[0]))
        writer.writeheader()
        writer.writerows(rows)
    data = {"sources": [SOURCE], "sensors": SENSORS, "vessels": vessels, "detections": rows}
    (out / "sensors.json").write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")
    print(f"wrote {len(rows)} detections and {len(vessels)} radar tracks to {out}")


if __name__ == "__main__":
    main(*sys.argv[1:3])
