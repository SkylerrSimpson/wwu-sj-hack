import json
import sys
from collections import Counter
from pathlib import Path

from jsonschema import Draft202012Validator

HERE = Path(__file__).resolve().parent
SCHEMA = json.loads((HERE / "schema.json").read_text(encoding="utf-8"))
OUT = HERE.parent / "apps" / "web" / "public" / "data.json"


def problems_in(data: dict) -> list[str]:
    problems = [
        f"{'/'.join(map(str, e.absolute_path)) or '<root>'}: {e.message}"
        for e in Draft202012Validator(SCHEMA).iter_errors(data)
    ]
    if problems:
        return problems
    source_ids = {s["id"] for s in data["sources"]}
    problems += [
        f"records/{i}: source {r['source']!r} is not in sources"
        for i, r in enumerate(data["records"])
        if r["source"] not in source_ids
    ]
    dupes = sorted(i for i, n in Counter(r["id"] for r in data["records"]).items() if n > 1)
    if dupes:
        problems.append(f"duplicate record ids: {dupes}")
    return problems


if __name__ == "__main__":
    problems = problems_in(json.loads(OUT.read_text(encoding="utf-8")))
    for p in problems:
        print(p, file=sys.stderr)
    if problems:
        sys.exit(1)
    print(f"ok: {OUT.relative_to(HERE.parent)} matches data/schema.json")
