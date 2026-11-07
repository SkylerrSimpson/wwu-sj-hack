# Spec

Filled in at kickoff, Sat Nov 7 2026. One page. Everything below the demo script is reference.

## Problem

In the challenge's words (Devpost, WWU Social Justice Hackathon 2026, Challenge 1): "Lummi fishermen hold treaty-guaranteed rights to harvest in their usual and accustomed grounds and waters. However, non-tribal fishing vessels frequently enter exclusive Lummi waters illegally, undermining these rights. Developing a tool to monitor Lummi waters will empower law enforcement to safeguard tribal rights and protect their local ecosystem." The goal set: "a monitoring system for tracking vessels entering, leaving and anchoring-in Lummi waters", combining vessel tracking data with Lummi data such as an approved vessel list.

The Nation's representative: FILL AT KICKOFF, with their OK to be quoted here; otherwise their role only, paraphrased.

## The one user

A Lummi Natural Resources enforcement officer (TO CONFIRM at kickoff: or a Lummi Nation Police fisheries officer). Today they see a vessel from the patrol boat or the shore, note it by hand, and refer a non-member case on to WDFW, the county sheriff or the Coast Guard, because tribal officers' citations of non-Indians go to Washington courts (RCW 10.92). They have no record of who was in the waters while nobody was watching.

## Demo script

Ninety seconds, pre-recorded.

1. The page opens on the banner ("Approved list invented for this demo; no vessel shown is suspected of anything.") and the summary: "Lummi waters, Sat Sep 14, 5 PM to Sun Sep 15, 5 PM, 2024 (recorded): 1 visit not on the approved list; 3 approved vessels, 31 visits; 0 moored."
2. The flagged visit sits on top as a card: "Demo vessel (synthetic), fishing vessel, 21 m. Crossed in 5:12 AM, anchored 47 min, left 6:40 AM. No AIS received for 12 min. Not on the approved list. Self-reported AIS: corroborate before acting."
3. Clicking it opens the visit's page: the map shows the boundary and the track crossing into it; below, the referral record lists entered, left, anchored, longest gap, source, in Pacific and UTC.
4. Back on the list, approved vessels are one line each: "Ferry, 32 m, approved by agreement: 26 visits, 1 h 39 min inside." On every page: the sources with their retrieved dates, "approximate boundary (Census; WDFW closure line), not a legal boundary", and "Most fishing and recreational boats under 65 ft don't carry AIS; no flag does not mean no unapproved boat was there."

## Out of scope

- A live AIS feed: it needs a server and a key that can fail mid-demo; the visit rules don't change when it's added.
- Alerts to an officer's phone: they need the live feed.
- Satellite radar for vessels with AIS off: another source and a token; the "next" slide.
- Editing the approved list in the app: a database; the Nation edits a CSV and the pipeline rebuilds.
- Real vessel identities: the repo and `/data.json` are public, and the approved list is invented.
- A nautical chart basemap: the NOAA tile endpoint is untested.
- A second language: not in the demo script.

## Data

| Source                                  | Publisher, freshness, terms                                   | Why                                                                                                                                                                                          |
| --------------------------------------- | ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AIS daily file, one-minute fixes, UTC   | NOAA/BOEM MarineCadastre, 2024 daily files, CC0 public domain | The only free, bulk, public vessel positions; one recorded day is reproducible and needs no service                                                                                          |
| Lummi Reservation boundary, GEOID 2070R | US Census TIGERweb, statistical boundary, free with credit    | Includes the tidelands (about 43 km² of water); its west edge follows WDFW's closure line from Gooseberry Point to Sandy Point; the Nation's own layer may not be reproduced without consent |
| Approved vessel list                    | Ours, invented for the demo                                   | The real list is the Nation's; ours includes every real vessel seen, so only the synthetic vessel is flagged                                                                                 |
| Synthetic demo vessel                   | Ours                                                          | A flagged visit that accuses nobody                                                                                                                                                          |

Record fields, and why: `entered`, `left`, `entry`, `exit` answer "who was here, when" without a fake time at the file's edges; `anchored_minutes` is the challenge's "anchoring-in"; `longest_gap_min` is evidence quality; `approved` is the Lummi data; `track` only for flagged visits, because where Lummi boats work is Lummi's data; `name` is a pseudonym; `vessel_type` and `length_m` say what kind of boat. Top level: `boundary` (a bare ring plus its source), `window`, `moored_count`. The contract is `data/schema.json`.

## Shape

- `/`: the summary, flagged visits as cards, one line per approved vessel. Server component.
- `/visits/[id]`: one visit, generated statically; the referral record, and the map for flagged visits.
- `layout.tsx`: banner, caveats, provenance footer, on every page.
- `lib/data.ts`: `Visit`, `Source`, `Data`, `data`, `sourceOf`.
- `lib/visit.ts`: `flagged(visits)`, `byVessel(visits)`, `summary(data)`, `formatTime(iso)`, `duration(visit)`.
- `components/VisitMap.tsx`: client component; `ring`, `track`, `label` in, Leaflet map out.
- The browser remembers nothing between clicks.

## Risks and safeguards

| Risk to the user or community             | Safeguard we built                                                                                                                     | Where (file or screen)                               |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| Acting on wrong or outdated information   | Every record names its source and retrieval date, shown next to the data; the window and year are on screen so nobody reads it as live | `data/schema.json`, `layout.tsx` footer, `/` summary |
| A lawful vessel is treated as a wrongdoer | "Not on the approved list", never "illegal"; reasons shown; "corroborate before acting"; only the synthetic vessel is flagged          | Visit card, `/visits/[id]`                           |
| False statements about real vessels       | Identities stripped in `fetch()` before anything is saved; every real vessel is on the approved list; banner says the list is invented | `data/build.py`, `layout.tsx`                        |
| The approximate boundary misleads         | Labeled with both sources and "not a legal boundary"                                                                                   | `VisitMap` caption                                   |
| Vessels without AIS are invisible         | The coverage line on every page; the real-day count (1 to 3 vessels) in `NOTES.md`                                                     | `layout.tsx`, `data/NOTES.md`                        |
| Surveillance of Lummi boats               | Approved vessels appear as counts, no tracks published; the real list and outputs belong to the Nation                                 | `data/build.py`, slides                              |
| Weak evidence                             | Each record lists fixes, gaps and "self-reported AIS"                                                                                  | `/visits/[id]`                                       |
| Retention                                 | Only the reduced, de-identified extract is kept                                                                                        | `data/raw/`, `data/NOTES.md`                         |
| AI environmental cost                     | Development token totals times a cited energy figure on a slide; the app runs no AI                                                    | Slides                                               |

## Glossary

- **Lummi waters**: the boundary polygon.
- **Vessel**: one AIS transmitter, shown by its pseudonym.
- **Visit**: a run of fixes inside Lummi waters; runs less than 10 minutes apart merge.
- **Approved list**: vessels allowed inside; invented for the demo.
- **Flagged**: a visit by a vessel not on the approved list.
