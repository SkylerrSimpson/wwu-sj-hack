"""Loads NOAA Marine Cadastre daily files into the archive. Importing a file twice changes nothing.

Run with: STREAMER_DB=... uv run python -m streamer.noaa FILE [FILE ...]
      or: STREAMER_DB=... uv run python -m streamer.noaa --days 2026-06-30 2026-04-01 [--workers 6]
Days download newest first, keep only the box, and skip days already imported. Interrupting loses
nothing: run the same line again.
"""

import argparse
import csv
import logging
import os
import sqlite3
import sys
import time
from collections import Counter
from collections.abc import Iterator
from concurrent.futures import ProcessPoolExecutor, as_completed
from datetime import UTC, date, datetime, timedelta
from itertools import batched
from pathlib import Path
from typing import Literal, cast
from urllib.error import URLError
from urllib.request import urlopen

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
DAY_URL = "https://noaaocm.blob.core.windows.net/ais/csv2/csv{year}/ais-{day}.csv.zst"
TIMEOUT_S = 120
ATTEMPTS = 3


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


def lines(source: Path | str) -> Iterator[str]:
    if isinstance(source, str):
        with (
            urlopen(source, timeout=TIMEOUT_S) as response,
            zstandard.open(response, "rt", encoding="utf-8", newline="") as handle,
        ):
            yield from handle
    elif source.suffix == ".zst":
        with zstandard.open(source, "rt", encoding="utf-8", newline="") as handle:
            yield from handle
    else:
        with open(source, encoding="utf-8", newline="") as handle:
            yield from handle


def import_file(source: Path | str, db_path: str | Path, box: Box = DEFAULT_BOX) -> Counter[str]:
    """Reads a local file or a URL. A national file has millions of rows, so the box comes first."""
    counts: Counter[str] = Counter()
    first, last = float("inf"), float("-inf")
    now = time.time()

    def entries() -> Iterator[Entry]:
        nonlocal first, last
        reader = csv.reader(lines(source))
        header = next(reader)
        lat_at, lon_at = header.index("latitude"), header.index("longitude")
        for fields in reader:
            try:
                if not box.contains(float(fields[lat_at]), float(fields[lon_at])):
                    counts["outside"] += 1
                    continue
            except (ValueError, IndexError):
                counts["rejected"] += 1
                continue
            parsed = parse_row(dict(zip(header, fields, strict=False)))
            if parsed is None:
                counts["rejected"] += 1
                continue
            position, static = parsed
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


def day_url(day: date) -> str:
    return DAY_URL.format(year=day.year, day=day.isoformat())


def days_between(newest: date, oldest: date) -> list[date]:
    return [newest - timedelta(days=n) for n in range((newest - oldest).days + 1)]


def already_imported(db_path: str | Path, day: date) -> bool:
    """True when coverage already runs from this day's first hour through its last."""
    start = datetime(day.year, day.month, day.day, tzinfo=UTC).timestamp()
    with sqlite3.connect(db_path, timeout=30) as db:
        found = db.execute(
            "SELECT 1 FROM coverage WHERE source = ? AND started_at <= ? AND ended_at >= ? LIMIT 1",
            (SOURCE, start + 3600, start + 23 * 3600),
        ).fetchone()
    db.close()
    return found is not None


def import_day(day: date, db_path: str, box: Box) -> tuple[date, Counter[str] | None, str]:
    """Runs in its own process. A day NOAA hasn't published or a failed one is reported, not fatal."""
    error = ""
    for attempt in range(ATTEMPTS):
        try:
            return day, import_file(day_url(day), db_path, box), ""
        except (URLError, OSError, zstandard.ZstdError, sqlite3.OperationalError) as caught:
            error = str(caught)
            if "404" in error:
                break
            time.sleep(5 * (attempt + 1))
    return day, None, error


def import_days(newest: date, oldest: date, db_path: str, box: Box, workers: int) -> int:
    Archive(db_path).close()
    wanted = [d for d in days_between(newest, oldest) if not already_imported(db_path, d)]
    log.info("%d days to import", len(wanted))
    failed = 0
    with ProcessPoolExecutor(max_workers=workers) as pool:
        futures = [pool.submit(import_day, d, db_path, box) for d in wanted]
        for future in as_completed(futures):
            day, counts, error = future.result()
            if counts is None:
                failed += 1
                log.warning("%s failed: %s", day, error)
            else:
                log.info("%s: %s", day, dict(counts))
    return failed


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    db_path = os.environ.get("STREAMER_DB")
    if not db_path:
        sys.exit("streamer.noaa: set STREAMER_DB to the archive's path")
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("files", nargs="*", type=Path)
    parser.add_argument("--days", nargs=2, metavar=("NEWEST", "OLDEST"), type=date.fromisoformat)
    parser.add_argument("--workers", type=int, default=4)
    args = parser.parse_args()
    if not args.files and not args.days:
        parser.error("give files or --days")
    box = parse_box(os.environ["NOAA_BOX"]) if "NOAA_BOX" in os.environ else DEFAULT_BOX
    for path in args.files:
        started = time.monotonic()
        counts = import_file(path, db_path, box)
        log.info("%s: %s in %.1f s", path, dict(counts), time.monotonic() - started)
    if args.days:
        failed = import_days(args.days[0], args.days[1], db_path, box, args.workers)
        if failed:
            sys.exit(f"streamer.noaa: {failed} days failed; run the same line again")


if __name__ == "__main__":
    main()
