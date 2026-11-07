from dataclasses import replace
from typing import Any

from streamer.fleet import Fleet, Position, Static

T0 = 1_793_990_000.0
MMSI = 368000001

BASE_POSITION = Position(
    mmsi=MMSI,
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
    name="TEST SHIP",
)
BASE_STATIC = Static(
    mmsi=MMSI, heard_at=T0, name="TEST SHIP", callsign="WXY1234", type_code=60, length_m=35
)


def position(heard_at: float = T0, **overrides: Any) -> Position:
    return replace(BASE_POSITION, heard_at=heard_at, **overrides)


def static(type_code: int | None = 60, **overrides: Any) -> Static:
    return replace(BASE_STATIC, type_code=type_code, **overrides)


def fleet() -> Fleet:
    return Fleet(id_salt=b"test", source="test-feed")


def test_a_position_creates_a_record_with_provenance() -> None:
    record, outcome = fleet().apply(position(), received_at=T0 + 3)
    assert outcome == "position"
    assert record is not None
    assert record["source"] == "test-feed"
    assert record["heard_at"].endswith("Z")
    assert record["received_at"].endswith("Z")
    assert (record["lat"], record["lon"], record["sog_kn"]) == (48.72, -122.68, 9.5)


def test_an_unknown_type_is_private_until_the_type_arrives() -> None:
    f = fleet()
    before, _ = f.apply(position(), received_at=T0)
    assert before is not None
    assert before["mmsi"] is None
    assert before["callsign"] is None
    assert "TEST SHIP" not in before["name"]
    after, outcome = f.apply(static(60), received_at=T0)
    assert outcome == "static"
    assert after is not None
    assert after["mmsi"] == MMSI
    assert after["name"] == "TEST SHIP"
    assert after["type"] == "Passenger"
    assert after["id"] == before["id"]


def test_private_boats_show_only_type_and_length() -> None:
    for code, word in [(30, "Fishing"), (36, "Sailing"), (37, "Pleasure craft")]:
        f = fleet()
        f.apply(static(code, length_m=10), received_at=T0)
        record, _ = f.apply(position(), received_at=T0)
        assert record is not None
        assert record["name"] == f"{word}, 10 m"
        assert record["type"] == word
        assert record["mmsi"] is None
        assert record["callsign"] is None
        assert str(MMSI) not in str(record)


def test_the_private_id_is_stable_and_doesnt_contain_the_mmsi() -> None:
    a, _ = fleet().apply(position(), received_at=T0)
    b, _ = fleet().apply(position(), received_at=T0)
    c, _ = Fleet(id_salt=b"other", source="x").apply(position(), received_at=T0)
    assert a is not None and b is not None and c is not None
    assert a["id"] == b["id"]
    assert a["id"] != c["id"]
    assert str(MMSI) not in a["id"]


def test_static_before_position_is_kept_but_not_published() -> None:
    f = fleet()
    record, outcome = f.apply(static(60), received_at=T0)
    assert (record, outcome) == (None, "static_pending")
    first, _ = f.apply(position(), received_at=T0)
    assert first is not None
    assert first["name"] == "TEST SHIP"


def test_a_static_message_that_only_repeats_publishes_nothing() -> None:
    f = fleet()
    f.apply(position(), received_at=T0)
    f.apply(static(60), received_at=T0)
    record, outcome = f.apply(static(60), received_at=T0 + 360)
    assert (record, outcome) == (None, "static_unchanged")


def test_partial_static_messages_merge() -> None:
    f = fleet()
    f.apply(position(), received_at=T0)
    f.apply(static(None, callsign=None, length_m=None, name="PART A"), received_at=T0)
    record, _ = f.apply(static(70, name=None, callsign="WAB9", length_m=90), received_at=T0)
    assert record is not None
    assert (record["name"], record["callsign"], record["length_m"]) == ("PART A", "WAB9", 90)


def test_an_older_report_cannot_overwrite_a_newer_one() -> None:
    f = fleet()
    f.apply(position(T0 + 60, lat=48.73), received_at=T0 + 60)
    record, outcome = f.apply(position(T0, lat=48.70), received_at=T0 + 61)
    assert (record, outcome) == (None, "stale")
    [current] = f.snapshot(now=T0 + 61)
    assert current["lat"] == 48.73


def test_the_same_transmission_from_two_receivers_counts_once() -> None:
    f = fleet()
    f.apply(position(T0), received_at=T0)
    record, outcome = f.apply(position(T0 + 1), received_at=T0 + 1)
    assert (record, outcome) == (None, "duplicate")


def test_a_moored_boat_reporting_again_is_not_a_duplicate() -> None:
    f = fleet()
    f.apply(position(T0, transmit_second=12), received_at=T0)
    record, outcome = f.apply(position(T0 + 180, transmit_second=12), received_at=T0 + 180)
    assert outcome == "position"
    assert record is not None


def test_a_report_from_the_future_cannot_freeze_the_vessel() -> None:
    f = fleet()
    record, outcome = f.apply(position(T0 + 3600), received_at=T0)
    assert (record, outcome) == (None, "future_time")
    accepted, _ = f.apply(position(T0), received_at=T0)
    assert accepted is not None


def test_an_impossible_jump_is_published_with_a_flag() -> None:
    f = fleet()
    f.apply(position(T0), received_at=T0)
    record, outcome = f.apply(position(T0 + 60, lat=49.5), received_at=T0 + 60)
    assert outcome == "position"
    assert record is not None
    assert record["lat"] == 49.5
    assert "position_jump" in record["flags"]


def test_normal_travel_and_gps_jitter_are_not_flagged() -> None:
    f = fleet()
    f.apply(position(T0), received_at=T0)
    moved, _ = f.apply(position(T0 + 60, lat=48.725), received_at=T0 + 60)
    jitter, _ = f.apply(position(T0 + 62, lat=48.7251, transmit_second=14), received_at=T0 + 62)
    assert moved is not None and jitter is not None
    assert moved["flags"] == []
    assert jitter["flags"] == []


def test_a_nonstandard_mmsi_is_kept_and_flagged() -> None:
    record, _ = fleet().apply(position(mmsi=123), received_at=T0)
    assert record is not None
    assert "nonstandard_mmsi" in record["flags"]


def test_snapshot_filters_by_age_newest_first() -> None:
    f = fleet()
    f.apply(position(T0, mmsi=368000001), received_at=T0)
    f.apply(position(T0 + 100, mmsi=368000002), received_at=T0 + 100)
    both = f.snapshot(now=T0 + 100)
    assert len(both) == 2
    assert both[0]["heard_at"] > both[1]["heard_at"]
    assert len(f.snapshot(now=T0 + 100, max_age_s=50)) == 1


def test_prune_forgets_vessels_not_heard_for_a_long_time() -> None:
    f = fleet()
    f.apply(position(T0), received_at=T0)
    f.apply(position(T0 + 100, mmsi=368000002), received_at=T0 + 100)
    assert f.prune(before=T0 + 50) == 1
    assert len(f.snapshot(now=T0 + 100)) == 1
    assert len(f) == 1
