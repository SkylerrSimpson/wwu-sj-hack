"""Every report we accept, from any source, in one SQLite file: written once, read many times."""

import json
import logging
import sqlite3
import threading
import time
from collections import Counter, deque
from collections.abc import Collection, Iterable, Sequence
from dataclasses import dataclass, replace
from datetime import UTC, datetime
from math import floor
from pathlib import Path
from typing import Any, Literal, cast

from streamer.config import Box
from streamer.fleet import (
    Position,
    Report,
    Static,
    VesselRecord,
    below,
    is_identified,
    iso,
    public_record,
    type_word,
    vessel_id,
)

log = logging.getLogger(__name__)

# Longer than this feed's normal silences, so a quiet spell doesn't read as an outage.
COVERAGE_GAP_S = 300.0
# How far past a segment's end still counts as covered: writes arrive in batches.
COVERED_SLACK_S = 60.0
BATCH = 5000
# How long a stopping recorder keeps trying, for instance while an import holds the write lock.
DRAIN_S = 40.0
# About 1.1 km north-south and 0.7 km east-west here: fine enough to pick out a channel or a dock.
CELLS_PER_DEGREE = 100

SCHEMA = """
CREATE TABLE IF NOT EXISTS reports (
    mmsi INTEGER NOT NULL,
    heard_at REAL NOT NULL,
    source TEXT NOT NULL,
    received_at REAL NOT NULL,
    vessel_class TEXT,
    lat REAL NOT NULL,
    lon REAL NOT NULL,
    sog_kn REAL,
    cog_deg REAL,
    heading_deg INTEGER,
    nav_status INTEGER,
    high_accuracy INTEGER,
    transmit_second INTEGER,
    flags TEXT NOT NULL,
    PRIMARY KEY (mmsi, heard_at, source)
) WITHOUT ROWID;
CREATE INDEX IF NOT EXISTS reports_by_time ON reports (heard_at);
CREATE TABLE IF NOT EXISTS identities (
    mmsi INTEGER NOT NULL,
    heard_at REAL NOT NULL,
    source TEXT NOT NULL,
    name TEXT,
    callsign TEXT,
    type_code INTEGER,
    length_m INTEGER,
    imo INTEGER,
    width_m INTEGER,
    draft_m REAL,
    destination TEXT,
    cargo INTEGER,
    PRIMARY KEY (mmsi, heard_at)
) WITHOUT ROWID;
CREATE TABLE IF NOT EXISTS raw_messages (
    received_at REAL NOT NULL,
    source TEXT NOT NULL,
    payload TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS raw_by_time ON raw_messages (received_at);
CREATE TABLE IF NOT EXISTS hourly (
    hour INTEGER NOT NULL,
    source TEXT NOT NULL,
    mmsi INTEGER NOT NULL,
    reports INTEGER NOT NULL,
    PRIMARY KEY (hour, source, mmsi)
) WITHOUT ROWID;
CREATE TABLE IF NOT EXISTS daily_cells (
    day INTEGER NOT NULL,
    source TEXT NOT NULL,
    lat_cell INTEGER NOT NULL,
    lon_cell INTEGER NOT NULL,
    mmsi INTEGER NOT NULL,
    reports INTEGER NOT NULL,
    PRIMARY KEY (day, source, lat_cell, lon_cell, mmsi)
) WITHOUT ROWID;
CREATE TABLE IF NOT EXISTS coverage (
    source TEXT NOT NULL,
    started_at REAL NOT NULL,
    ended_at REAL NOT NULL,
    PRIMARY KEY (source, started_at)
) WITHOUT ROWID;
"""

# The inner query needs only the time index, which holds mmsi and source too, so a frame's cost
# follows its window and not the size of the archive. MAX() makes SQLite return that row's source.
LATEST_SQL = """
SELECT r.*
FROM (
    SELECT mmsi, MAX(heard_at) AS heard_at, source
    FROM reports INDEXED BY reports_by_time
    WHERE heard_at BETWEEN ? AND ?
    GROUP BY mmsi
) latest
CROSS JOIN reports r
    ON r.mmsi = latest.mmsi AND r.heard_at = latest.heard_at AND r.source = latest.source
ORDER BY r.heard_at DESC
"""
IDENTITY_COLUMNS = (
    "mmsi, heard_at, name, callsign, type_code, length_m, imo, width_m, draft_m, destination, cargo"
)
LATEST_IDENTITIES_SQL = f"""
SELECT {IDENTITY_COLUMNS}, MAX(heard_at) AS latest FROM identities GROUP BY mmsi
"""
# Below this, a density cell could point at one private boat's home dock.
MIN_PRIVATE_IN_CELL = 3


@dataclass(frozen=True, slots=True)
class Entry:
    report: Report
    received_at: float
    flags: tuple[str, ...]
    source: str


@dataclass(frozen=True, slots=True)
class Raw:
    """A provider's message exactly as it came, whatever this code made of it."""

    payload: str
    received_at: float
    source: str


def merged(current: Static | None, report: Static) -> Static:
    """The newer report wins each field it has; an older one only fills what's missing."""
    if current is None:
        return report
    a, b = (report, current) if report.heard_at >= current.heard_at else (current, report)
    return Static(
        report.mmsi,
        max(a.heard_at, b.heard_at),
        a.name or b.name,
        a.callsign or b.callsign,
        a.type_code or b.type_code,
        a.length_m or b.length_m,
        a.imo or b.imo,
        a.width_m or b.width_m,
        a.draft_m or b.draft_m,
        a.destination or b.destination,
        a.cargo or b.cargo,
    )


def same_identity(a: Static, b: Static) -> bool:
    return replace(a, heard_at=0) == replace(b, heard_at=0)


class Archive:
    """The one writer. Use it from one thread at a time."""

    def __init__(self, path: str | Path) -> None:
        Path(path).parent.mkdir(parents=True, exist_ok=True)
        self._db = sqlite3.connect(path, timeout=30, check_same_thread=False, isolation_level=None)
        # WAL lets history read while the recorder writes. NORMAL can lose the last commits in a
        # power cut but can't corrupt the file, and it's what keeps writes cheap.
        self._db.execute("PRAGMA journal_mode=WAL")
        self._db.execute("PRAGMA synchronous=NORMAL")
        self._db.execute("PRAGMA cache_size=-64000")
        self._db.executescript(SCHEMA)
        self._identities = {
            row[0]: Static(*row[:-1]) for row in self._db.execute(LATEST_IDENTITIES_SQL)
        }

    def close(self) -> None:
        self._db.close()

    def write(self, entries: Iterable[Entry | Raw], cover: bool = True) -> int:
        """Stores them in one transaction and returns how many positions were new.

        With cover, the time they arrived counts as covered. An import passes False and declares
        what it covered with cover(), since its rows all arrive today.
        """
        stored = 0
        hours: Counter[tuple[int, str, int]] = Counter()
        cells: Counter[tuple[int, str, int, int, int]] = Counter()
        spans: dict[str, tuple[float, float]] = {}
        # Applied after the commit, so a failed write leaves memory matching the file.
        changed: dict[int, Static] = {}
        self._db.execute("BEGIN IMMEDIATE")
        try:
            for entry in entries:
                if cover:
                    low, high = spans.get(entry.source, (entry.received_at, entry.received_at))
                    spans[entry.source] = (
                        min(low, entry.received_at),
                        max(high, entry.received_at),
                    )
                if isinstance(entry, Raw):
                    self._db.execute(
                        "INSERT INTO raw_messages VALUES (?, ?, ?)",
                        (entry.received_at, entry.source, entry.payload),
                    )
                    continue
                report = entry.report
                if isinstance(report, Static):
                    self._note_identity(report, entry.source, changed)
                    continue
                if report.name:
                    named = Static(report.mmsi, report.heard_at, report.name, None, None, None)
                    self._note_identity(named, entry.source, changed)
                if self._insert_position(report, entry):
                    stored += 1
                    hours[(int(report.heard_at // 3600), entry.source, report.mmsi)] += 1
                    cells[
                        (
                            int(report.heard_at // 86_400),
                            entry.source,
                            floor(report.lat * CELLS_PER_DEGREE),
                            floor(report.lon * CELLS_PER_DEGREE),
                            report.mmsi,
                        )
                    ] += 1
            self._db.executemany(
                "INSERT INTO hourly VALUES (?, ?, ?, ?) ON CONFLICT DO UPDATE "
                "SET reports = reports + excluded.reports",
                [(*key, count) for key, count in hours.items()],
            )
            self._db.executemany(
                "INSERT INTO daily_cells VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT DO UPDATE "
                "SET reports = reports + excluded.reports",
                [(*key, count) for key, count in cells.items()],
            )
            for source, (low, high) in spans.items():
                self._merge_coverage(source, low, high)
            self._db.execute("COMMIT")
        except BaseException:
            self._db.execute("ROLLBACK")
            raise
        self._identities.update(changed)
        return stored

    def cover(self, source: str, started_at: float, ended_at: float) -> None:
        self._db.execute("BEGIN IMMEDIATE")
        try:
            self._merge_coverage(source, started_at, ended_at)
            self._db.execute("COMMIT")
        except BaseException:
            self._db.execute("ROLLBACK")
            raise

    def _insert_position(self, report: Position, entry: Entry) -> bool:
        cursor = self._db.execute(
            "INSERT INTO reports VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) "
            "ON CONFLICT DO NOTHING",
            (
                report.mmsi,
                report.heard_at,
                entry.source,
                entry.received_at,
                report.vessel_class,
                report.lat,
                report.lon,
                report.sog_kn,
                report.cog_deg,
                report.heading_deg,
                report.nav_status,
                report.high_accuracy,
                report.transmit_second,
                ",".join(entry.flags),
            ),
        )
        return cursor.rowcount == 1

    def _note_identity(self, report: Static, source: str, changed: dict[int, Static]) -> None:
        current = changed.get(report.mmsi) or self._identities.get(report.mmsi)
        if current is not None and same_identity(current, merged(current, report)):
            return
        # The cache only saves reads for repeats. Another writer, such as an import, may have
        # changed this vessel, so a write starts from what the file holds now.
        row = self._db.execute(
            f"SELECT {IDENTITY_COLUMNS} FROM identities "
            "WHERE mmsi = ? ORDER BY heard_at DESC LIMIT 1",
            (report.mmsi,),
        ).fetchone()
        current = Static(*row) if row else None
        identity = merged(current, report)
        if current is not None and same_identity(current, identity):
            changed[report.mmsi] = current
            return
        self._db.execute(
            "INSERT OR REPLACE INTO identities VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (
                identity.mmsi,
                identity.heard_at,
                source,
                identity.name,
                identity.callsign,
                identity.type_code,
                identity.length_m,
                identity.imo,
                identity.width_m,
                identity.draft_m,
                identity.destination,
                identity.cargo,
            ),
        )
        changed[report.mmsi] = identity

    def _merge_coverage(self, source: str, started_at: float, ended_at: float) -> None:
        touching = self._db.execute(
            "SELECT started_at, ended_at FROM coverage "
            "WHERE source = ? AND started_at <= ? AND ended_at >= ?",
            (source, ended_at + COVERAGE_GAP_S, started_at - COVERAGE_GAP_S),
        ).fetchall()
        for start, _end in touching:
            self._db.execute(
                "DELETE FROM coverage WHERE source = ? AND started_at = ?", (source, start)
            )
        self._db.execute(
            "INSERT INTO coverage VALUES (?, ?, ?)",
            (
                source,
                min([started_at, *(row[0] for row in touching)]),
                max([ended_at, *(row[1] for row in touching)]),
            ),
        )


class Recorder:
    """Takes reports from the event loop without blocking it and writes them from a thread."""

    def __init__(
        self, path: str | Path, flush_every: float = 1.0, max_pending: int = 200_000
    ) -> None:
        self.archive = Archive(path)
        self._flush_every = flush_every
        self._max_pending = max_pending
        self._pending: deque[Entry | Raw] = deque()
        self._stopping = threading.Event()
        self._thread = threading.Thread(target=self._run, name="recorder", daemon=True)
        self._written = 0
        self._dropped = 0
        self._rejected = 0
        self._last_error: str | None = None
        self._last_write: float | None = None

    def add(self, report: Report, received_at: float, flags: Sequence[str], source: str) -> None:
        if len(self._pending) >= self._max_pending:
            self._dropped += 1
            return
        self._pending.append(Entry(report, received_at, tuple(flags), source))

    def add_raw(self, payload: str | bytes, received_at: float, source: str) -> None:
        if len(self._pending) >= self._max_pending:
            self._dropped += 1
            return
        text = payload if isinstance(payload, str) else payload.decode("utf-8", "replace")
        self._pending.append(Raw(text, received_at, source))

    def flush(self) -> None:
        batch: list[Entry | Raw] = []
        while self._pending and len(batch) < BATCH:
            batch.append(self._pending.popleft())
        if not batch:
            return
        try:
            self._written += self.archive.write(batch)
        except (sqlite3.IntegrityError, sqlite3.ProgrammingError, OverflowError) as error:
            # Retrying can't fix a bad row, and it mustn't block every report after it.
            self._last_error = str(error)
            if len(batch) == 1:
                self._rejected += 1
                log.exception("the archive rejected a report")
            else:
                for entry in batch:
                    self._write_one(entry)
        except sqlite3.Error as error:
            # A full or failing disk can recover, so keep them and try again.
            self._pending.extendleft(reversed(batch))
            if self._last_error != str(error):
                log.exception("the archive can't write; reports are held in memory")
            self._last_error = str(error)
        else:
            self._last_error = None
            self._last_write = time.time()

    def _write_one(self, entry: Entry | Raw) -> None:
        try:
            self._written += self.archive.write([entry])
        except (sqlite3.IntegrityError, sqlite3.ProgrammingError, OverflowError):
            self._rejected += 1
            log.exception("the archive rejected a report")
        except sqlite3.Error:
            self._pending.append(entry)

    def summary(self) -> dict[str, Any]:
        return {
            "alive": self._thread.is_alive(),
            "pending": len(self._pending),
            "written": self._written,
            "dropped": self._dropped,
            "rejected": self._rejected,
            "last_error": self._last_error,
            "last_write_age_s": (
                None if self._last_write is None else round(time.time() - self._last_write, 1)
            ),
        }

    def start(self) -> None:
        self._thread.start()

    def stop(self) -> None:
        self._stopping.set()
        if self._thread.is_alive():
            self._thread.join(timeout=DRAIN_S + 35)
        if not self._thread.is_alive():
            self.close()

    def close(self) -> None:
        self.archive.close()

    def _run(self) -> None:
        while not self._stopping.wait(self._flush_every):
            try:
                self.flush()
            except Exception as error:
                # Live keeps running on what this thread does, so it has to outlive a bug here.
                self._last_error = str(error)
                log.exception("the recorder failed and will carry on")
        deadline = time.monotonic() + DRAIN_S
        while self._pending and time.monotonic() < deadline:
            before = len(self._pending)
            self.flush()
            if len(self._pending) == before:
                time.sleep(0.5)
        if self._pending:
            log.error("stopping with %d reports unwritten", len(self._pending))


def gaps(
    segments: Iterable[tuple[float, float]], start: float, end: float
) -> list[tuple[float, float]]:
    """The stretches of start..end that no segment covers."""
    found = []
    cursor = start
    for low, high in sorted(segments):
        if low > cursor:
            found.append((cursor, min(low, end)))
        cursor = max(cursor, high)
        if cursor >= end:
            return found
    return [*found, (cursor, end)]


def parse_cursor(text: str) -> tuple[float, int, str]:
    """Raises ValueError for anything reports() didn't write."""
    heard_at, mmsi, source = text.split("~", 2)
    return float(heard_at), int(mmsi), source


def flags_of(row: sqlite3.Row) -> list[str]:
    return row["flags"].split(",") if row["flags"] else []


def position_of(row: sqlite3.Row) -> Position:
    # The file keeps values as sent. These limits decode "not available" for public records:
    # 102.3 knots, 360 degrees, heading 511, status 15, and seconds 60 to 63.
    accuracy = row["high_accuracy"]
    heading, status, second = row["heading_deg"], row["nav_status"], row["transmit_second"]
    return Position(
        mmsi=row["mmsi"],
        vessel_class=cast(Literal["A", "B"] | None, row["vessel_class"]),
        lat=row["lat"],
        lon=row["lon"],
        sog_kn=below(row["sog_kn"], 102.2),
        cog_deg=below(row["cog_deg"], 360.0),
        heading_deg=heading if heading is not None and heading < 360 else None,
        nav_status=None if status == 15 else status,
        high_accuracy=None if accuracy is None else bool(accuracy),
        transmit_second=second if second is not None and second < 60 else None,
        heard_at=row["heard_at"],
        name=None,
    )


class Reader:
    """Read-only queries. Safe from any thread: each call opens its own connection."""

    def __init__(self, path: str | Path, id_salt: bytes, timeout_s: float = 5.0) -> None:
        self._uri = f"{Path(path).resolve().as_uri()}?mode=ro"
        self._salt = id_salt
        self._timeout_s = timeout_s

    def connect(self) -> sqlite3.Connection:
        db = sqlite3.connect(self._uri, uri=True, timeout=5)
        db.row_factory = sqlite3.Row
        deadline = time.monotonic() + self._timeout_s
        # An unexpectedly heavy query fails on its own rather than tying up a thread.
        db.set_progress_handler(lambda: time.monotonic() > deadline, 1000)
        return db

    def _all(self, sql: str, *args: Any) -> list[sqlite3.Row]:
        db = self.connect()
        try:
            return db.execute(sql, args).fetchall()
        finally:
            db.close()

    def _identities(self, db: sqlite3.Connection) -> dict[int, Static]:
        return {row[0]: Static(*row[:-1]) for row in db.execute(LATEST_IDENTITIES_SQL)}

    def frame(self, at: float, window_s: float) -> list[VesselRecord]:
        """Each vessel's latest position in the window ending at `at`, newest first."""
        db = self.connect()
        try:
            identities = self._identities(db)
            rows = db.execute(LATEST_SQL, (at - window_s, at)).fetchall()
        finally:
            db.close()
        records = [self._record(row, identities.get(row["mmsi"])) for row in rows]
        # Kept in the file and in /v1/reports, but it means nothing to a vessel's latest place.
        for record in records:
            record["flags"] = [flag for flag in record["flags"] if flag != "duplicate"]
        return records

    def latest(self, since: float) -> list[tuple[Report, float]]:
        """What a restart replays into the fleet, identity before position."""
        db = self.connect()
        try:
            identities = self._identities(db)
            rows = db.execute(LATEST_SQL, (since, time.time())).fetchall()
        finally:
            db.close()
        out: list[tuple[Report, float]] = []
        for row in reversed(rows):
            identity = identities.get(row["mmsi"])
            if identity is not None:
                out.append((identity, row["received_at"]))
            out.append((position_of(row), row["received_at"]))
        return out

    def covered(self, at: float) -> bool:
        return bool(
            self._all(
                "SELECT 1 FROM coverage WHERE started_at <= ? AND ended_at >= ? LIMIT 1",
                at,
                at - COVERED_SLACK_S,
            )
        )

    def track(self, mmsi: int, start: float, end: float, max_points: int) -> dict[str, Any] | None:
        """None for a private or unidentified vessel, whose movements stay unlinkable."""
        identities = self._all(
            "SELECT name, type_code FROM identities WHERE mmsi = ? ORDER BY heard_at DESC LIMIT 1",
            mmsi,
        )
        if not identities or not is_identified(identities[0]["type_code"]):
            return None
        bucket_s = max((end - start) / max_points, 1.0)
        rows = self._all(
            "SELECT MAX(heard_at) AS heard_at, source, lat, lon, sog_kn, cog_deg, heading_deg, "
            "flags FROM reports WHERE mmsi = ? AND heard_at BETWEEN ? AND ? "
            "GROUP BY CAST(heard_at / ? AS INTEGER) ORDER BY heard_at",
            mmsi,
            start,
            end,
            bucket_s,
        )
        return {
            "id": vessel_id(self._salt, str(mmsi)),
            "mmsi": mmsi,
            "name": identities[0]["name"],
            "type": type_word(identities[0]["type_code"]),
            "bucket_s": bucket_s,
            "points": [
                {
                    "heard_at": iso(row["heard_at"]),
                    "lat": row["lat"],
                    "lon": row["lon"],
                    "sog_kn": below(row["sog_kn"], 102.2),
                    "cog_deg": below(row["cog_deg"], 360.0),
                    "heading_deg": (
                        row["heading_deg"]
                        if row["heading_deg"] is not None and row["heading_deg"] < 360
                        else None
                    ),
                    "flags": flags_of(row),
                    "source": row["source"],
                }
                for row in rows
            ],
        }

    def activity(self, start: float, end: float, bin_s: int) -> list[dict[str, Any]]:
        rows = self._all(
            "SELECT hour * 3600 / ? * ? AS at, source, COUNT(DISTINCT mmsi) AS vessels, "
            "SUM(reports) AS reports FROM hourly WHERE hour BETWEEN ? AND ? "
            "GROUP BY at, source ORDER BY at, source",
            bin_s,
            bin_s,
            int(start // 3600),
            int(end // 3600),
        )
        return [
            {
                "at": iso(row["at"]),
                "source": row["source"],
                "vessels": row["vessels"],
                "reports": row["reports"],
            }
            for row in rows
        ]

    def reports(
        self,
        start: float,
        end: float,
        limit: int,
        box: Box | None = None,
        types: Collection[str] | None = None,
        mmsi: int | None = None,
        after: str | None = None,
    ) -> dict[str, Any] | None:
        """Every report in time order. None when mmsi names a private or unidentified vessel.

        `next` is set when the limit cut the page short: pass it back as `after` for the rest.
        """
        if mmsi is not None and not self._identified(mmsi):
            return None
        db = self.connect()
        try:
            identities = self._identities(db)
            where = ["heard_at BETWEEN ? AND ?"]
            args: list[Any] = [start, end]
            index = "INDEXED BY reports_by_time"
            vessels: list[int] | None = None if mmsi is None else [mmsi]
            # Reading by vessel skips every other vessel's rows. "Unknown" also means vessels with
            # no identity at all, which no list can name, so that one has to read them all.
            if vessels is None and types is not None and "Unknown" not in types:
                vessels = [
                    known
                    for known, identity in identities.items()
                    if type_word(identity.type_code) in types
                ]
            if vessels is not None:
                index = ""
                where.append("mmsi IN (SELECT value FROM json_each(?))")
                args.append(json.dumps(vessels))
            if box is not None:
                where.append("lat BETWEEN ? AND ? AND lon BETWEEN ? AND ?")
                args += [box.south, box.north, box.west, box.east]
            if after is not None:
                # The whole key, because NOAA puts many rows on the same second and a page
                # boundary inside them must neither repeat nor skip one.
                where.append("(heard_at, mmsi, source) > (?, ?, ?)")
                args += list(parse_cursor(after))
            rows = db.execute(
                f"SELECT * FROM reports {index} WHERE {' AND '.join(where)} "
                "ORDER BY heard_at, mmsi, source",
                args,
            )
            records: list[VesselRecord] = []
            truncated = False
            ids: dict[str, str] = {}
            last: sqlite3.Row | None = None
            for row in rows:
                identity_now = identities.get(row["mmsi"])
                kind = type_word(identity_now.type_code if identity_now else None)
                if types is not None and kind not in types:
                    continue
                if len(records) == limit:
                    truncated = True
                    break
                records.append(self._record(row, identity_now, ids))
                last = row
        finally:
            db.close()
        cursor = None
        if truncated and last is not None:
            cursor = f"{last['heard_at']!r}~{last['mmsi']}~{last['source']}"
        return {"reports": records, "truncated": truncated, "next": cursor}

    def catalog(
        self, start: float, end: float, types: Collection[str] | None = None
    ) -> dict[str, Any]:
        """Who was heard: named for an identified vessel, only counted for a private one."""
        rows = self._all(
            "SELECT h.mmsi, SUM(h.reports) AS reports, COUNT(DISTINCT h.hour) AS hours, "
            "MIN(h.hour) AS first_hour, MAX(h.hour) AS last_hour, "
            "i.name, i.callsign, i.type_code, i.length_m FROM hourly h "
            f"LEFT JOIN ({LATEST_IDENTITIES_SQL}) i ON i.mmsi = h.mmsi "
            "WHERE h.hour BETWEEN ? AND ? GROUP BY h.mmsi",
            int(start // 3600),
            int(end // 3600),
        )
        named = []
        hidden: dict[str, Counter[str]] = {}
        for row in rows:
            kind = type_word(row["type_code"])
            if types is not None and kind not in types:
                continue
            if is_identified(row["type_code"]):
                named.append(
                    {
                        "id": vessel_id(self._salt, str(row["mmsi"])),
                        "mmsi": row["mmsi"],
                        "name": row["name"],
                        "callsign": row["callsign"],
                        "type": kind,
                        "length_m": row["length_m"],
                        "hours_heard": row["hours"],
                        "reports": row["reports"],
                        "first_heard": iso(row["first_hour"] * 3600),
                        "last_heard": iso(row["last_hour"] * 3600),
                    }
                )
            else:
                counts = hidden.setdefault(kind, Counter())
                counts["vessels"] += 1
                counts["reports"] += row["reports"]
        named.sort(key=lambda v: (-v["hours_heard"], str(v["name"])))
        return {
            "vessels": named,
            "private": [{"type": kind, **counts} for kind, counts in sorted(hidden.items())],
        }

    def density(
        self, start: float, end: float, types: Collection[str] | None = None
    ) -> list[dict[str, Any]]:
        """Vessels and reports per grid cell, from the rollup so a long range stays fast."""
        rows = self._all(
            "SELECT d.lat_cell, d.lon_cell, i.type_code, COUNT(DISTINCT d.mmsi) AS vessels, "
            "SUM(d.reports) AS reports FROM daily_cells d "
            f"LEFT JOIN ({LATEST_IDENTITIES_SQL}) i ON i.mmsi = d.mmsi "
            "WHERE d.day BETWEEN ? AND ? GROUP BY d.lat_cell, d.lon_cell, i.type_code",
            int(start // 86_400),
            int(end // 86_400),
        )
        shown: dict[tuple[int, int], Counter[str]] = {}
        private: dict[tuple[int, int], Counter[str]] = {}
        for row in rows:
            kind = type_word(row["type_code"])
            if types is not None and kind not in types:
                continue
            group = shown if is_identified(row["type_code"]) else private
            cell = group.setdefault((row["lat_cell"], row["lon_cell"]), Counter())
            cell["vessels"] += row["vessels"]
            cell["reports"] += row["reports"]
        for key, counts in private.items():
            if counts["vessels"] >= MIN_PRIVATE_IN_CELL:
                shown.setdefault(key, Counter()).update(counts)
        return [
            {
                "lat": lat_cell / CELLS_PER_DEGREE,
                "lon": lon_cell / CELLS_PER_DEGREE,
                "vessels": counts["vessels"],
                "reports": counts["reports"],
            }
            for (lat_cell, lon_cell), counts in sorted(shown.items())
        ]

    def _identified(self, mmsi: int) -> bool:
        rows = self._all(
            "SELECT type_code FROM identities WHERE mmsi = ? ORDER BY heard_at DESC LIMIT 1", mmsi
        )
        return bool(rows) and is_identified(rows[0]["type_code"])

    def coverage(self, start: float, end: float) -> dict[str, Any]:
        rows = self._all(
            "SELECT source, started_at, ended_at FROM coverage "
            "WHERE started_at <= ? AND ended_at >= ? ORDER BY started_at",
            end,
            start,
        )
        spans = [(row["started_at"], row["ended_at"]) for row in rows]
        return {
            "segments": [
                {
                    "source": row["source"],
                    "from": iso(row["started_at"]),
                    "to": iso(row["ended_at"]),
                }
                for row in rows
            ],
            "gaps": [{"from": iso(low), "to": iso(high)} for low, high in gaps(spans, start, end)],
        }

    def _record(
        self, row: sqlite3.Row, identity: Static | None, ids: dict[str, str] | None = None
    ) -> VesselRecord:
        identified = identity is not None and is_identified(identity.type_code)
        # A private boat's id changes daily, so frames from different days can't be linked.
        day = datetime.fromtimestamp(row["heard_at"], UTC).date().isoformat()
        key = str(row["mmsi"]) if identified else f"{row['mmsi']}:{day}"
        cache = {} if ids is None else ids
        if key not in cache:
            cache[key] = vessel_id(self._salt, key)
        return public_record(
            cache[key],
            position_of(row),
            identity,
            row["received_at"],
            flags_of(row),
            row["source"],
        )
