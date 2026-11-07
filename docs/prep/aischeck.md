# AIS check: what real data shows inside Lummi waters

Run by hand on 2026-11-07 around 02:20, on NOAA daily files (CC0) with the stdlib only. Each day takes about 90 s to stream. The zips were deleted afterwards and no extract was kept. Vessel names below are cut to 3 letters on purpose.

## Results

| UTC day        | Rows in padded box | Vessels inside polygon | Who                                                                                                                                                                                                                            |
| -------------- | ------------------ | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Sun 2024-09-15 | 5,447              | **3**                  | Passenger, 32 m, Class B, 84 fixes all day ("WHA…", almost certainly the Lummi Island ferry _Whatcom Chief_) · Law enforcement (type 55), 10 m, Class B, 18 fixes 20:09–21:22Z, up to 26 kn · Pleasure, 8 m, Class B, 15 fixes |
| Wed 2024-09-18 | 3,424              | **1**                  | The ferry only                                                                                                                                                                                                                 |

Vessels in the padded box on the Wednesday, by AIS type:

- 17 pleasure
- 7 tug (52)
- 5 sailing
- 4 passenger
- 2 towing (31)
- 2 tanker (80)
- 1 anti-pollution (54)
- 1 passenger (68)
- **0 fishing (30)**

Every vessel inside the polygon was Class B, so none sent a navigational status.

## What it means

1. **Real AIS has almost nothing to flag inside the exclusive waters.** The demo needs the synthetic vessel (decision 8 in `LUMMI-PREP.md`).
2. **The ferry is the main edge noise.** Put it on the list as "approved by agreement".
3. **Status-based anchoring never fires here**, because everything is Class B. The speed rule does the work.
4. **Tugs and towing vessels are next door.** There were 9 MMSIs in the padded box, and they must carry AIS. That matches the Nation's 2008 finding that tugs and barges caused most gear loss. Question for the rep: should the approaches (Hale Passage, Bellingham Bay near the reservation) be a second, _shared-waters_ zone? It's the same visit function with a second polygon. Build it only if they say so.
5. **For the pitch:** "We checked real data before building: AIS sees one to three vessels a day in these waters, and none were fishing boats. That's why the tool is honest about coverage, and why the Nation's own sightings or satellite radar come next."

## Script (stdlib, used for the counts above)

```python
"""Count AIS traffic inside the Lummi Reservation polygon for one daily NOAA file. Stdlib only."""

import csv
import io
import json
import sys
import zipfile
from collections import defaultdict

zip_path, geojson_path = sys.argv[1], sys.argv[2]
ring = json.load(open(geojson_path))["features"][0]["geometry"]["coordinates"][0]
W, E, S, N = -122.75, -122.53, 48.67, 48.84


def inside(lon: float, lat: float) -> bool:
    hit = False
    for (x1, y1), (x2, y2) in zip(ring, ring[1:]):
        if (y1 > lat) != (y2 > lat) and lon < x1 + (lat - y1) * (x2 - x1) / (y2 - y1):
            hit = not hit
    return hit


assert not inside(-122.4787, 48.7519), "downtown Bellingham must be outside"

box_rows = 0
per = defaultdict(lambda: {"n": 0, "status": set(), "sog_max": 0.0, "first": None, "last": None})
meta: dict[str, tuple[str, str, str, str]] = {}
with zipfile.ZipFile(zip_path) as z:
    name = z.namelist()[0]
    with z.open(name) as f:
        for r in csv.DictReader(io.TextIOWrapper(f, encoding="utf-8", newline="")):
            lon, lat = float(r["LON"]), float(r["LAT"])
            if not (W <= lon <= E and S <= lat <= N):
                continue
            box_rows += 1
            if not inside(lon, lat):
                continue
            m = r["MMSI"]
            p = per[m]
            p["n"] += 1
            p["status"].add(r["Status"])
            p["sog_max"] = max(p["sog_max"], float(r["SOG"] or 0))
            t = r["BaseDateTime"]
            p["first"] = min(p["first"] or t, t)
            p["last"] = max(p["last"] or t, t)
            meta[m] = (r["VesselType"], r["Length"], r["TransceiverClass"], r["VesselName"][:3])

print(f"file={name} rows_in_box={box_rows} mmsi_inside={len(per)}")
for m, p in sorted(per.items(), key=lambda kv: -kv[1]["n"]):
    vt, ln, cls, nm = meta[m]
    moving = "moving" if p["sog_max"] >= 1 else "stationary"
    print(f"type={vt or '?':>3} len={ln or '?':>4} class={cls or '?'} fixes={p['n']:>4} "
          f"{p['first'][11:16]}-{p['last'][11:16]}Z status={sorted(p['status'])} sog_max={p['sog_max']:.1f} {moving} name~{nm}..")

box_types: dict[str, set[str]] = defaultdict(set)
with zipfile.ZipFile(zip_path) as z:
    with z.open(z.namelist()[0]) as f:
        for r in csv.DictReader(io.TextIOWrapper(f, encoding="utf-8", newline="")):
            lon, lat = float(r["LON"]), float(r["LAT"])
            if W <= lon <= E and S <= lat <= N:
                box_types[r["VesselType"] or "?"].add(r["MMSI"])
print("padded box, MMSIs by VesselType:", {t: len(m) for t, m in sorted(box_types.items(), key=lambda kv: -len(kv[1]))})
```

## Visits per vessel (added 09:35, same Sunday file, 10-minute merge)

| Vessel                | Visits | Each                              | Inside total | Slow fixes (<0.5 kn) |
| --------------------- | ------ | --------------------------------- | ------------ | -------------------- |
| Ferry, 32 m passenger | 26     | 0 to 9 min (six are a single fix) | 99 min       | 52, at the dock      |
| Pleasure boat, 8 m    | 3      | 8, 12, 18 min                     | 38 min       | 7                    |
| Patrol boat, 10 m     | 2      | 10 and 28 min                     | 38 min       | 0                    |

31 visits by 3 vessels. Hence: approved vessels are summarised one line each; flagged visits are cards. Script: `visitcount.py`, the same as above plus grouping runs by MMSI with a 600 s gap threshold.
