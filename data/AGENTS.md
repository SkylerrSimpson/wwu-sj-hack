# data/

Root `AGENTS.md` applies here too. Willow owns this folder. Its one output is `apps/web/public/data.json`, and `build.py` is its only writer.

## Loop

1. Explore in a notebook or REPL freely. A transform you keep moves into `build.py`.
2. Each cleaning, scoring, or matching rule starts as a failing test in `test_build.py`, then the code that passes it.
3. `make data` regenerates `data.json`; `make check-data` formats, lints, type-checks, runs the tests and validates the file against `schema.json`.
4. Commit `build.py`, its tests, and the regenerated `data.json` together; the test that compares the committed file with `build()` keeps them in step.
5. Append to `NOTES.md`: the source, what was dropped or merged and why, what the data cannot tell us. Those are the questions anyone asks about a dataset.

## Rules

- `fetch()` is the only function that touches the network or `data/raw/`. Downloads are saved under `data/raw/` and committed, so `make data` works offline and the demo never depends on a live site. Tests of transforms call `clean()` directly; a test through `build()` fakes the edge with `monkeypatch.setattr(build, "fetch", lambda: rows)`.
- Every record names its `source`, and every source carries `url` and `retrieved`. Provenance is a safeguard the UI shows, so it is part of the data.
- Personal data never enters `data.json`: the file is public twice, in the repo and at `/data.json` on the deploy. Aggregate it, bucket it, or drop it. `schema.json` refuses any field it does not declare; a new field is a `schema: <field>` issue (root `AGENTS.md`, Ownership).
- Anything that fits or predicts follows the Decisions section of `agents/standards.md`: a decision line, a safeguard row, and a model card in `NOTES.md` (inputs, fields excluded on purpose, held-out accuracy, known failure cases, what a person checks before acting on the output). Rule-based matching and geocoding instead get a `NOTES.md` Cleaning entry with an example of a false merge.
