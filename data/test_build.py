import json
from itertools import pairwise

from build import build, demo_vessel, fetch, inside, ring_from_kml, stamp, tracks, type_word
from check import OUT, problems_in


def row(
    mmsi: str, t: str, lat: float, lon: float, name="", vtype="30", length="20", call=""
) -> dict[str, str]:
    return {
        "MMSI": mmsi,
        "BaseDateTime": t,
        "LAT": str(lat),
        "LON": str(lon),
        "VesselName": name,
        "CallSign": call,
        "VesselType": vtype,
        "Length": length,
    }


def test_type_word_turns_ais_codes_into_words() -> None:
    assert [type_word(c) for c in ["30", "52", "37", "60", "71", "80", "", "99"]] == [
        "Fishing",
        "Tug",
        "Pleasure craft",
        "Passenger",
        "Cargo",
        "Tanker",
        "Other",
        "Other",
    ]


def test_ring_from_kml_reads_lon_lat_pairs() -> None:
    kml = "<kml><coordinates>-122.7,48.8,0 -122.6,48.8,0 -122.6,48.7,0 -122.7,48.8,0</coordinates></kml>"
    assert ring_from_kml(kml) == [[-122.7, 48.8], [-122.6, 48.8], [-122.6, 48.7], [-122.7, 48.8]]


def test_inside_a_unit_square() -> None:
    square = [[0.0, 0.0], [0.0, 1.0], [1.0, 1.0], [1.0, 0.0], [0.0, 0.0]]
    assert inside(0.5, 0.5, square)
    assert not inside(2.0, 2.0, square)


def test_tracks_keep_one_position_per_vessel_per_five_minutes_and_drop_duplicates() -> None:
    rows = [
        row("1", "2024-12-05T00:00:00", 48.7, -122.6),
        row("1", "2024-12-05T00:00:00", 48.7, -122.6),
        row("1", "2024-12-05T00:02:00", 48.71, -122.6),
        row("1", "2024-12-05T00:05:30", 48.72, -122.6),
    ]
    assert [v["track"] for v in tracks(rows)] == [
        [[1733356800, -122.6, 48.7], [1733357130, -122.6, 48.72]]
    ]


def test_tracks_anonymise_private_boats_by_type_length_and_numbered_id() -> None:
    t = "2024-12-05T00:00:00"
    rows = [
        row(
            "367500000",
            t,
            48.7,
            -122.6,
            name="MADE UP BOAT",
            vtype="37",
            length="14",
            call="WXX0000",
        ),
        row("366999999", t, 48.7, -122.6, name="NORTHERN STAR", vtype="30", length="24"),
        row("316000001", t, 48.7, -122.6, name="", vtype="36", length=""),
        row(
            "366709770",
            t,
            48.7,
            -122.6,
            name="WSF CHELAN",
            vtype="60",
            length="100",
            call="WCX7878",
        ),
    ]
    assert [(v["id"], v["name"], v["length_m"], v["callsign"]) for v in tracks(rows)] == [
        ("366709770", "WSF CHELAN", 100, "WCX7878"),
        ("private-1", "Sailing", None, ""),
        ("private-2", "Fishing, 24 m", 24, ""),
        ("private-3", "Pleasure craft, 14 m", 14, ""),
    ]


def test_tracks_label_only_the_listed_vessels_and_priority_follows() -> None:
    t = "2024-12-05T00:00:00"
    rows = [
        row("366709770", t, 48.7, -122.6, name="WSF CHELAN", vtype="60", call="WCX7878"),
        row("338162321", t, 48.7, -122.6, name="LENGESOT", vtype="55"),
        row("368011730", t, 48.7, -122.6, name="WHATCOM CHIEF", vtype="60", call="WDJ7956"),
    ]
    assert [(v["id"], v["fleet"], v["priority"]) for v in tracks(rows)] == [
        ("338162321", "Law enforcement, listed", True),
        ("366709770", None, False),
        ("368011730", "Whatcom County ferry", True),
    ]


def test_demo_vessel_enters_lummi_waters_twice_an_hour_apart() -> None:
    ring = ring_from_kml(fetch()[1])
    track = demo_vessel(1733356800, ring)["track"]
    flags = [inside(lon, lat, ring) for _, lon, lat in track]
    entries = [stamp(int(p[0])) for p, (a, b) in zip(track[1:], pairwise(flags)) if b and not a]
    assert entries == ["2024-12-05T13:30:00Z", "2024-12-05T14:30:00Z"]


def test_raw_ais_carries_no_name_imo_or_call_sign_for_private_types() -> None:
    rows = fetch()[0]
    assert {r["VesselType"] for r in rows} > {"30", "36", "37"}
    assert all(
        r["VesselName"] == r["IMO"] == r["CallSign"] == ""
        for r in rows
        if r["VesselType"] in {"30", "36", "37"}
    )


def test_build_output_matches_the_schema() -> None:
    assert problems_in(build()) == []


def test_committed_data_json_is_what_build_produces() -> None:
    assert json.loads(OUT.read_text(encoding="utf-8")) == build()
