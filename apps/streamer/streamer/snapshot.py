"""Writes one consistent copy of the archive, safe while the service runs.

Run with: python -m streamer.snapshot SOURCE DESTINATION
"""

import sqlite3
import sys
from pathlib import Path


def snapshot(source: str | Path, destination: str | Path) -> None:
    # Copying a live file can catch it mid-write. The backup API can't, and it folds the
    # write-ahead log in, so the result is a single file. The rename means a failed run leaves
    # any earlier snapshot whole.
    target = Path(destination)
    target.parent.mkdir(parents=True, exist_ok=True)
    partial = target.with_name(f"{target.name}.partial")
    partial.unlink(missing_ok=True)
    reader = sqlite3.connect(f"{Path(source).resolve().as_uri()}?mode=ro", uri=True, timeout=30)
    writer = sqlite3.connect(partial)
    try:
        reader.backup(writer)
    finally:
        writer.close()
        reader.close()
    partial.replace(target)


if __name__ == "__main__":
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    snapshot(sys.argv[1], sys.argv[2])
