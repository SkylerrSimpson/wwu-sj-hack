import sqlite3
from collections.abc import Iterator
from contextlib import contextmanager
from datetime import date
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread

import zstandard

from streamer.archive import Archive, Reader
from streamer.config import Box
from streamer.fleet import Position, Static
from streamer.noaa import already_imported, days_between, import_file, parse_row

HEADER = (
    "mmsi,base_date_time,longitude,latitude,sog,cog,heading,vessel_name,imo,call_sign,"
    "vessel_type,status,length,width,draft,cargo,transceiver\n"
)
SHIP = "368414830,2025-11-10 00:00:00,-122.50564,48.754,0.5,226.8,7,NORTH POINT,,WDQ3225,90,0,25,10,,90,A\n"
BOAT = (
    "338342000,2025-11-10 00:01:00,-122.74381,48.53306,7.8,356.0,,ESCARGOT,,WDG4849,36,,20,4,,,B\n"
)
FAR = "368000000,2025-11-10 00:02:00,-100.0,30.0,1.0,1.0,1,FAR,,X,70,0,25,10,,,A\n"
T = 1_762_732_800.0  # 2025-11-10 00:00:00 UTC
BOX = Box(48.0, -123.0, 49.0, -122.0)


def row(**overrides: str) -> dict[str, str]:
    values = dict(zip(HEADER.strip().split(","), SHIP.strip().split(","), strict=True))
    return {**values, **overrides}


def test_a_row_becomes_a_position_and_an_identity() -> None:
    parsed = parse_row(row())
    assert parsed is not None
    position, static = parsed
    assert position == Position(
        mmsi=368414830,
        vessel_class="A",
        lat=48.754,
        lon=-122.50564,
        sog_kn=0.5,
        cog_deg=226.8,
        heading_deg=7,
        nav_status=0,
        high_accuracy=None,
        transmit_second=None,
        heard_at=T,
        name=None,
    )
    assert static == Static(368414830, T, "NORTH POINT", "WDQ3225", 90, 25, width_m=10, cargo=90)


def test_values_stay_as_published() -> None:
    parsed = parse_row(row(sog="102.3", cog="360.0", heading="511", status="15"))
    assert parsed is not None
    position, _ = parsed
    assert (position.sog_kn, position.cog_deg) == (102.3, 360.0)
    assert (position.heading_deg, position.nav_status) == (511, 15)


def test_every_published_field_is_kept() -> None:
    parsed = parse_row(row(imo="IMO9876543", draft="8.5", width="20", cargo="70"))
    assert parsed is not None
    _, static = parsed
    assert (static.imo, static.draft_m, static.width_m, static.cargo) == (9876543, 8.5, 20, 70)


def test_a_zero_type_means_unknown_so_the_vessel_stays_private() -> None:
    parsed = parse_row(row(vessel_type="0", length="0"))
    assert parsed is not None
    assert (parsed[1].type_code, parsed[1].length_m) == (None, None)


def test_one_unreadable_field_doesnt_lose_the_row() -> None:
    for fine in [row(heading="inf"), row(sog="junk"), row(transceiver=""), row(status="")]:
        assert parse_row(fine) is not None
    parsed = parse_row(row(sog="junk", transceiver=""))
    assert parsed is not None
    assert (parsed[0].sog_kn, parsed[0].vessel_class) == (None, None)


def test_a_row_nothing_can_place_is_refused() -> None:
    for bad in [
        row(latitude="95"),
        row(longitude="-181"),
        row(latitude=""),
        row(mmsi="abc"),
        row(base_date_time="never"),
        row(mmsi="99999999999999999999"),
        {"mmsi": "222", "base_date_time": "2025-11-10T02:00:00", "latitude": "48.7"},
    ]:
        assert parse_row(bad) is None


def test_public_records_decode_placeholders_that_the_file_keeps(tmp_path: Path) -> None:
    db = tmp_path / "ais.db"
    placeholder = SHIP.replace("0.5,226.8,7,", "102.3,360.0,511,")
    import_file(write_file(tmp_path, placeholder), db, BOX)
    [record] = Reader(db, b"s").frame(T + 60, 600)
    assert (record["sog_kn"], record["cog_deg"], record["heading_deg"]) == (None, None, None)
    stored = sqlite3.connect(db).execute("SELECT sog_kn, heading_deg FROM reports").fetchone()
    assert stored == (102.3, 511)


def write_file(folder: Path, *rows: str) -> Path:
    path = folder / "ais-2025-11-10.csv.zst"
    path.write_bytes(zstandard.compress((HEADER + "".join(rows)).encode()))
    return path


def test_import_keeps_rows_in_the_box_and_records_what_it_covered(tmp_path: Path) -> None:
    source = write_file(tmp_path, SHIP, BOAT, FAR)
    db = tmp_path / "ais.db"
    counts = import_file(source, db, BOX)
    assert (counts["stored"], counts["outside"], counts["rejected"]) == (2, 1, 0)
    reader = Reader(db, b"s")
    records = reader.frame(T + 60, 600)
    assert {r["source"] for r in records} == {"noaa"}
    [ship] = [r for r in records if r["mmsi"]]
    assert ship["name"] == "NORTH POINT"
    [segment] = reader.coverage(T - 10, T + 3600)["segments"]
    assert segment["source"] == "noaa"


def test_importing_a_file_twice_changes_nothing(tmp_path: Path) -> None:
    source = write_file(tmp_path, SHIP, BOAT)
    db = tmp_path / "ais.db"
    assert import_file(source, db, BOX)["stored"] == 2
    assert import_file(source, db, BOX)["stored"] == 0
    [row_count] = Reader(db, b"s").activity(T, T + 3600, 3600)
    assert row_count["reports"] == 2


def test_import_also_reads_plain_csv(tmp_path: Path) -> None:
    source = tmp_path / "ais.csv"
    source.write_text(HEADER + SHIP, encoding="utf-8")
    assert import_file(source, tmp_path / "ais.db", BOX)["stored"] == 1


def test_a_private_boat_stays_hidden_after_import(tmp_path: Path) -> None:
    db = tmp_path / "ais.db"
    import_file(write_file(tmp_path, BOAT), db, BOX)
    [record] = Reader(db, b"s").frame(T + 60, 600)
    assert record["mmsi"] is None
    assert "ESCARGOT" not in str(record)


class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, format: str, *args: object) -> None:
        pass


@contextmanager
def serving(folder: Path) -> Iterator[str]:
    server = ThreadingHTTPServer(("127.0.0.1", 0), partial(QuietHandler, directory=str(folder)))
    Thread(target=server.serve_forever, daemon=True).start()
    try:
        yield f"http://127.0.0.1:{server.server_address[1]}"
    finally:
        server.shutdown()
        server.server_close()


def test_a_day_streams_from_a_url_without_keeping_the_national_file(tmp_path: Path) -> None:
    write_file(tmp_path, SHIP, FAR)
    db = tmp_path / "ais.db"
    with serving(tmp_path) as base:
        counts = import_file(f"{base}/ais-2025-11-10.csv.zst", db, BOX)
    assert (counts["stored"], counts["outside"]) == (1, 1)


def test_a_bad_line_in_a_national_file_is_counted_not_fatal(tmp_path: Path) -> None:
    write_file(tmp_path, "garbage\n", SHIP)
    counts = import_file(tmp_path / "ais-2025-11-10.csv.zst", tmp_path / "ais.db", BOX)
    assert (counts["stored"], counts["rejected"]) == (1, 1)


def test_days_run_newest_first_so_stopping_early_leaves_no_hole_at_the_seam() -> None:
    assert days_between(date(2026, 6, 30), date(2026, 6, 28)) == [
        date(2026, 6, 30),
        date(2026, 6, 29),
        date(2026, 6, 28),
    ]


def test_a_day_counts_as_imported_only_once_its_coverage_spans_the_day(tmp_path: Path) -> None:
    db = tmp_path / "ais.db"
    archive = Archive(db)
    day = date(2025, 11, 10)
    assert not already_imported(db, day)
    archive.cover("noaa", T, T + 3600 * 5)
    assert not already_imported(db, day)
    archive.cover("noaa", T, T + 86_399)
    archive.close()
    assert already_imported(db, day)
    assert not already_imported(db, date(2025, 11, 11))


def test_a_short_row_in_a_file_keeps_what_it_has(tmp_path: Path) -> None:
    short = "222,2025-11-10 02:00:00,-122.6,48.7\n"
    source = write_file(tmp_path, short, SHIP)
    counts = import_file(source, tmp_path / "ais.db", BOX)
    assert (counts["stored"], counts["rejected"]) == (2, 0)


def test_a_stray_row_cant_claim_the_years_before_it(tmp_path: Path) -> None:
    stray = SHIP.replace("2025-11-10 00:00:00", "2019-01-01 00:00:00")
    db = tmp_path / "ais.db"
    import_file(write_file(tmp_path, stray, SHIP), db, BOX)
    assert not already_imported(db, date(2024, 3, 1))
    assert len(Reader(db, b"s").coverage(T - 1e9, T + 3600)["segments"]) == 2


def test_a_hole_in_a_file_stays_a_gap(tmp_path: Path) -> None:
    late = SHIP.replace("2025-11-10 00:00:00", "2025-11-10 23:00:00")
    db = tmp_path / "ais.db"
    import_file(write_file(tmp_path, SHIP, late), db, BOX)
    reader = Reader(db, b"s")
    assert reader.covered(T + 1800)
    assert not reader.covered(T + 12 * 3600)
    assert not already_imported(db, date(2025, 11, 10))
