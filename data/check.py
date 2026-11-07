import json
import re
import sys
from collections import Counter
from itertools import pairwise
from pathlib import Path

from jsonschema import Draft202012Validator

HERE = Path(__file__).resolve().parent
SCHEMA = json.loads((HERE / "schema.json").read_text(encoding="utf-8"))
OUT = HERE.parent / "apps" / "web" / "public" / "data.json"
PRIVATE = {"Fishing", "Sailing", "Pleasure craft"}


def is_private(kind: str, length_m: int | None) -> bool:
    """Under 20 m or unmeasured with no real type set: a skiff, not a ship."""
    return kind in PRIVATE or (kind == "Other" and (length_m or 0) < 20)


def problems_in(data: dict) -> list[str]:
    problems = [
        f"{'/'.join(map(str, e.absolute_path)) or '<root>'}: {e.message}"
        for e in Draft202012Validator(SCHEMA).iter_errors(data)
    ]
    if problems:
        return problems
    source_ids = {s["id"] for s in data["sources"]}
    for i, v in enumerate(data["vessels"]):
        if v["source"] not in source_ids:
            problems.append(f"vessels/{i}: source {v['source']!r} is not in sources")
        if any(a[0] > b[0] for a, b in pairwise(v["track"])):
            problems.append(f"vessels/{i}: track is not in time order")
        if v["priority"] != (v["fleet"] is not None):
            problems.append(f"vessels/{i}: priority must be true exactly when fleet is set")
        # The synthetic vessel is a fishing boat by type but has no owner to hide.
        if v["source"] != "demo" and is_private(v["type"], v["length_m"]):
            if not re.fullmatch(r"private-\d+", v["id"]):
                problems.append(f"vessels/{i}: private boat {v['id']!r} needs a private-N id")
            if v["callsign"]:
                problems.append(f"vessels/{i}: private boat {v['id']!r} must not carry a call sign")
    if data["boundary"]["source"] not in source_ids:
        problems.append(f"boundary: source {data['boundary']['source']!r} is not in sources")
    if data["boundary"]["ring"][0] != data["boundary"]["ring"][-1]:
        problems.append("boundary/ring: first point differs from last")
    dupes = sorted(i for i, n in Counter(v["id"] for v in data["vessels"]).items() if n > 1)
    if dupes:
        problems.append(f"duplicate vessel ids: {dupes}")
    return problems


if __name__ == "__main__":
    problems = problems_in(json.loads(OUT.read_text(encoding="utf-8")))
    for p in problems:
        print(p, file=sys.stderr)
    if problems:
        sys.exit(1)
    print(f"ok: {OUT.relative_to(HERE.parent)} matches data/schema.json")
