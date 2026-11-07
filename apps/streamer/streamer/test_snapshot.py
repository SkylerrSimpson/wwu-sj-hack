import sqlite3
from pathlib import Path

from streamer.archive import Archive, Entry, Reader
from streamer.fleet import Static
from streamer.snapshot import snapshot

T0 = 1_793_990_000.0


def test_a_snapshot_is_one_whole_file_with_what_the_log_still_held(tmp_path: Path) -> None:
    source = tmp_path / "ais.db"
    archive = Archive(source)
    archive.write([Entry(Static(368000001, T0, "SHIP", None, 60, None), T0, (), "live")])
    destination = tmp_path / "backups" / "copy.db"
    snapshot(source, destination)
    archive.close()
    db = sqlite3.connect(destination)
    assert db.execute("PRAGMA integrity_check").fetchone() == ("ok",)
    assert db.execute("SELECT name FROM identities").fetchall() == [("SHIP",)]
    db.close()
    assert not destination.with_name("copy.db.partial").exists()
    assert Reader(destination, b"s").coverage(T0 - 1, T0 + 1)["segments"]


def test_a_snapshot_replaces_the_previous_one(tmp_path: Path) -> None:
    source = tmp_path / "ais.db"
    Archive(source).close()
    destination = tmp_path / "copy.db"
    destination.write_text("old")
    snapshot(source, destination)
    assert sqlite3.connect(destination).execute("PRAGMA integrity_check").fetchone() == ("ok",)
