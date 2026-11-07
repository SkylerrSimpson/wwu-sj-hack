# Delegation: four people who don't step on each other

Confirmed by Skyler at 09:30 on 2026-11-07 after a grilling round. Changes from the first draft: no pairing, the map starts at T+0:30, Willow's first landing is a pass-through pipeline, every real vessel is on the approved list, approved vessels are summarised on the home page, Luke starts the slides at T+2:30, Vercel is a T−1:00 task.

**People and GitHub logins:**

- **Skyler** (`SkylerrSimpson`): lead, integration, the hardest web work, presenter.
- **Nathan** (`Ndearing4`): core logic and the home page.
- **Luke** (`LukeSheely`): layout, the visit page, then slides and pitch doc.
- **Willow** (`willowhughes`): everything in `data/`, presenter.

All three invites were pending at 09:30. They must accept before T+0, or `gh issue create -a` fails. Fallback: create the issue without `-a`, then `gh issue edit <n> --add-assignee <login>` once they've accepted.

**The rule that prevents collisions:** every file has exactly one owner, and only the owner commits it. The seams between people are agreed once, at T+0:45: the data contract (`schema.json` ↔ `data.ts`), the `visit.ts` function signatures, and `VisitMap`'s props. After that, nobody waits on anybody.

This is checked against `agents/standards.md`: "something used once is inlined, except core logic." So the banner and caveats live in `layout.tsx`, the visit cards in `page.tsx`, the referral record in the visit page. The only extra files are `lib/visit.ts` (core logic, with tests) and `VisitMap.tsx`, which must be its own file because it's a client component.

## The app, and who owns each part

```
NOAA AIS + Census boundary ─► data/build.py (Willow) ─► public/data.json (Willow) ─► lib/data.ts (Skyler)
                                                                                        │
                                                      lib/visit.ts (Nathan, test-first) ◄┘
  every page        app/layout.tsx: banner, caveats, provenance ............ Luke
  the list "/"      app/page.tsx: summary, flagged cards, approved lines ... Nathan
  one visit         app/visits/[id]/page.tsx: referral record .............. Luke
                    components/VisitMap.tsx: the map (client) .............. Skyler
```

To a judge: "Public ship data → our script finds visits inside Lummi waters → a webpage lists them, flagged first → click one to see its map and a record an officer can hand on."

## File ownership (this table goes into `AGENTS.md` at T+0; the draft is in `t0-commit/AGENTS.md`)

| File(s)                                                       | Owner  | Notes                                                                                                               |
| ------------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------- |
| `data/**`, `apps/web/public/data.json`                        | Willow | `data/AGENTS.md` rules apply                                                                                        |
| `docs/SPEC.md`, `AGENTS.md`, `README.md`, `docs/HACKATHON.md` | Skyler | Others suggest; Skyler edits                                                                                        |
| `apps/web/package.json`, `pnpm-lock.yaml`, `components/ui/**` | Skyler | All dependencies in **one** commit at T+0:15: `leaflet`, `@types/leaflet`, shadcn `badge`. Need more? Ask Skyler.   |
| `apps/web/src/lib/data.ts` + `data.test.ts`                   | Skyler | Mirrors `schema.json`; changes only after Willow lands a schema change                                              |
| `apps/web/src/components/VisitMap.tsx`                        | Skyler | The only client component                                                                                           |
| `apps/web/src/lib/visit.ts` + `visit.test.ts`                 | Nathan | Test-first with `/mattpocock-skills:tdd`                                                                            |
| `apps/web/src/app/page.tsx`                                   | Nathan | Luke touches it once, at T+0:15, to move the footer into the layout, before Nathan starts on it                     |
| `apps/web/src/app/layout.tsx`                                 | Luke   | Banner, caveats, provenance, metadata                                                                               |
| `apps/web/src/app/visits/[id]/page.tsx`                       | Luke   | Static params plus the referral record. Renders Skyler's `<VisitMap>` once it lands, with a placeholder until then. |
| `docs/DECISIONS.md`                                           | anyone | Append only; on a conflict, keep both lines                                                                         |

## Interfaces (agreed at T+0:45; to change one, tell the other side first)

- **The data contract** is `LUMMI-PREP.md` › Draft schema. `data.ts` exports `Visit`, `Source`, `Data`, `data` and `sourceOf`.
- **`lib/visit.ts`**, pure functions, each with tests:
  - `flagged(visits: Visit[]): Visit[]`: not approved, ordered by `entered`
  - `byVessel(visits: Visit[]): { name: string; vesselType: string; lengthM: number | null; visits: number; insideMinutes: number }[]`: one line per approved vessel
  - `summary(d: Data): { visits: number; flagged: number; approvedVessels: number; moored: number }`
  - `formatTime(iso: string): string`: America/Los_Angeles, for example "Sun Sep 15, 5:12 AM"
  - `duration(v: Visit): string`: "47 min" or "1 h 28 min"
- **`VisitMap({ ring, track, label }: { ring: number[][]; track: number[][]; label: string })`**: a client component with an explicit height.
- Pages import `@/lib/data` and pass props. `VisitMap` never imports data.
- Luke's visit page uses `formatTime` and `duration`, so **`visit.ts` lands by T+1:30**.

## Schedule (relative)

Two anchors:

- **T** is when coding starts. The plan is 10:00, but it slips if teams form late.
- **D** is the submit deadline, 16:00. It never moves.

The first half runs from T. The second half counts back from D. If T slips, squeeze the middle using the cut list in `AUDIT.md`. Never squeeze the end. Each **gate** is a check everyone stops for: walk the live URL together for two minutes.

| When               | Skyler                                                                                                                                                                           | Nathan                                                                                                | Luke                                                                                       | Willow                                                                                                                   |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| T−1:00             | **Vercel** (never done): import the repo, Root Directory `apps/web`, Production Branch `main`, Node 24. Then the challenge, rep questions (`LUMMI-PREP.md`), a fast `/grilling`. | Accept the GitHub invite. Install plugins (`claude-team-setup.txt`), clone, `make setup`, `make dev`. | Same as Nathan                                                                             | Accept the invite, `make setup`, read `data/AGENTS.md`, ask the rep the data questions                                   |
| T+0:00             | Paste and land the pre-drafted commit (`t0-commit/`). Create the issues.                                                                                                         | Read AGENTS.md, standards, SPEC                                                                       | Same                                                                                       | Open the `schema: visits` issue; Skyler comments `agreed`                                                                |
| T+0:15             | The dependency commit                                                                                                                                                            | **`visit.ts` test-first** against the draft `Visit` type, fixtures in the test                        | **Layout slice**: banner, caveats, provenance, metadata; move the footer out of `page.tsx` | `schema.json`, a pass-through `build.py` reading `data/raw/sample-visits.json` (four visits, one synthetic), tests green |
| T+0:30             | **`VisitMap` starts** (needs only leaflet; the traps are in `research/architecture.md`)                                                                                          |                                                                                                       |                                                                                            |                                                                                                                          |
| T+0:45             | **`data.ts` within 10 minutes of Willow's commit**                                                                                                                               |                                                                                                       | Land the layout                                                                            | **Land schema + sample `data.json`**                                                                                     |
| **Gate 1, T+1:00** | **The live site shows the sample visits with the banner. Everyone is unblocked.**                                                                                                |                                                                                                       |                                                                                            |                                                                                                                          |
| T+1:00             | `VisitMap`                                                                                                                                                                       | Land `visit.ts` by T+1:30, then the **home page**                                                     | **Visit page**: static params, referral record, map placeholder                            | **`fetch()`**: stream the day, strip identities, save the boundary                                                       |
| T+2:00             | Land `VisitMap`; help Luke wire it in                                                                                                                                            | Home page lands                                                                                       | Visit page lands with the real map                                                         | **Visit rules test-first**, approved list, synthetic vessel                                                              |
| T+2:30             | Review landings                                                                                                                                                                  | Accessibility, wording, mobile                                                                        | **Slides and pitch doc** from `TALKING-POINTS.md`                                          |                                                                                                                          |
| **Gate 2, T+3:00** | **Click-through works live: list → flagged visit → map → record**                                                                                                                |                                                                                                       |                                                                                            |                                                                                                                          |
| T+3:00             | Integrate, polish, walk the demo                                                                                                                                                 | Helps Luke with slides                                                                                | Slides                                                                                     | **Real `data.json` lands** (same schema), then `NOTES.md`                                                                |
| **Gate 3, D−2:15** | **Real data is live, or ship the sample labeled "sample" and put the real-data finding on a slide**                                                                              |                                                                                                       |                                                                                            |                                                                                                                          |
| **D−2:00**         | **Freeze.** `/mattpocock-skills:code-review` against `90ab845`; each finding becomes a bug issue; then fixes only                                                                | Fixes from the review                                                                                 | Slides                                                                                     | The data story slide (AIS sees 1 to 3 vessels a day; the ferry crosses 26 times)                                         |
| D−1:30             | README for strangers, environmental estimate line, secret scan, make the repo public, Devpost form                                                                               | Record the 90-second demo                                                                             | Finish slides and pitch doc                                                                | Rehearse the Q&A with Skyler                                                                                             |
| **Gate 4, D−0:30** | **Submit: live URL, repo, slides with the video, pitch doc**                                                                                                                     |                                                                                                       |                                                                                            |                                                                                                                          |
| D+0:05             | Pitch                                                                                                                                                                            |                                                                                                       |                                                                                            | Pitch                                                                                                                    |

**Presenters:** Skyler (architecture and web) and Willow (data, AIS coverage, ethics). Luke drafts the slides; the presenters refine what they'll say.

**When a gate slips:**

- **Gate 1:** web devs keep building against hand-written sample visits in their own tests. Willow's sample `data.json` comes before anything else.
- **Gate 2:** cut the map. Show the record without it; a server-drawn SVG of the boundary and track can replace it if there's time.
- **Gate 3:** cut real data from the app, not from the pitch.

**Nothing live.** The data is a recorded day, the demo is pre-recorded, and the app makes no runtime calls except map tiles.

## Rules for the day

1. Commit only files you own. Use `git add <your files>`, never `git add -A`.
2. Land small and often with the line from AGENTS.md. If the push is rejected, run it again. Never force-push.
3. After each landing, open the live URL and walk the demo.
4. Each person's Claude gets one prompt: **"Work issue #N test-first with /mattpocock-skills:tdd. Only touch the files you own (AGENTS.md › Ownership)."**
5. Stuck for 15 minutes? Ask the other undergrad. Stuck for 30, or 3 red `make check` runs in a row? Shout. Skyler splits or cuts the slice.

## Issues (Skyler runs these at T+0:00)

Seven slices plus one schema issue: under the cap of 8 open slices, each under 2 hours, each one sentence you could watch happen in the demo.

```sh
gh issue create -l slice -a SkylerrSimpson -t "Set up the one-day plan and the live site" -b "$(cat <<'EOF'
### In the demo
The live URL opens on the real title.
### Done when
- [ ] SPEC.md filled from prep; AGENTS.md ownership table for four people; schedule fixed to one day
- [ ] leaflet, @types/leaflet and shadcn badge in one commit, with a decision line
- [ ] Vercel deploys main; README Live: line is real
### Why it matters
Everyone, and every agent, works from the same plan.
### Out of scope
Features.
EOF
)"
gh issue create -l slice -a willowhughes -t "The data file holds a recorded NOAA day with identities stripped" -b "$(cat <<'EOF'
### In the demo
The footer names NOAA and Census with their retrieved dates.
### Done when
- [ ] fetch() streams one daily file, keeps the box, drops names, IMO and call sign, maps each MMSI to V001…, and saves to data/raw/
- [ ] Census boundary saved to data/raw/ and published as a bare ring with its source
### Why it matters
It's real data, and no real vessel is identified.
### Out of scope
Live feeds, more than one day.
EOF
)"
gh issue create -l slice -a willowhughes -t "The page shows real visits with entry, exit and anchoring" -b "$(cat <<'EOF'
### In the demo
The summary counts come from the real day, plus one synthetic flagged vessel.
### Done when
- [ ] Visit rules from the prep architecture doc, each test-first (merge under 10 min, inside at start/end, gaps, anchored, moored)
- [ ] The fictional approved list includes every real vessel seen (ferry: approved by agreement); only the synthetic vessel, in its own source, is unlisted
- [ ] NOTES.md: sources, cleaning, the approved-list rule, the moored-at-Sandy-Point false-result example
### Why it matters
Each rule is explainable and tested, and no real boat is accused against an invented list.
### Out of scope
Satellite or radar sources.
EOF
)"
gh issue create -l slice -a LukeSheely -t "Every page says the list is invented, what AIS can't see, and where the data came from" -b "$(cat <<'EOF'
### In the demo
The banner and caveats are visible on every page.
### Done when
- [ ] Banner: "Approved list invented for this demo; no vessel shown is suspected of anything."
- [ ] Caveats: "Most fishing and recreational boats under 65 ft don't carry AIS; no flag does not mean no unapproved boat was there." Boundary: "approximate (Census; WDFW closure line), not a legal boundary." Each source with its retrieved date.
- [ ] Real metadata title and description; footer moved from page.tsx into layout.tsx
### Why it matters
These are safeguards the judges can see.
### Out of scope
A second language.
EOF
)"
gh issue create -l slice -a Ndearing4 -t "The home page lists flagged visits first and summarises approved vessels" -b "$(cat <<'EOF'
### In the demo
The page opens on "1 visit not on the approved list; 3 approved vessels, 31 visits; 0 moored", with the flagged visit as a card on top and one line per approved vessel below ("Ferry, 32 m, approved by agreement: 26 visits, 1 h 39 min inside").
### Done when
- [ ] lib/visit.ts with flagged, byVessel, summary, formatTime and duration, written test-first
- [ ] Flagged card: name, type, length, times in Pacific, duration, "Not on the approved list" as text plus a badge (not colour alone), linking to /visits/[id]
- [ ] Usable on a phone; keyboard focus visible
### Why it matters
Officers see what matters first, and 26 ferry crossings don't bury it.
### Out of scope
Filters, search.
EOF
)"
gh issue create -l slice -a LukeSheely -t "A visit's page reads as a referral record an officer can hand on" -b "$(cat <<'EOF'
### In the demo
Clicking a visit opens its record: entered, left, anchored, longest gap, "self-reported AIS: corroborate before acting", source.
### Done when
- [ ] /visits/[id] generated statically for every visit (generateStaticParams, dynamicParams = false; params is a Promise in Next 16)
- [ ] The record as a definition list, every time in Pacific and UTC; prints cleanly (Tailwind print: variants)
- [ ] Renders <VisitMap> for flagged visits; others say "approved; track not published"
### Why it matters
Tribal officers refer non-Indian cases on to Washington courts (RCW 10.92), so the output is a record, not a verdict.
### Out of scope
PDF export, sending.
EOF
)"
gh issue create -l slice -a SkylerrSimpson -t "A flagged visit's map shows its track crossing into Lummi waters" -b "$(cat <<'EOF'
### In the demo
The map shows the boundary and the track crossing into it.
### Done when
- [ ] VisitMap: Leaflet 1.9.4 imported in an effect, leaflet.css loads, explicit height, OSM attribution, ring and track, fit to bounds
- [ ] Survives Strict Mode (map.remove cleanup); aria-label plus a text summary next to it
### Why it matters
It's the moment the judges remember.
### Out of scope
Animation, NOAA charts, an overview map.
EOF
)"
```

Willow opens the schema issue (Skyler comments `agreed`):

```sh
gh issue create -l schema -t "schema: visits, boundary, window, moored_count" -b "$(cat <<'EOF'
Records become visits (one continuous stay inside Lummi waters) and three top-level fields are added. The data side lands first as a pass-through build.py from data/raw/sample-visits.json, then data.ts.

Visit: id, source, name, vessel_type (string), length_m (number|null), approved (boolean), entered, left (both "^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}(:\\d{2})?Z$", always set), entry ("crossed"|"inside at start"), exit ("crossed"|"inside at end"), anchored_minutes, longest_gap_min (integer >= 0), track (number[][], only when approved is false).
Top level: boundary { source, ring: number[][] }, window { start, end }, moored_count (integer >= 0).
EOF
)"
```
