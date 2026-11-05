# Project name

One sentence: who it helps and how. Filled Saturday.

Live: https://example.vercel.app

## Run it

    pnpm install && pnpm dev      # http://localhost:3000; needs Node 24 and pnpm

Node 24: https://nodejs.org. pnpm: `npm i -g pnpm` or https://pnpm.io/installation.

The data the app reads is committed at `apps/web/public/data.json`. Regenerating it needs [uv](https://docs.astral.sh/uv/), which fetches Python itself: `cd data && uv sync && uv run build.py`.

`make setup`, `make dev`, `make data`, `make fmt` and `make check` wrap these; `docs/SETUP.md` has the from-scratch version.

## Where the data comes from

`data/NOTES.md`: sources, cleaning, and what the data cannot tell you.

## How it was built

`docs/SPEC.md` is the problem and scope, `docs/DECISIONS.md` the choices and why, `docs/HACKATHON.md` the plan. The scaffold (tooling, an empty page, two sample rows) was set up on Nov 4, before the event; everything the user sees was built Nov 6 to 8, and the commit history shows the line. Skyler Simpson built `apps/web/`, Willow Hughes built `data/`.
