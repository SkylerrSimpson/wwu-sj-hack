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
        f"vessels/{i}: source {v['source']!r} is not in sources"
        for i, v in enumerate(data["vessels"])
        if v["source"] not in source_ids
    ]
    if data["boundary"]["source"] not in source_ids:
        problems.append(f"boundary: source {data['boundary']['source']!r} is not in sources")
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
