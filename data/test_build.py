import json
from itertools import pairwise

from build import (
    build,
    demo_vessel,
    fetch,
    inside,
    length_m,
    ring_from_kml,
    stamp,
    tracks,
    type_word,
)
from check import OUT, is_private, problems_in
from strip import strip


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


def test_tracks_treat_a_small_or_unmeasured_other_boat_as_private() -> None:
    """A 9 m boat whose owner set no type is a skiff, not a ship; a 33 m one keeps its name."""
    t = "2024-12-05T00:00:00"
    rows = [
        row("367000002", t, 48.7, -122.6, name="LITTLE SKIFF", vtype="90", length="9", call="WXX1"),
        row("367000003", t, 48.7, -122.6, name="BIG BARGE", vtype="99", length="33", call="WXX2"),
        row("367000001", t, 48.7, -122.6, name="NO LENGTH", vtype="40", length="", call="WXX3"),
    ]
    assert [(v["id"], v["name"], v["length_m"], v["callsign"]) for v in tracks(rows)] == [
        ("367000003", "BIG BARGE", 33, "WXX2"),
        ("private-1", "Other", None, ""),
        ("private-2", "Other, 9 m", 9, ""),
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


def test_strip_blanks_private_identities_and_numbers_their_mmsis_in_sorted_order() -> None:
    """Rows keep their order; P-ids follow sorted MMSI so build.py's private-n numbering holds."""
    t = "2024-12-05T00:00:00"
    rows = [
        row("366709770", t, 48.7, -122.6, name="WSF CHELAN", vtype="60", length="100", call="WCX"),
        row("367000002", t, 48.7, -122.6, name="MADE UP BOAT", vtype="37", length="14", call="WXX"),
        row("367000001", t, 48.7, -122.6, name="LITTLE SKIFF", vtype="90", length="9", call="WXY"),
    ]
    for r in rows:
        r["IMO"] = "IMO1234567"
    assert [(r["MMSI"], r["VesselName"], r["IMO"], r["CallSign"]) for r in strip(rows)] == [
        ("366709770", "WSF CHELAN", "IMO1234567", "WCX"),
        ("P0002", "", "", ""),
        ("P0001", "", "", ""),
    ]


def private_row(r: dict[str, str]) -> bool:
    return is_private(type_word(r["VesselType"]), length_m(r))


def test_raw_ais_carries_no_name_imo_or_call_sign_for_private_boats() -> None:
    rows = fetch()[0]
    assert {r["VesselType"] for r in rows} > {"30", "36", "37", "90"}
    assert all(r["VesselName"] == r["IMO"] == r["CallSign"] == "" for r in rows if private_row(r))


def test_raw_ais_pseudonymises_private_boats_mmsi_and_no_other() -> None:
    """A real MMSI is nine digits; the zip carries P0001.. instead, one per private boat."""
    rows = fetch()[0]
    private = {r["MMSI"] for r in rows if private_row(r)}
    assert private == {f"P{n:04}" for n in range(1, len(private) + 1)}
    assert not any(r["MMSI"].startswith("P") for r in rows if not private_row(r))


def valid() -> dict:
    """The smallest data.json the schema accepts: one private boat, one closed ring."""
    return {
        "sources": [{"id": "ais", "name": "AIS", "url": "https://x", "retrieved": "2026-11-07"}],
        "window": {"start": "2024-12-05T00:00:00Z", "end": "2024-12-05T00:05:00Z"},
        "boundary": {"source": "ais", "ring": [[0, 0], [0, 1], [1, 1], [0, 0]]},
        "vessels": [
            {
                "id": "private-1",
                "source": "ais",
                "name": "Fishing, 9 m",
                "type": "Fishing",
                "length_m": 9,
                "callsign": "",
                "fleet": None,
                "priority": False,
                "track": [[0, 0.5, 0.5], [300, 0.6, 0.5]],
            }
        ],
    }


def test_problems_in_accepts_the_small_valid_file() -> None:
    assert problems_in(valid()) == []


def test_problems_in_refuses_a_ring_that_is_not_closed() -> None:
    data = valid()
    data["boundary"]["ring"][-1] = [1, 0]
    assert problems_in(data) == ["boundary/ring: first point differs from last"]


def test_problems_in_refuses_a_track_out_of_time_order() -> None:
    data = valid()
    data["vessels"][0]["track"].reverse()
    assert problems_in(data) == ["vessels/0: track is not in time order"]


def test_problems_in_refuses_priority_that_disagrees_with_fleet() -> None:
    data = valid()
    data["vessels"][0]["priority"] = True
    assert problems_in(data) == ["vessels/0: priority must be true exactly when fleet is set"]


def test_problems_in_refuses_a_private_boat_with_an_mmsi_id_or_a_call_sign() -> None:
    """The rule is the one build.py anonymises by, so a small "Other" boat counts too."""
    named = valid()
    named["vessels"][0] |= {"id": "367000001", "type": "Other", "length_m": 9}
    with_call = valid()
    with_call["vessels"][0]["callsign"] = "WXX1"
    assert problems_in(named) == ["vessels/0: private boat '367000001' needs a private-N id"]
    assert problems_in(with_call) == [
        "vessels/0: private boat 'private-1' must not carry a call sign"
    ]


def test_build_output_matches_the_schema() -> None:
    assert problems_in(build()) == []


def test_committed_data_json_is_what_build_produces() -> None:
    assert json.loads(OUT.read_text(encoding="utf-8")) == build()
