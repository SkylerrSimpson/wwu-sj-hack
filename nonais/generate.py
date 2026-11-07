"""Synthetic radar, LIDAR and hydrophone data for Lummi waters. The sensors are not real.

Usage: python generate.py <repo data.json> <out dir> <web file>
  e.g. python generate.py ../apps/web/public/data.json . ../apps/web/public/sensors.json

The sensors see two kinds of boat: the real AIS vessels in data.json (positions from their
recorded tracks), and invented boats with no AIS. A radar track that matches no AIS vessel is
the unidentified boat the proof of concept is about.

Writes two files to <out dir>, for plotting and scoring:
- `detections.csv`: one row per sensor hit. Each row has the sensor's estimate (position,
  size, speed, boat or not, confidence) and the ground truth behind it; `truth_ais_id` is the
  data.json vessel id when the object broadcasts AIS, else empty. Hydrophone rows have a
  bearing, SNR and frequency instead of a position, and `ais_match` when an AIS vessel lies on
  that bearing. Radar rows also carry `heard`, `fused_boat` and `fused_confidence`: radar
  combined with the hydrophones.
- `sensors.json`: `sources`, `sensors` (where each sits, what it covers, how noisy it is),
  `vessels` (radar tracks of the boats, ids `radar-n`, same fields as data.json vessels) and
  `truth` (each radar track's object and AIS vessel id, for scoring a match only).

And <web file>, what the app reads: `sources`, the sensors' coverage, the radar tracks and the
detections, with no ground truth. Hydrophones are left out of it until the app's types
(lib/sensors.ts) have a bearing-only detection.
"""

import csv
import json
import math
import random
import statistics
import sys
from collections import defaultdict
from datetime import UTC, datetime
from itertools import pairwise
from pathlib import Path
from typing import Any

M_PER_DEG_LAT = 111_320
SWEEP = 60  # seconds between radar sweeps
TRACK_STEP = 300  # data.json's tracks are one position per 5 minutes
MAX_GAP = 1800  # an AIS gap longer than this leaves the boat's position unknown, as positionAt does
DEFAULT_SIZE_M = 10  # for AIS vessels with no length
T0 = int(datetime(2024, 12, 6, 5, 0, tzinfo=UTC).timestamp())  # 9 PM Pacific, Dec 5
T_END = T0 + 6 * 3600

COVERAGE_KEYS = ("id", "kind", "name", "lon", "lat", "range_m")
DETECTION_KEYS = ("t", "sensor", "kind", "lon", "lat", "size_m", "boat", "label", "confidence")

SOURCE = {
    "id": "synthetic-sensors",
    "name": "Synthetic radar, LIDAR and hydrophone data, invented for the demo",
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

# Hydrophones hear engines, not hulls: each hit is a bearing, an SNR and a frequency.
HYDROPHONES: list[dict[str, Any]] = [
    {
        "id": "hydro-gooseberry",
        "kind": "hydrophone",
        "name": "Hydrophone, off Gooseberry Point (synthetic)",
        "lon": -122.690,
        "lat": 48.748,
        "every_s": SWEEP,
    },
    {
        "id": "hydro-sandy-pt",
        "kind": "hydrophone",
        "name": "Hydrophone, off Sandy Point (synthetic)",
        "lon": -122.728,
        "lat": 48.783,
        "every_s": SWEEP,
    },
]
DETECT_SNR_DB = 6
SQUALL = (T0 + 5400, T0 + 8100)  # 06:30 to 07:15 UTC, rain raises the noise floor
# Ship-loading pumps at the Cherry Point piers hum like an engine from a fixed bearing.
CHERRY_PT = (-122.755, 48.862)  # rough, placed by eye
PUMPING = (T0 + 3 * 3600, T0 + 5 * 3600)
ENGINE_ON_KN = 0.5  # slower than this, a boat is taken to have its engine off
HEARD_WITHIN_DEG = 8
SAME_BOAT_M = 500  # an AIS vessel this close to a radar contact is taken to be that contact
NEAR_HYDROPHONE_M = 4000

# detections.csv columns; a row leaves blank what its sensor doesn't measure.
COLUMNS = [
    "t", "time_utc", "sensor", "kind",
    "lon", "lat", "size_m", "speed_kn", "course_deg",
    "bearing_deg", "snr_db", "freq_hz", "ais_match",
    "boat", "label", "confidence",
    "heard", "fused_boat", "fused_confidence",
    "truth_id", "truth_kind", "truth_ais_id",
]  # fmt: skip

# Invented ground truth: boats without AIS and things that aren't boats.
# Legs are (lon, lat, minutes to reach it, minutes to stay there).
OBJECTS: list[dict[str, Any]] = [
    {
        "id": "noais-1",
        "kind": "boat",
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
        "id": "noais-2",
        "kind": "boat",
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
    return math.hypot(east, north) <= sensor["range_m"]


def angle_diff(a: float, b: float) -> float:
    return abs((a - b + 180) % 360 - 180)


def range_bearing(sensor: dict, lon: float, lat: float) -> tuple[float, float]:
    east, north = offset_m(lon, lat, sensor["lon"], sensor["lat"])
    return math.hypot(east, north), math.degrees(math.atan2(east, north)) % 360


def ambient_db(t: int) -> float:
    """Background noise: wind rising and falling over the night, plus a rain squall."""
    return 92 + 3 * math.sin((t - T0) / 3600) + (12 if SQUALL[0] <= t < SQUALL[1] else 0)


def source_db(size: float, speed: float) -> float:
    # shortcut: a rule of thumb for engine noise, not measured levels; replace with recordings.
    return 135 + 15 * math.log10(size) + 1.2 * min(speed, 15)


def loss_db(r: float) -> float:
    # Between spherical and cylindrical spreading, as in shallow water, plus absorption.
    return 15 * math.log10(max(r, 1)) + 0.6 * r / 1000


def listen(h: dict, t: int, engines: list[tuple], rng: random.Random) -> list[dict]:
    """What one hydrophone hears at t. engines: (object, lon, lat, speed_kn)."""
    noise = ambient_db(t) + rng.gauss(0, 1)
    sounds = []
    for o, lon, lat, speed in engines:
        r, bearing = range_bearing(h, lon, lat)
        snr = source_db(o["size_m"], speed) - loss_db(r) - noise + rng.gauss(0, 2)
        freq = 2400 / o["size_m"] * rng.uniform(0.8, 1.2)  # bigger engines turn slower
        sounds.append((snr, bearing, freq, o))
    if PUMPING[0] <= t < PUMPING[1]:
        r, bearing = range_bearing(h, *CHERRY_PT)
        pier = {"id": "cherry-pt-pier", "kind": "industrial"}
        sounds.append(
            (165 - loss_db(r) - noise + rng.gauss(0, 2), bearing, rng.uniform(100, 140), pier)
        )
    # Orca calls and clicks: brief, from anywhere, sometimes low enough to pass for an engine.
    if rng.random() < 0.02:
        orca = {"id": "orca", "kind": "orca"}
        sounds.append((rng.uniform(8, 25), rng.uniform(0, 360), rng.uniform(1000, 20000), orca))
    rows = []
    for snr, bearing, freq, truth in sounds:
        if snr < DETECT_SNR_DB:
            continue
        # A sound 10 dB louder from within 10 degrees masks this one.
        if any(s - snr >= 10 and angle_diff(b, bearing) < 10 for s, b, _, _ in sounds):
            continue
        boat = freq < 3000
        rows.append(
            {
                "t": t,
                "time_utc": datetime.fromtimestamp(t, UTC).strftime("%Y-%m-%dT%H:%M:%SZ"),
                "sensor": h["id"],
                "kind": h["kind"],
                "bearing_deg": round((bearing + rng.gauss(0, 1.5 + 30 / snr)) % 360),
                "snr_db": round(snr, 1),
                "freq_hz": round(freq),
                "boat": boat,
                "label": "engine" if boat else "biologic",
                "confidence": round(min(0.99, 0.5 + snr / 40), 2),
                "truth_id": truth["id"],
                "truth_kind": truth["kind"],
                "truth_ais_id": truth["id"] if "path" in truth else "",
            }
        )
    return rows


def fuse(rows: list[dict], ais_paths: dict[str, dict]) -> None:
    """Radar plus hydrophones: a radar contact on the bearing of an engine is very likely a boat.

    An engine on the bearing of a known AIS vessel (`ais_match`) vouches only for a radar
    contact near that vessel, so busy traffic doesn't vouch for every log on the same line.
    Silence counts only a little against a contact near a hydrophone, since a boat may sit
    with its engine off, and not at all against one on a known AIS vessel (moored boats).
    """
    by_id = {h["id"]: h for h in HYDROPHONES}
    engines: dict[int, list[tuple[dict, float, tuple | None]]] = defaultdict(list)
    for r in rows:
        if r["kind"] != "hydrophone" or not r["boat"]:
            continue
        h, match = by_id[r["sensor"]], None
        for vid, path in ais_paths.items():
            at = path.get(r["t"])
            if at and angle_diff(range_bearing(h, *at)[1], r["bearing_deg"]) < HEARD_WITHIN_DEG:
                r["ais_match"], match = vid, at
                break
        engines[r["t"]].append((h, r["bearing_deg"], match))
    for r in rows:
        if r["kind"] != "radar":
            continue
        heard = any(
            angle_diff(range_bearing(h, r["lon"], r["lat"])[1], b) < HEARD_WITHIN_DEG
            and (at is None or math.hypot(*offset_m(r["lon"], r["lat"], *at)) < SAME_BOAT_M)
            for h, b, at in engines[r["t"]]
        )
        near = any(range_bearing(h, r["lon"], r["lat"])[0] < NEAR_HYDROPHONE_M for h in HYDROPHONES)
        on_ais = any(
            (at := path.get(r["t"]))
            and math.hypot(*offset_m(r["lon"], r["lat"], *at)) < SAME_BOAT_M
            for path in ais_paths.values()
        )
        near = near and not on_ais
        p = min(0.99, max(0.01, r["confidence"] if r["boat"] else 1 - r["confidence"]))
        score = math.log(p / (1 - p)) + (2.5 if heard else -0.8 if near else 0)
        pf = 1 / (1 + math.exp(-score))
        r.update(heard=heard, fused_boat=pf >= 0.5, fused_confidence=round(max(pf, 1 - pf), 2))


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


def ais_path(track: list[list[float]]) -> dict[int, tuple[float, float]]:
    """Position every SWEEP seconds in the window, between AIS fixes at most MAX_GAP apart."""
    path = {}
    for (ta, lona, lata), (tb, lonb, latb) in pairwise(track):
        if tb - ta > MAX_GAP or tb < T0 or ta > T_END:
            continue
        for t in range(math.ceil(ta / SWEEP) * SWEEP, int(tb) + 1, SWEEP):
            f = (t - ta) / (tb - ta) if tb > ta else 0
            path[t] = (lona + (lonb - lona) * f, lata + (latb - lata) * f)
    return {t: p for t, p in path.items() if T0 <= t <= T_END}


def ais_objects(vessels: list[dict]) -> list[dict[str, Any]]:
    """The real AIS vessels as ground truth, with their recorded tracks as the true path."""
    objects = []
    for v in vessels:
        if v["source"] != "ais":  # the demo vessel is synthetic AIS; only real tracks here
            continue
        path = ais_path(v["track"])
        if path:
            size = v["length_m"] or DEFAULT_SIZE_M
            objects.append({"id": v["id"], "kind": "boat", "size_m": size, "path": path})
    return objects


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
        "truth_ais_id": truth["id"] if "path" in truth else "",
    }


def generate(objects: list[dict], rng: random.Random) -> list[dict]:
    rows = []
    paths = {o["id"]: o.get("path") or true_path(o["start"], o["legs"]) for o in objects}
    for t in range(T0, T_END + 1, SWEEP):
        engines = []
        for o in objects:
            pos = paths[o["id"]].get(t)
            if o["kind"] == "boat" and pos is not None:
                speed, _ = speed_course(paths[o["id"]].get(t - SWEEP, pos), pos, SWEEP)
                if speed >= ENGINE_ON_KN:
                    engines.append((o, *pos, speed))
        for h in HYDROPHONES:
            rows += listen(h, t, engines, rng)
    for sensor in SENSORS:
        for t in range(T0, T_END + 1, sensor["every_s"]):
            for o in objects:
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
    rows.sort(key=lambda r: (r["t"], r["sensor"]))
    fuse(rows, {o["id"]: o["path"] for o in objects if "path" in o})
    return rows


def tracks(rows: list[dict], objects: list[dict]) -> tuple[list[dict], dict[str, dict]]:
    """The boats' radar fixes, thinned to data.json's 5-minute track shape.

    Radar can't identify a boat, so each track is `radar-n`, numbered by first sighting, and
    the object behind it goes in a separate truth map.
    """
    # shortcut: fixes are grouped by the true object; a real system needs a tracker here.
    fixes: dict[str, list[list[float]]] = {}
    sizes: dict[str, list[float]] = {}
    for r in rows:
        if r["truth_kind"] == "boat" and r["kind"] == "radar" and r["t"] % TRACK_STEP == 0:
            fixes.setdefault(r["truth_id"], []).append([r["t"], r["lon"], r["lat"]])
            sizes.setdefault(r["truth_id"], []).append(r["size_m"])
    ais = {o["id"] for o in objects if "path" in o}
    vessels, truth = [], {}
    for n, (oid, track) in enumerate(sorted(fixes.items(), key=lambda kv: (kv[1][0][0], kv[0])), 1):
        vid = f"radar-{n}"
        vessels.append(
            {
                "id": vid,
                "source": SOURCE["id"],
                "name": f"Radar contact {n} (synthetic)",
                "type": "Unknown, radar only",
                "length_m": round(statistics.median(sizes[oid])),  # radar's estimate
                "callsign": "",
                "fleet": None,
                "priority": False,
                "track": track,
            }
        )
        truth[vid] = {"truth_id": oid, "ais_id": oid if oid in ais else None}
    return vessels, truth


def main(data_path: str, out_dir: str, web_path: str) -> None:
    data = json.loads(Path(data_path).read_text(encoding="utf-8"))
    ring = data["boundary"]["ring"]
    objects = ais_objects(data["vessels"]) + OBJECTS
    rows = generate(objects, random.Random(7))  # fixed seed: the same files every run
    vessels, truth = tracks(rows, objects)

    # Self-checks: the scenario does what the demo needs.
    def entries(v: dict) -> int:
        flags = [is_inside(lon, lat, ring) for _, lon, lat in v["track"]]
        return sum(b and not a for a, b in pairwise(flags))

    by_truth = {truth[v["id"]]["truth_id"]: v for v in vessels}
    assert entries(by_truth["noais-1"]) == 1, "noais-1 should enter Lummi waters exactly once"
    assert not any(is_inside(lon, lat, ring) for _, lon, lat in by_truth["noais-2"]["track"])
    assert [v["id"] for v in vessels if entries(v) and not truth[v["id"]]["ais_id"]] == [
        by_truth["noais-1"]["id"]
    ], "the only boat without AIS that enters should be noais-1"
    assert sum(t["ais_id"] is not None for t in truth.values()) >= 3, "radar should see AIS boats"
    assert all(v["track"] for v in vessels), "every boat should be in radar range"

    def accuracy(rs: list[dict], key: str = "boat") -> float:
        return sum(r[key] == (r["truth_kind"] == "boat") for r in rs) / len(rs)

    for s in SENSORS + HYDROPHONES:
        mine = [r for r in rows if r["sensor"] == s["id"]]
        acc = accuracy(mine)
        assert mine and 0.7 < acc, f"{s['id']}: expected mostly right"
        # Hydrophones may be flawless in a quiet stretch; the others should make some mistakes.
        assert s["kind"] == "hydrophone" or acc < 1, f"{s['id']}: expected some mistakes"
    assert {r["truth_id"] for r in rows if r["kind"] == "lidar"} >= {"noais-1"}
    hydro = [r for r in rows if r["kind"] == "hydrophone"]
    assert {"noais-1", "orca", "cherry-pt-pier"} <= {r["truth_id"] for r in hydro}
    assert any(r["truth_ais_id"] for r in hydro), "AIS vessels should be heard"
    stopped = (T0 + 66 * 60, T0 + 155 * 60)  # noais-1 sits with its engine off
    assert not any(r["truth_id"] == "noais-1" and stopped[0] < r["t"] < stopped[1] for r in hydro)
    near = [
        r
        for r in rows
        if r["kind"] == "radar"
        and any(range_bearing(h, r["lon"], r["lat"])[0] < NEAR_HYDROPHONE_M for h in HYDROPHONES)
    ]
    radar_acc, fused_acc = accuracy(near), accuracy(near, "fused_boat")
    assert fused_acc > radar_acc, f"fusion should help near hydrophones: {radar_acc} -> {fused_acc}"
    print(f"radar near hydrophones: {radar_acc:.1%} right alone, {fused_acc:.1%} with them")

    out = Path(out_dir)
    with open(out / "detections.csv", "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=COLUMNS, restval="")
        writer.writeheader()
        writer.writerows(rows)
    sensors = SENSORS + HYDROPHONES
    out_data = {"sources": [SOURCE], "sensors": sensors, "vessels": vessels, "truth": truth}
    (out / "sensors.json").write_text(json.dumps(out_data, indent=2) + "\n", encoding="utf-8")

    # The app's copy carries what a real system would know: no ground truth, no sensor noise.
    web_data = {
        "sources": [SOURCE],
        "sensors": [{k: s[k] for k in s if k in COVERAGE_KEYS} for s in SENSORS],
        "vessels": vessels,
        "detections": [
            {k: r[k] for k in DETECTION_KEYS} for r in rows if r["kind"] != "hydrophone"
        ],
    }
    Path(web_path).write_text(json.dumps(web_data, separators=(",", ":")), encoding="utf-8")
    n_ais = sum(t["ais_id"] is not None for t in truth.values())
    print(
        f"wrote {len(rows)} detections and {len(vessels)} radar tracks "
        f"({n_ais} with AIS, {len(vessels) - n_ais} without) to {out} and {web_path}"
    )


if __name__ == "__main__":
    main(*sys.argv[1:4])
