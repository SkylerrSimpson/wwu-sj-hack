"""Strips private boats out of the event's AIS CSV before it is committed as data/raw/*.zip.

    uv run strip.py <original.csv> <out.zip>

The original stays in data/lummifiles/, which git ignores.
"""

import csv
import io
import sys
import zipfile
from pathlib import Path

from build import length_m, type_word
from check import is_private


def strip(rows: list[dict[str, str]]) -> list[dict[str, str]]:
    """Blanks name, IMO and call sign on private boats and renames their MMSIs P0001.. in
    sorted-MMSI order, so build.py's sort by MMSI still gives the same private-n ids."""
    first: dict[str, dict[str, str]] = {}
    for r in rows:
        first.setdefault(r["MMSI"], r)
    private = sorted(
        m for m, r in first.items() if is_private(type_word(r["VesselType"]), length_m(r))
    )
    alias = {m: f"P{n:04}" for n, m in enumerate(private, 1)}
    for r in rows:
        if r["MMSI"] in alias:
            r.update(MMSI=alias[r["MMSI"]], VesselName="", IMO="", CallSign="")
    return rows


if __name__ == "__main__":
    src, out = Path(sys.argv[1]), Path(sys.argv[2])
    with src.open(newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        assert reader.fieldnames
        rows = strip(list(reader))
    buf = io.StringIO()
    writer = csv.DictWriter(buf, reader.fieldnames, lineterminator="\n")
    writer.writeheader()
    writer.writerows(rows)
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as z:
        z.writestr(out.with_suffix(".csv").name, buf.getvalue())
    print(f"wrote {len(rows)} rows to {out}")
