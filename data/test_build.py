import json

from build import build, demo_vessel, fetch, inside, ring_from_kml, tracks, type_word
from check import OUT, problems_in


def row(
    mmsi: str, t: str, lat: float, lon: float, name="", vtype="30", length="20"
) -> dict[str, str]:
    return {
        "MMSI": mmsi,
        "BaseDateTime": t,
        "LAT": str(lat),
        "LON": str(lon),
        "VesselName": name,
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


def test_tracks_name_private_boats_by_type_and_length_only() -> None:
    rows = [
        row(
            "1",
            "2024-12-05T00:00:00",
            48.7,
            -122.6,
            name="MADE UP BOAT",
            vtype="37",
            length="14",
        ),
        row(
            "2", "2024-12-05T00:00:00", 48.7, -122.6, name="NORTHERN STAR", vtype="30", length="24"
        ),
        row("3", "2024-12-05T00:00:00", 48.7, -122.6, name="", vtype="36", length=""),
    ]
    assert [(v["name"], v["length_m"]) for v in tracks(rows)] == [
        ("Pleasure craft, 14 m", 14),
        ("NORTHERN STAR", 24),
        ("Sailing", None),
    ]


def test_tracks_mark_the_priority_list() -> None:
    rows = [
        row("368011730", "2024-12-05T00:00:00", 48.7, -122.6, name="WHATCOM CHIEF", vtype="60"),
        row("1", "2024-12-05T00:00:00", 48.7, -122.6),
    ]
    assert [v["priority"] for v in tracks(rows)] == [False, True]


def test_demo_vessel_starts_outside_lummi_waters_and_ends_inside() -> None:
    ring = ring_from_kml(fetch()[1])
    track = demo_vessel(1733356800, ring)["track"]
    assert not inside(track[0][1], track[0][2], ring)
    assert inside(track[-1][1], track[-1][2], ring)


def test_build_output_matches_the_schema() -> None:
    assert problems_in(build()) == []


def test_committed_data_json_is_what_build_produces() -> None:
    assert json.loads(OUT.read_text(encoding="utf-8")) == build()
