# Spec: Lummi Vessel Tracker

Decided by the team at kickoff, Sat Nov 7 2026. One page. Everything below the demo script is reference.

## Problem

In the challenge's words (Devpost, WWU Social Justice Hackathon 2026, Challenge 1): "Lummi fishermen hold treaty-guaranteed rights to harvest in their usual and accustomed grounds and waters. However, non-tribal fishing vessels frequently enter exclusive Lummi waters illegally, undermining these rights. Developing a tool to monitor Lummi waters will empower law enforcement to safeguard tribal rights and protect their local ecosystem." The goal set: "a monitoring system for tracking vessels entering, leaving and anchoring-in Lummi waters", combining vessel tracking data with Lummi data such as an approved vessel list.

The Nation's representative: FILL AT KICKOFF, with their OK to be quoted here; otherwise their role only, paraphrased.

## The one user

A Lummi Nation official: Natural Resources staff or an enforcement officer (TO CONFIRM with the rep). Today they spot vessels from a patrol boat or the shore, and nobody watches the waters the rest of the time. A case against a non-member goes on to Washington authorities (RCW 10.92), so what they need is a timely alert and a record, not a verdict.

## Demo script

Ninety seconds, pre-recorded.

1. A Lummi Nation staff member opens Lummi Vessel Tracker: a map of Lummi waters with the reservation boundary outlined and every ship as a dot, from five recorded days of AIS (Dec 5 to 9 2024), coloured by status with the status in the hover text. Beside it, "In Lummi waters now": one row per kind of vessel, for example "Whatcom County ferry: 1", "Law enforcement, listed: 1", "Pleasure craft: 2". A banner says "Approved list invented for this demo; no vessel shown is suspected of anything."
2. They press play. The clock runs in Pacific time, the dots move, the table updates.
3. A labeled synthetic vessel, on neither list, crosses into Lummi waters: its dot turns suspicious, the alert log shows it, and an email arrives at the user's saved address: "A vessel not on the approved list entered Lummi waters: Demo vessel (synthetic), Thu Dec 5, 5:30 AM PST, 48.77 N 122.70 W. Self-reported AIS: corroborate before acting."
4. The user clicks the dot and adds it to the watch list. The vessel leaves and crosses in again an hour later, at 6:30 AM PST: "A vessel on your watch list entered Lummi waters: ...".
5. On screen throughout: each data source with its date, "Approximate boundary, not a legal boundary", and "Most fishing and recreational boats under 65 ft don't carry AIS; no alert does not mean no unapproved boat was there."

## Out of scope

- A live AIS feed: it needs a long-running server; the replay runs the same rules on recorded data.
- Editing the priority list in the app: it needs a database; it's a file the Nation would edit.
- Accounts, a database, text messages: the email address stays in the browser.
- Google Maps: it needs a billing account and a key; Leaflet with OpenStreetMap gives the same top-down view.
- A watch zone outside the boundary (the tugs anchoring at the north-west edge): a slide, not a feature.
- Satellite radar for boats with AIS off: the "next" slide.

## Data

| Source                                                                                                      | What it is                                                                                                                                | Why                                                                                                                                                                     |
| ----------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The event's AIS file (`data/lummifiles/AIS_…csv`, committed reduced as `data/raw/ais-2024-12-05-to-09.zip`) | Five days, Dec 5 to 9 2024 UTC, 219,863 positions, 224 vessels, NOAA MarineCadastre format, public domain                                 | The vessel positions; recorded, so the demo can't fail                                                                                                                  |
| The event's boundary (`data/raw/lummi-reservation-boundary.kml`)                                            | One ring, 132 points, about 24,068 acres                                                                                                  | Lummi waters. On all 219,863 positions it agrees with the Census Bureau's reservation polygon.                                                                          |
| The approved patterns and list                                                                              | `XWL`, `WSF`, `SWN`, `NKK` in an AIS name or call sign (the PM's rule), plus an explicit list: the Lummi Island ferry and the patrol boat | Known vessels that never alert; the Nation would own the real list                                                                                                      |
| One synthetic vessel                                                                                        | Ours, labeled                                                                                                                             | Real data has no non-priority vessel entering; this one crosses in twice, so the demo shows a suspicious alert and then a watch-list alert without accusing a real boat |

The contract is `data/schema.json`. `data.json` holds:

- `sources`: each with `id`, `name`, `url`, `retrieved`
- `window`: `start` and `end`, ISO UTC
- `boundary`: `source` and `ring`, a list of `[lon, lat]`
- `vessels`: each with `id`, `source`, `name`, `type` (in words), `length_m` (number or null), `callsign` ("" when unknown or private), `fleet` ("Whatcom County ferry" or "Law enforcement, listed" for the two vessels on the explicit list, else null), `priority` (true exactly when `fleet` is set), and `track`, a list of `[time, lon, lat]` with time in Unix seconds, one position per 5 minutes, duplicates removed

Private boats (sailing, pleasure craft and fishing, AIS types 36, 37 and 30) are anonymised: named by type and length, such as "Fishing, 24 m", with ids `private-1`, `private-2`, and so on; the committed raw file has their names, IMO and call signs blanked. Tugs, ferries, cargo ships and tankers keep their AIS names. `data/AGENTS.md` keeps personal data out of the public files.

## Shape

- `/` (`app/page.tsx`): the map, the controls, the table, the lists panel and the alerts panel, with the banner, caveats and sources in `app/layout.tsx`.
- `components/Replay.tsx`: client; `<Replay data={data} />`. Owns the clock (`t`, `playing`, `speed`), the user's configuration (local storage), the selected vessel and the entries. It turns the configuration into `Lists` with `lib/config` before asking `lib/vessel` anything. Every 250 ms while playing it advances `t` by `speed / 4`, asks `lib/vessel` for positions, the in-water summary and new entries over `(prevT, t]` (prevT held in a ref, so re-renders and scrubbing never re-fire), and hands entries to the alerts panel.
- `components/ShipMap.tsx`: client; `{ ring, ships, onSelect }`; Leaflet on a canvas renderer, one marker per vessel moved in place each tick, coloured by status with the status in the tooltip; clicking a dot selects it.
- `components/ConfigPanel.tsx`: client; `{ vessels, config, selected, onSelect, onChange }`; built from shadcn Card, Table, Input, Label, Button and Badge: the trusted patterns (text and label; add, delete), the approved vessel ids and the watch list (add the selected vessel or a typed id; delete). Everything the user can change lives here and is saved in the browser.
- `components/AlertPanel.tsx`: client; `{ entries }`; the email box (validated, saved in the browser), "Send test alert", one email per entry keyed by vessel and time, a log of every attempt and its result.
- `app/actions.ts`: `sendAlert(to, entry)` → `{ ok: true } | { ok: false, error }`; a server function; checks the address, sends through Resend with wording by status.
- `lib/data.ts`: the `data.json` types.
- `lib/config.ts`, each function tested first: the user's configuration.
  - `Config = { patterns: { text: string; label: string }[]; priority: Set<string>; watch: Set<string> }`
  - `DEFAULT_CONFIG`: patterns XWL "Lummi Nation", WSF "Washington State Ferries", SWN "Swinomish", NKK "Nooksack"; empty lists
  - `matchedPattern(v, patterns)` → the first pattern whose text appears in the vessel's name or call sign, case-insensitive, or null
  - `listsFor(vessels, config)` → `Lists` for `lib/vessel`: the user's priority ids plus every vessel a pattern matches, and the watch ids
  - `labelOf(v, config)` → the data's `fleet`, else the matched pattern's label, else "Priority, approved by the user" when on the priority list, else the vessel type
  - `parseConfig(text)` → `Config` or null, and `serializeConfig(config)` → text, for local storage
- `lib/vessel.ts`, each function tested first:
  - `Lists = { priority: Set<string>; watch: Set<string> }`: the user's additions by vessel id
  - `vesselStatus(v, lists)` → `"priority" | "watch" | "unlisted"`: watch if on the watch list; else priority if `v.priority` (the data's explicit list) or on the priority list (which `lib/config` has already filled from the patterns); else unlisted
  - `isInside(lon, lat, ring)` → `boolean`
  - `positionAt(track, t)` → `[lon, lat]` or `null`: the last fix at or before `t`, or `null` when that fix is more than 30 minutes old or `t` is before the first
  - `newEntries(vessels, ring, from, to, lists)` → `Entry[]`: each position with time in `(from, to]` that is inside while the previous was outside, for vessels whose status is not priority; `Entry` is `{ vesselId, name, t, lon, lat, status }` with status `"suspicious"` (unlisted) or `"watch"`
  - `inLummiWaters(vessels, ring, t, lists)` → `{ vessel, status, lon, lat }[]`: every vessel with a position inside at `t`
  - `summary(inWater)` → `{ label, count, names }[]`: grouped by `fleet` when set, else by `type`, with watch and suspicious rows first
- The browser remembers: the alert email and the user's configuration (local storage), the replay time (in memory).

## Risks and safeguards

| Risk to the user or community               | Safeguard we built                                                                                                                     | Where (file or screen)                                    |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| Acting on wrong or outdated information     | Every source named with its date; the replay shows its date, so nobody reads it as live                                                | `data/schema.json`, `app/layout.tsx` footer, replay clock |
| A lawful vessel is treated as a wrongdoer   | Alerts say "not on the approved list", never "illegal"; every alert says "corroborate before acting"; only the synthetic vessel alerts | `app/actions.ts` email text, `AlertPanel`                 |
| Real boats accused against an invented list | Banner says the list is invented; the only alerting vessel is synthetic and labeled                                                    | `app/layout.tsx`, `data/build.py`                         |
| Private boat owners identified              | Private boats shown by type and length only                                                                                            | `data/build.py`                                           |
| The approximate boundary misleads           | Labeled "approximate, not a legal boundary"                                                                                            | `app/layout.tsx`, the map                                 |
| Boats without AIS are invisible             | The coverage line on screen                                                                                                            | `app/layout.tsx`                                          |
| The alert form is abused to send spam       | The address is checked; Resend's test sender delivers only to the account owner's inbox                                                | `app/actions.ts`                                          |
| AI environmental cost                       | Development token totals and an energy estimate on a slide; the app runs no AI                                                         | Slides                                                    |

## Glossary

- **Lummi waters**: the boundary polygon.
- **Approved vessel** (`priority` in the code): a vessel allowed in Lummi waters, which never alerts: its AIS name or call sign matches a pattern the user configures (`XWL`, `WSF`, `SWN` and `NKK` to start), or it is on the explicit list in the data, or the user approved its id. A vessel on neither list is unlisted.
- **Watch list**: vessels the user has asked to be alerted about. The tool never calls a vessel an offender; that is the user's call.
- **Suspicious**: an unlisted vessel that has entered Lummi waters.
- **Entry**: a non-priority vessel's first position inside Lummi waters after one outside; each entry produces one alert.
