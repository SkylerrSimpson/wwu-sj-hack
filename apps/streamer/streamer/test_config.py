from pathlib import Path

import pytest

from streamer.config import Box, load


def test_requires_the_key() -> None:
    with pytest.raises(ValueError, match="AIS_API_KEY"):
        load({})


def test_defaults_cover_lummi_waters_and_bind_locally() -> None:
    config = load({"AIS_API_KEY": "k", "STREAMER_ID_SALT": "s"})
    assert config.host == "127.0.0.1"
    assert config.box.contains(48.73, -122.67)
    assert not config.box.contains(47.6, -122.33)
    assert config.id_salt == b"s"


def test_secrets_are_not_in_the_repr() -> None:
    text = repr(load({"AIS_API_KEY": "secret", "STREAMER_ID_SALT": "pepper"}))
    assert "secret" not in text
    assert "pepper" not in text


def test_box_comes_from_the_environment_and_is_validated() -> None:
    config = load({"AIS_API_KEY": "k", "STREAMER_BOX": "48.1,-123.0,48.2,-122.0"})
    assert config.box == Box(48.1, -123.0, 48.2, -122.0)
    for bad in ["1,2,3", "a,b,c,d", "50,-123,48,-122", "48,-122,49,-123", "95,0,96,1"]:
        with pytest.raises(ValueError, match="STREAMER_BOX"):
            load({"AIS_API_KEY": "k", "STREAMER_BOX": bad})


def test_port_is_validated() -> None:
    assert load({"AIS_API_KEY": "k", "STREAMER_PORT": "9000"}).port == 9000
    for bad in ["abc", "0", "70000"]:
        with pytest.raises(ValueError, match="STREAMER_PORT"):
            load({"AIS_API_KEY": "k", "STREAMER_PORT": bad})


def test_a_missing_salt_gets_a_random_one() -> None:
    assert load({"AIS_API_KEY": "k"}).id_salt != load({"AIS_API_KEY": "k"}).id_salt


def test_the_archive_path_is_optional(tmp_path: Path) -> None:
    assert load({"AIS_API_KEY": "k"}).db_path is None
    assert load({"AIS_API_KEY": "k", "STREAMER_DB": str(tmp_path / "x" / "ais.db")}).db_path == str(
        tmp_path / "x" / "ais.db"
    )


def test_the_salt_lives_beside_the_archive_so_the_folder_moves_whole(tmp_path: Path) -> None:
    db = tmp_path / "new" / "ais.db"
    env = {"AIS_API_KEY": "k", "STREAMER_DB": str(db)}
    first = load(env).id_salt
    assert (tmp_path / "new" / "id_salt.txt").exists()
    assert load(env).id_salt == first
    moved = tmp_path / "other"
    (tmp_path / "new").rename(moved)
    assert load({**env, "STREAMER_DB": str(moved / "ais.db")}).id_salt == first


def test_a_salt_from_the_environment_still_wins(tmp_path: Path) -> None:
    env = {"AIS_API_KEY": "k", "STREAMER_DB": str(tmp_path / "ais.db"), "STREAMER_ID_SALT": "s"}
    assert load(env).id_salt == b"s"
    assert not (tmp_path / "id_salt.txt").exists()
