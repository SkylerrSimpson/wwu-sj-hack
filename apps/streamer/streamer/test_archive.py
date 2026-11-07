import sqlite3
from dataclasses import replace
from pathlib import Path
from typing import Any

import pytest

from streamer.archive import Archive, Entry, Reader, Recorder, gaps
from streamer.config import Box
from streamer.fleet import Fleet, Position, Static, iso

T0 = 1_793_990_000.0
SHIP = 368000001
BOAT = 338000002
SALT = b"salt"

BASE = Position(
    mmsi=SHIP,
    vessel_class="A",
    lat=48.72,
    lon=-122.68,
    sog_kn=9.5,
    cog_deg=220.0,
    heading_deg=217,
    nav_status=0,
    high_accuracy=True,
    transmit_second=12,
    heard_at=T0,
    name=None,
)


def position(heard_at: float = T0, **overrides: Any) -> Entry:
    report = replace(BASE, heard_at=heard_at, **overrides)
    return Entry(report, received_at=heard_at + 3, flags=(), source="live")


def identity(
    mmsi: int = SHIP,
    type_code: int | None = 60,
    heard_at: float = T0,
    name: str | None = "TEST SHIP",
    callsign: str | None = "WXY1234",
    length_m: int | None = 35,
    source: str = "live",
) -> Entry:
    report = Static(mmsi, heard_at, name, callsign, type_code, length_m)
    return Entry(report, received_at=heard_at, flags=(), source=source)


@pytest.fixture
def path(tmp_path: Path) -> Path:
    return tmp_path / "nested" / "ais.db"


def store(path: Path, *entries: Entry) -> Reader:
    archive = Archive(path)
    archive.write(entries)
    archive.close()
    return Reader(path, SALT)


def test_writing_the_same_report_twice_stores_and_counts_it_once(path: Path) -> None:
    archive = Archive(path)
    assert archive.write([position()]) == 1
    assert archive.write([position()]) == 0
    archive.close()
    db = sqlite3.connect(path)
    assert db.execute("SELECT COUNT(*) FROM reports").fetchone() == (1,)
    assert db.execute("SELECT SUM(reports) FROM hourly").fetchone() == (1,)
    assert db.execute("SELECT SUM(reports) FROM daily_cells").fetchone() == (1,)
    assert db.execute("SELECT lat_cell, lon_cell FROM daily_cells").fetchone() == (4872, -12268)


def test_two_sources_can_hold_the_same_moment(path: Path) -> None:
    reader = store(path, position(), replace(position(), source="noaa"))
    assert reader.activity(T0 - 3600, T0 + 3600, 3600)[0]["reports"] == 1
    assert {row["source"] for row in reader.activity(T0 - 3600, T0 + 3600, 3600)} == {
        "live",
        "noaa",
    }


def test_a_frame_has_each_vessels_latest_position_at_that_moment(path: Path) -> None:
    reader = store(
        path,
        identity(),
        position(T0, lat=48.70),
        position(T0 + 60, lat=48.71),
        position(T0 + 120, lat=48.72),
    )
    [record] = reader.frame(T0 + 90, 600)
    assert record["lat"] == 48.71
    assert record["heard_at"].endswith("Z")
    assert record["source"] == "live"
    assert record["name"] == "TEST SHIP"
    assert record["mmsi"] == SHIP


def test_a_frame_leaves_out_vessels_not_heard_in_its_window(path: Path) -> None:
    reader = store(path, position(T0))
    assert reader.frame(T0 + 601, 600) == []
    assert len(reader.frame(T0 + 599, 600)) == 1
    assert reader.frame(T0 - 1, 600) == []


def test_a_frame_uses_the_newest_report_across_sources(path: Path) -> None:
    older = replace(position(T0, lat=48.70), source="noaa")
    reader = store(path, older, position(T0 + 30, lat=48.71))
    [record] = reader.frame(T0 + 60, 600)
    assert (record["lat"], record["source"]) == (48.71, "live")


def test_a_frame_returns_flags_as_they_were_recorded(path: Path) -> None:
    entry = replace(position(), flags=("position_jump",))
    [record] = store(path, entry).frame(T0, 60)
    assert record["flags"] == ["position_jump"]


@pytest.mark.parametrize("code", [30, 36, 37, None])
def test_history_hides_private_and_unknown_vessels(path: Path, code: int | None) -> None:
    reader = store(path, identity(BOAT, code, name="MY BOAT"), position(mmsi=BOAT))
    [record] = reader.frame(T0, 60)
    assert record["mmsi"] is None
    assert record["callsign"] is None
    assert "MY BOAT" not in str(record)
    assert str(BOAT) not in str(record)


def test_a_private_boats_id_changes_each_day_so_days_cant_be_linked(path: Path) -> None:
    reader = store(
        path,
        identity(BOAT, 37),
        position(T0, mmsi=BOAT),
        position(T0 + 60, mmsi=BOAT),
        position(T0 + 86_400, mmsi=BOAT),
    )
    [first] = reader.frame(T0, 30)
    [same_day] = reader.frame(T0 + 60, 30)
    [next_day] = reader.frame(T0 + 86_400, 30)
    assert first["id"] == same_day["id"]
    assert first["id"] != next_day["id"]


def test_an_identified_vessel_keeps_its_live_id_in_history(path: Path) -> None:
    [archived] = store(path, identity(), position()).frame(T0, 30)
    fleet = Fleet(id_salt=SALT, source="live")
    fleet.apply(Static(SHIP, T0, "X", None, 60, None), T0)
    live, _ = fleet.apply(BASE, T0)
    assert live is not None
    assert archived["id"] == live["id"]


def test_partial_identity_reports_merge(path: Path) -> None:
    reader = store(
        path,
        identity(type_code=None, callsign=None, length_m=None, name="PART A"),
        identity(type_code=70, name=None, callsign="WAB9", length_m=90, heard_at=T0 + 10),
        position(),
    )
    [record] = reader.frame(T0, 30)
    assert (record["name"], record["callsign"], record["length_m"]) == ("PART A", "WAB9", 90)
    assert record["type"] == "Cargo"


def test_an_older_import_fills_gaps_but_cant_overwrite_newer_identity(path: Path) -> None:
    archive = Archive(path)
    archive.write([identity(name="NEW NAME", type_code=None, callsign=None, heard_at=T0)])
    archive.write(
        [identity(name="OLD NAME", type_code=70, callsign="OLD", heard_at=T0 - 9999, source="noaa")]
    )
    archive.write([position()])
    archive.close()
    [record] = Reader(path, SALT).frame(T0, 30)
    assert (record["name"], record["type"], record["callsign"]) == ("NEW NAME", "Cargo", "OLD")


def test_identity_history_is_kept_only_when_it_changes(path: Path) -> None:
    store(
        path,
        identity(heard_at=T0),
        identity(heard_at=T0 + 360),
        identity(heard_at=T0 + 720, name="RENAMED"),
    )
    rows = sqlite3.connect(path).execute("SELECT name FROM identities ORDER BY heard_at")
    assert [row[0] for row in rows] == ["TEST SHIP", "RENAMED"]


def test_a_failed_write_loses_nothing_on_retry(path: Path) -> None:
    archive = Archive(path)
    good = [identity(), position()]
    bad = replace(position(T0 + 1), report=replace(BASE, heard_at=T0 + 1, lat=None))  # type: ignore[arg-type]
    with pytest.raises(sqlite3.IntegrityError):
        archive.write([*good, bad])
    assert archive.write(good) == 1
    archive.close()
    [record] = Reader(path, SALT).frame(T0, 30)
    assert record["name"] == "TEST SHIP"


def test_a_track_is_in_time_order_with_provenance(path: Path) -> None:
    reader = store(path, identity(), position(T0 + 60, lat=48.71), position(T0, lat=48.70))
    track = reader.track(SHIP, T0 - 1, T0 + 100, 1000)
    assert track is not None
    assert [p["lat"] for p in track["points"]] == [48.70, 48.71]
    assert track["points"][0]["source"] == "live"
    assert track["name"] == "TEST SHIP"


@pytest.mark.parametrize("code", [30, 36, 37, None])
def test_no_track_for_a_private_or_unknown_vessel(path: Path, code: int | None) -> None:
    reader = store(path, identity(BOAT, code), position(mmsi=BOAT))
    assert reader.track(BOAT, T0 - 1, T0 + 1, 1000) is None


def test_no_track_for_a_vessel_never_identified(path: Path) -> None:
    assert store(path, position()).track(SHIP, T0 - 1, T0 + 1, 1000) is None


def test_a_long_track_is_thinned_to_the_limit_and_says_so(path: Path) -> None:
    reader = store(path, identity(), *(position(T0 + n) for n in range(0, 1000, 10)))
    track = reader.track(SHIP, T0, T0 + 1000, 10)
    assert track is not None
    assert 1 <= len(track["points"]) <= 11
    assert track["bucket_s"] == 100
    assert track["points"][-1]["heard_at"] > track["points"][0]["heard_at"]


def test_activity_counts_distinct_vessels_and_reports_per_bin_and_source(path: Path) -> None:
    start = float(int(T0 // 3600) * 3600)
    reader = store(
        path,
        position(start + 10),
        position(start + 20),
        position(start + 30, mmsi=BOAT),
        position(start + 3700),
    )
    rows = reader.activity(start, start + 7200, 3600)
    assert [(r["vessels"], r["reports"], r["source"]) for r in rows] == [
        (2, 3, "live"),
        (1, 1, "live"),
    ]
    assert rows[0]["at"].endswith("Z")
    [merged] = reader.activity(start, start + 7200, 7200)
    assert (merged["vessels"], merged["reports"]) == (2, 4)


def test_coverage_extends_through_short_silences_and_splits_on_long_ones(path: Path) -> None:
    archive = Archive(path)
    archive.write([position(T0)])
    archive.write([position(T0 + 200)])
    archive.write([position(T0 + 2000)])
    archive.close()
    segments = Reader(path, SALT).coverage(T0 - 10, T0 + 3000)["segments"]
    assert len(segments) == 2
    assert all(s["source"] == "live" for s in segments)


def test_coverage_survives_a_restart(path: Path) -> None:
    store(path, position(T0))
    reader = store(path, position(T0 + 100))
    assert len(reader.coverage(T0 - 10, T0 + 3000)["segments"]) == 1


def test_coverage_uses_when_we_received_not_what_the_report_claims(path: Path) -> None:
    late = replace(position(T0 - 86_400), received_at=T0)
    reader = store(path, position(T0), late)
    [segment] = reader.coverage(T0 - 100_000, T0 + 100)["segments"]
    assert segment["from"] == iso(T0)


def test_imported_coverage_merges_with_itself_and_stays_apart_from_live(path: Path) -> None:
    archive = Archive(path)
    archive.cover("noaa", T0 - 7200, T0 - 3600)
    archive.cover("noaa", T0 - 3600, T0 - 1800)
    archive.write([position(T0)])
    archive.close()
    segments = Reader(path, SALT).coverage(T0 - 10000, T0 + 100)["segments"]
    assert sorted(s["source"] for s in segments) == ["live", "noaa"]


def test_gaps_are_the_time_no_source_covered() -> None:
    assert gaps([(10.0, 20.0), (15.0, 30.0), (100.0, 110.0)], 0.0, 200.0) == [
        (0.0, 10.0),
        (30.0, 100.0),
        (110.0, 200.0),
    ]
    assert gaps([], 0.0, 5.0) == [(0.0, 5.0)]
    assert gaps([(0.0, 5.0)], 0.0, 5.0) == []


def test_a_frame_says_whether_anything_was_recording_then(path: Path) -> None:
    reader = store(path, position(T0))
    assert reader.covered(T0 + 3) is True
    assert reader.covered(T0 + 9999) is False
    assert reader.covered(T0 - 9999) is False


def test_latest_gives_what_a_restart_needs_to_refill_the_fleet(path: Path) -> None:
    reader = store(
        path,
        identity(name="BACK AGAIN"),
        position(T0, lat=48.70),
        position(T0 + 60, lat=48.71),
        position(T0 - 90_000, mmsi=BOAT),
    )
    fleet = Fleet(id_salt=SALT, source="live")
    for report, received_at in reader.latest(since=T0 - 3600):
        fleet.apply(report, received_at)
    [record] = fleet.snapshot(now=T0 + 60)
    assert (record["name"], record["lat"], record["mmsi"]) == ("BACK AGAIN", 48.71, SHIP)


def test_a_slow_query_is_stopped(path: Path) -> None:
    store(path, *(position(T0 + n) for n in range(2000)))
    reader = Reader(path, SALT, timeout_s=-1.0)
    with pytest.raises(sqlite3.OperationalError):
        reader.frame(T0 + 2000, 86_400)


def test_a_reader_cannot_write(path: Path) -> None:
    store(path, position())
    db = Reader(path, SALT).connect()
    with pytest.raises(sqlite3.OperationalError):
        db.execute("DELETE FROM reports")


def test_recorder_flushes_and_reports_its_state(path: Path) -> None:
    recorder = Recorder(path)
    recorder.add(BASE, T0, (), "live")
    assert recorder.summary()["pending"] == 1
    recorder.flush()
    summary = recorder.summary()
    assert (summary["pending"], summary["written"], summary["last_error"]) == (0, 1, None)
    recorder.close()


def test_recorder_keeps_reports_while_the_disk_fails_then_catches_up(
    path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    recorder = Recorder(path)
    real = recorder.archive.write

    def failing(_entries: Any) -> int:
        raise sqlite3.OperationalError("disk I/O error")

    monkeypatch.setattr(recorder.archive, "write", failing)
    recorder.add(BASE, T0, (), "live")
    recorder.flush()
    assert recorder.summary()["pending"] == 1
    assert "disk I/O error" in recorder.summary()["last_error"]
    monkeypatch.setattr(recorder.archive, "write", real)
    recorder.flush()
    assert recorder.summary()["pending"] == 0
    assert recorder.summary()["written"] == 1
    assert recorder.summary()["last_error"] is None
    recorder.close()


def test_a_bad_report_cant_block_the_ones_after_it(path: Path) -> None:
    recorder = Recorder(path)
    recorder.add(replace(BASE, lat=None), T0, (), "live")  # type: ignore[arg-type]
    recorder.flush()
    assert recorder.summary()["rejected"] == 1
    assert recorder.summary()["pending"] == 0
    recorder.add(BASE, T0, (), "live")
    recorder.flush()
    assert recorder.summary()["written"] == 1
    assert recorder.summary()["last_error"] is None
    recorder.close()


def test_recorder_counts_what_it_drops_when_it_cant_keep_up(path: Path) -> None:
    recorder = Recorder(path, max_pending=2)
    for n in range(5):
        recorder.add(replace(BASE, heard_at=T0 + n), T0 + n, (), "live")
    assert recorder.summary()["pending"] == 2
    assert recorder.summary()["dropped"] == 3
    recorder.close()


def test_recorder_writes_what_is_pending_when_stopped(path: Path) -> None:
    recorder = Recorder(path, flush_every=3600.0)
    recorder.start()
    recorder.add(BASE, T0, (), "live")
    recorder.stop()
    assert len(Reader(path, SALT).frame(T0, 30)) == 1


def test_reports_are_in_time_order_and_filter_by_area_and_type(path: Path) -> None:
    reader = store(
        path,
        identity(),
        identity(BOAT, 37),
        position(T0 + 20, lat=48.72),
        position(T0 + 10, lat=48.10),
        position(T0 + 5, mmsi=BOAT),
    )
    every = reader.reports(T0, T0 + 100, 100)
    assert every is not None
    assert [r["heard_at"] for r in every["reports"]] == sorted(
        r["heard_at"] for r in every["reports"]
    )
    assert len(every["reports"]) == 3
    boxed = reader.reports(T0, T0 + 100, 100, box=Box(48.5, -123, 49, -122))
    assert boxed is not None
    assert len(boxed["reports"]) == 2
    passenger = reader.reports(T0, T0 + 100, 100, types={"Passenger"})
    assert passenger is not None
    assert {r["type"] for r in passenger["reports"]} == {"Passenger"}


def test_reports_say_when_the_limit_cut_them_short(path: Path) -> None:
    reader = store(path, *(position(T0 + n) for n in range(5)))
    cut = reader.reports(T0, T0 + 100, 3)
    whole = reader.reports(T0, T0 + 100, 5)
    assert cut is not None and whole is not None
    assert (len(cut["reports"]), cut["truncated"]) == (3, True)
    assert (len(whole["reports"]), whole["truncated"]) == (5, False)


def test_reports_stay_private(path: Path) -> None:
    reader = store(path, identity(BOAT, 37, name="MY BOAT"), position(mmsi=BOAT))
    found = reader.reports(T0 - 1, T0 + 1, 10)
    assert found is not None
    assert "MY BOAT" not in str(found)
    assert str(BOAT) not in str(found)
    assert reader.reports(T0 - 1, T0 + 1, 10, mmsi=BOAT) is None


def test_reports_for_one_identified_vessel(path: Path) -> None:
    reader = store(path, identity(), position(), position(T0, mmsi=BOAT))
    found = reader.reports(T0 - 1, T0 + 1, 10, mmsi=SHIP)
    assert found is not None
    assert [r["mmsi"] for r in found["reports"]] == [SHIP]


def test_catalog_names_identified_vessels_and_only_counts_private_ones(path: Path) -> None:
    reader = store(
        path,
        identity(),
        identity(BOAT, 37, name="MY BOAT"),
        position(T0),
        position(T0 + 3600),
        position(T0, mmsi=BOAT),
        position(T0, mmsi=999),
    )
    found = reader.catalog(T0 - 1, T0 + 7200)
    [ship] = found["vessels"]
    assert (ship["mmsi"], ship["name"], ship["hours_heard"], ship["reports"]) == (
        SHIP,
        "TEST SHIP",
        2,
        2,
    )
    assert found["private"] == [
        {"type": "Pleasure craft", "vessels": 1, "reports": 1},
        {"type": "Unknown", "vessels": 1, "reports": 1},
    ]
    assert "MY BOAT" not in str(found)
    assert str(BOAT) not in str(found)
    only = reader.catalog(T0 - 1, T0 + 7200, {"Cargo"})
    assert only == {"vessels": [], "private": []}


def test_density_counts_vessels_per_cell(path: Path) -> None:
    reader = store(path, identity(), position(T0), position(T0 + 10))
    [cell] = reader.density(T0 - 1, T0 + 100)
    assert (cell["vessels"], cell["reports"]) == (1, 2)
    assert (cell["lat"], cell["lon"]) == (48.72, -122.68)
    assert reader.density(T0 - 1, T0 + 100, {"Cargo"}) == []


def test_density_wont_point_at_a_lone_private_boats_dock(path: Path) -> None:
    few = [identity(BOAT + n, 37) for n in range(2)] + [
        position(T0, mmsi=BOAT + n) for n in range(2)
    ]
    assert store(path, *few).density(T0 - 1, T0 + 100) == []
    enough = [identity(BOAT + 2, 37), position(T0, mmsi=BOAT + 2)]
    [cell] = store(path, *enough).density(T0 - 1, T0 + 100)
    assert cell["vessels"] == 3
