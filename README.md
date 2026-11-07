# Lummi Vessel Tracker

Helps Lummi Nation staff see which vessels are in Lummi waters and get an email when one that is not on the approved list enters. Built in one day at the WWU Social Justice Hackathon, Nov 7 2026, from five recorded days of public AIS ship positions.

How it works, in one breath: public ship positions, then rules that find which vessels are inside the reservation boundary and which just crossed in, then a map that replays the days with an alert panel. The approved list and the patterns that mark known vessels (seventeen tribal call-sign codes such as XWL for the Lummi Nation, and WSF for the state ferries) are edited in the app. The only alerting vessel in the demo is a labeled synthetic one; no real boat is accused.

Live: https://wwu-sj-hack.vercel.app (sign in with the demo password; the presenters have it)

## Run it

    pnpm install && pnpm dev      # http://localhost:3000; needs Node 24 and pnpm

Node 24: https://nodejs.org. pnpm: `npm i -g pnpm` or https://pnpm.io/installation.

The site opens on a sign-in screen: any username, and the password set as `LVT_DEMO_PASSWORD` in `apps/web/.env.local` (and in Vercel's environment for the live site). It is a demo gate, not accounts.

Email alerts need a free [Resend](https://resend.com) key in `apps/web/.env.local` as `RESEND_API_KEY=...`; the test sender only delivers to the Resend account owner's inbox.

Live mode needs the streamer running: `cd apps/streamer && uv sync && AIS_API_KEY=... uv run python -m streamer` (see `apps/streamer/README.md`); the web app reads it at `http://127.0.0.1:8787`, or at `NEXT_PUBLIC_STREAMER_URL` if set.

The data the app reads is committed at `apps/web/public/data.json`. Regenerating it needs [uv](https://docs.astral.sh/uv/), which fetches Python itself: `cd data && uv sync && uv run build.py`.

`make setup`, `make dev`, `make data`, `make fmt` and `make check` wrap these; `docs/SETUP.md` has the from-scratch version.

## Where the data comes from

`data/NOTES.md`: sources, cleaning, and what the data cannot tell you.

## How it was built

`docs/SPEC.md` is the problem and scope, `docs/DECISIONS.md` the choices and why, `docs/HACKATHON.md` the plan. The scaffold (tooling, an empty page, two sample rows) was set up on Nov 4, before the event; everything the user sees was built on Nov 7, and the commit history shows the line. Skyler Simpson, Nathan, Luke and Willow Hughes, with Claude Code as a pair programmer; the app itself runs no AI.
