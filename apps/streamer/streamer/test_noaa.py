from pathlib import Path

import zstandard

from streamer.archive import Reader
from streamer.config import Box
from streamer.fleet import Position, Static
from streamer.noaa import import_file, parse_row

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
    assert static == Static(368414830, T, "NORTH POINT", "WDQ3225", 90, 25)


def test_blank_and_placeholder_values_become_null() -> None:
    parsed = parse_row(
        row(sog="102.3", cog="360.0", heading="511", status="15", vessel_type="0", length="0")
    )
    assert parsed is not None
    position, static = parsed
    assert (position.sog_kn, position.cog_deg) == (None, None)
    assert (position.heading_deg, position.nav_status) == (None, None)
    assert (static.type_code, static.length_m) == (None, None)
    blank = parse_row(row(sog="", cog="", heading="", status="", vessel_name="", call_sign=""))
    assert blank is not None
    assert blank[0].sog_kn is None
    assert (blank[1].name, blank[1].callsign) == (None, None)


def test_a_row_we_cant_trust_is_rejected() -> None:
    for bad in [
        row(latitude="95"),
        row(longitude="-181"),
        row(latitude=""),
        row(mmsi="abc"),
        row(transceiver=""),
        row(base_date_time="never"),
    ]:
        assert parse_row(bad) is None


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
