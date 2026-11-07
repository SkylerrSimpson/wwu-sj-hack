"""Loads NOAA Marine Cadastre daily files into the archive. Importing a file twice changes nothing.

Run with: STREAMER_DB=... uv run python -m streamer.noaa FILE [FILE ...]
"""

import csv
import logging
import os
import sys
import time
from collections import Counter
from collections.abc import Iterator
from datetime import UTC, datetime
from itertools import batched
from pathlib import Path
from typing import Literal, cast

import zstandard

from streamer.aisstream import below
from streamer.archive import Archive, Entry
from streamer.config import Box, parse_box
from streamer.fleet import Position, Static

log = logging.getLogger("streamer.noaa")

SOURCE = "noaa"
# The area the bulk AIS sample keeps, which holds the streamer's box and its approaches.
DEFAULT_BOX = Box(48.40, -123.20, 49.05, -122.40)
COMMIT_EVERY = 100_000


def number(text: str) -> float | None:
    return float(text) if text else None


def whole(text: str) -> int | None:
    return int(float(text)) if text else None


def parse_row(row: dict[str, str]) -> tuple[Position, Static] | None:
    """None for a row with no usable identity, place, time or transceiver."""
    try:
        mmsi = int(row["mmsi"])
        lat, lon = float(row["latitude"]), float(row["longitude"])
        heard_at = datetime.fromisoformat(row["base_date_time"]).replace(tzinfo=UTC).timestamp()
        sog, cog = number(row["sog"]), number(row["cog"])
        heading, status = whole(row["heading"]), whole(row["status"])
        type_code, length = whole(row["vessel_type"]), whole(row["length"])
    except ValueError:
        return None
    kind = row["transceiver"]
    if not (-90 <= lat <= 90 and -180 <= lon <= 180) or kind not in ("A", "B"):
        return None
    position = Position(
        mmsi=mmsi,
        vessel_class=cast(Literal["A", "B"], kind),
        lat=lat,
        lon=lon,
        sog_kn=None if sog is None else below(sog, 102.2),
        cog_deg=None if cog is None else below(cog, 360.0),
        heading_deg=None if heading is None or heading >= 360 else heading,
        nav_status=None if status is None or status == 15 else status,
        high_accuracy=None,
        transmit_second=None,
        heard_at=heard_at,
        name=None,
    )
    static = Static(
        mmsi,
        heard_at,
        row["vessel_name"] or None,
        row["call_sign"] or None,
        type_code or None,
        length or None,
    )
    return position, static


def lines(path: Path) -> Iterator[str]:
    if path.suffix == ".zst":
        with zstandard.open(path, "rt", encoding="utf-8", newline="") as handle:
            yield from handle
    else:
        with open(path, encoding="utf-8", newline="") as handle:
            yield from handle


def import_file(path: Path, db_path: str | Path, box: Box = DEFAULT_BOX) -> Counter[str]:
    counts: Counter[str] = Counter()
    first, last = float("inf"), float("-inf")
    now = time.time()

    def entries() -> Iterator[Entry]:
        nonlocal first, last
        for row in csv.DictReader(lines(path)):
            parsed = parse_row(row)
            if parsed is None:
                counts["rejected"] += 1
                continue
            position, static = parsed
            if not box.contains(position.lat, position.lon):
                counts["outside"] += 1
                continue
            first, last = min(first, position.heard_at), max(last, position.heard_at)
            yield Entry(static, now, (), SOURCE)
            yield Entry(position, now, (), SOURCE)

    archive = Archive(db_path)
    try:
        for batch in batched(entries(), COMMIT_EVERY):
            counts["stored"] += archive.write(batch, cover=False)
        if first <= last:
            archive.cover(SOURCE, first, last)
    finally:
        archive.close()
    return counts


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    db_path = os.environ.get("STREAMER_DB")
    if not db_path:
        sys.exit("streamer.noaa: set STREAMER_DB to the archive's path")
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    box = parse_box(os.environ["NOAA_BOX"]) if "NOAA_BOX" in os.environ else DEFAULT_BOX
    for name in sys.argv[1:]:
        started = time.monotonic()
        counts = import_file(Path(name), db_path, box)
        log.info("%s: %s in %.1f s", name, dict(counts), time.monotonic() - started)


if __name__ == "__main__":
    main()
