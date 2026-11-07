# Spec: Lummi Vessel Tracker

Decided by the team at kickoff, Sat Nov 7 2026. One page. Everything below the demo script is reference.

## Problem

In the challenge's words (Devpost, WWU Social Justice Hackathon 2026, Challenge 1): "Lummi fishermen hold treaty-guaranteed rights to harvest in their usual and accustomed grounds and waters. However, non-tribal fishing vessels frequently enter exclusive Lummi waters illegally, undermining these rights. Developing a tool to monitor Lummi waters will empower law enforcement to safeguard tribal rights and protect their local ecosystem." The goal set: "a monitoring system for tracking vessels entering, leaving and anchoring-in Lummi waters", combining vessel tracking data with Lummi data such as an approved vessel list.

The Nation's representative: FILL AT KICKOFF, with their OK to be quoted here; otherwise their role only, paraphrased.

## The one user

A Lummi Natural Resources enforcement officer (TO CONFIRM: or a Lummi Nation Police fisheries officer). Today they spot vessels from a patrol boat or the shore, and nobody watches the waters the rest of the time. A case against a non-member goes on to Washington authorities (RCW 10.92), so what they need is a timely alert and a record, not a verdict.

## Demo script

Ninety seconds, pre-recorded.

1. The officer opens Lummi Vessel Tracker: a map of Lummi waters with the reservation boundary outlined and every ship as a dot, from five recorded days of AIS (Dec 5 to 9 2024). A banner says "Priority list invented for this demo; no vessel shown is suspected of anything."
2. They press play and the ships move. Priority vessels (the Lummi Island ferry, a patrol boat) carry a badge. Hovering a dot shows a commercial vessel's name, or a private boat's type and length, and whether it's on the priority list.
3. Their email is saved in the alerts panel. A labeled synthetic vessel, not on the priority list, crosses into Lummi waters. The alert log shows it, and an email arrives: "A vessel not on the priority list entered Lummi waters: Demo vessel (synthetic), 5:12 AM, 48.76 N 122.66 W. Self-reported AIS: corroborate before acting."
4. On screen throughout: each data source with its date, "Approximate boundary, not a legal boundary", and "Most fishing and recreational boats under 65 ft don't carry AIS; no alert does not mean no unapproved boat was there."

## Out of scope

- A live AIS feed: it needs a long-running server; the replay runs the same rules on recorded data.
- Editing the priority list in the app: it needs a database; it's a file the Nation would edit.
- Accounts, a database, text messages: the email address stays in the browser.
- Google Maps: it needs a billing account and a key; Leaflet with OpenStreetMap gives the same top-down view.
- A watch zone outside the boundary (the tugs anchoring at the north-west edge): a slide, not a feature.
- Satellite radar for boats with AIS off: the "next" slide.

## Data

| Source                                                                      | What it is                                                                                                | Why                                                                                                 |
| --------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| The event's AIS file (`data/lummifiles/AIS_…csv`)                           | Five days, Dec 5 to 9 2024 UTC, 219,863 positions, 224 vessels, NOAA MarineCadastre format, public domain | The vessel positions; recorded, so the demo can't fail                                              |
| The event's boundary (`data/lummifiles/Lummi_Reservation_Boundary (1).kml`) | One ring, 132 points, about 24,068 acres                                                                  | Lummi waters. On all 219,863 positions it agrees with the Census Bureau's reservation polygon.      |
| The priority list                                                           | Ours, invented for the demo: the ferry, the patrol boat                                                   | The real list is the Nation's                                                                       |
| One synthetic vessel                                                        | Ours, labeled                                                                                             | Real data has no non-priority vessel entering; this one shows an alert without accusing a real boat |

The contract is `data/schema.json`. `data.json` holds:

- `sources`: each with `id`, `name`, `url`, `retrieved`
- `window`: `start` and `end`, ISO UTC
- `boundary`: `source` and `ring`, a list of `[lon, lat]`
- `vessels`: each with `id`, `source`, `name`, `type` (in words), `length_m` (number or null), `priority` (true or false), and `track`, a list of `[time, lon, lat]` with time in Unix seconds, one position per 5 minutes, duplicates removed

Commercial vessels keep their AIS name. Private boats (AIS types 36 and 37) are named by type and length only, such as "Pleasure craft, 10 m", because `data/AGENTS.md` keeps personal data out of `data.json`.

## Shape

- `/` (`app/page.tsx`, Skyler): the map, the replay controls, the alerts panel, and the banner, caveats and sources in `app/layout.tsx`.
- `components/Replay.tsx` (Skyler): client; `<Replay data={data} />`; runs the clock, calls `newEntries` each tick, renders the map, the sources, and passes new entries to the alerts panel.
- `components/ShipMap.tsx` (Skyler): client; Leaflet and OpenStreetMap, the boundary, one dot per vessel at the clock's time.
- `lib/data.ts` (Skyler): the `data.json` types.
- `lib/vessel.ts` (Nathan), each function tested first:
  - `positionAt(track, t)` → `[lon, lat]` or `null`: the last position at or before `t`; `null` before the first, or more than 30 minutes after the last
  - `isInside(lon, lat, ring)` → `boolean`
  - `newEntries(vessels, ring, from, to)` → `Entry[]`: each position of a non-priority vessel with time in (`from`, `to`] that is inside, where the vessel's previous position was outside. `Entry` is `{ vesselId, name, t, lon, lat }`.
- `app/actions.ts` (Luke): `sendAlert(to, entry)` → `{ ok: true }` or `{ ok: false, error }`; a server function; checks the address, sends through Resend.
- `components/AlertPanel.tsx` (Luke): client; `<AlertPanel entries={newEntries} />`; the email box, saved in the browser; one email per new entry; a test button; the alert log.
- The browser remembers: the alert email (local storage) and the replay time (in memory).

## Risks and safeguards

| Risk to the user or community               | Safeguard we built                                                                                                                     | Where (file or screen)                                    |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| Acting on wrong or outdated information     | Every source named with its date; the replay shows its date, so nobody reads it as live                                                | `data/schema.json`, `app/layout.tsx` footer, replay clock |
| A lawful vessel is treated as a wrongdoer   | Alerts say "not on the priority list", never "illegal"; every alert says "corroborate before acting"; only the synthetic vessel alerts | `app/actions.ts` email text, `AlertPanel`                 |
| Real boats accused against an invented list | Banner says the list is invented; the only alerting vessel is synthetic and labeled                                                    | `app/layout.tsx`, `data/build.py`                         |
| Private boat owners identified              | Private boats shown by type and length only                                                                                            | `data/build.py`                                           |
| The approximate boundary misleads           | Labeled "approximate, not a legal boundary"                                                                                            | `app/layout.tsx`, the map                                 |
| Boats without AIS are invisible             | The coverage line on screen                                                                                                            | `app/layout.tsx`                                          |
| The alert form is abused to send spam       | The address is checked; Resend's test sender delivers only to the account owner's inbox                                                | `app/actions.ts`                                          |
| AI environmental cost                       | Development token totals and an energy estimate on a slide; the app runs no AI                                                         | Slides                                                    |

## Glossary

- **Lummi waters**: the boundary polygon.
- **Vessel**: one AIS transmitter (MMSI) and its track.
- **Priority list**: vessels that never alert; invented for the demo.
- **Entry**: a non-priority vessel's first position inside Lummi waters after one outside.
- **Alert**: the email and log line one entry produces.
