"""The only writer of apps/web/public/data.json."""

import json

from check import OUT, problems_in

SOURCES = [
    {
        "id": "sample",
        "name": "Hand-written sample rows",
        "url": "https://example.org",
        "retrieved": "2026-11-04",
    },
]

SAMPLE_ROWS = [
    {"id": "1", "name": "  First sample  ", "source": "sample"},
    {"id": "2", "name": "Second sample", "source": "sample"},
]


def fetch() -> list[dict]:
    return SAMPLE_ROWS


def clean(rows: list[dict]) -> list[dict]:
    return [
        {k: v.strip() if isinstance(v, str) else v for k, v in row.items()}
        for row in rows
        if row.get("id", "").strip()
    ]


def build() -> dict:
    return {"sources": SOURCES, "records": clean(fetch())}


if __name__ == "__main__":
    data = build()
    problems = problems_in(data)
    if problems:
        raise SystemExit("\n".join(["refusing to write an invalid data.json:", *problems]))
    OUT.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"wrote {len(data['records'])} records to {OUT}")
