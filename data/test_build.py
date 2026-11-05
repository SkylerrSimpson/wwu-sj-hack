import json

from build import build, clean
from check import OUT, problems_in


def test_clean_drops_rows_without_an_id() -> None:
    assert clean([{"id": "", "source": "s"}, {"id": "1", "source": "s"}]) == [
        {"id": "1", "source": "s"}
    ]


def test_clean_strips_whitespace_from_strings() -> None:
    assert clean([{"id": " 1 ", "name": " x ", "source": "s"}]) == [
        {"id": "1", "name": "x", "source": "s"}
    ]


def test_build_output_matches_the_schema() -> None:
    assert problems_in(build()) == []


def test_committed_data_json_is_what_build_produces() -> None:
    assert json.loads(OUT.read_text(encoding="utf-8")) == build()
