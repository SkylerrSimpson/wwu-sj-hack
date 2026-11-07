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

- Editing the priority list in the app: it needs a database; it's a file the Nation would edit.
- Accounts and a database: sign-in is a demo gate with one shared password; the Nation's own sign-on comes later. Text messages: email only.
- Google Maps: it needs a billing account and a key; Leaflet with OpenStreetMap gives the same top-down view.
- A watch zone outside the boundary (the tugs anchoring at the north-west edge): a slide, not a feature.
- Satellite radar for boats with AIS off: the "next" slide.

## Data

| Source                                                                                                      | What it is                                                                                                                                                                                                                     | Why                                                                                                                                                                     |
| ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The event's AIS file (`data/lummifiles/AIS_…csv`, committed reduced as `data/raw/ais-2024-12-05-to-09.zip`) | Five days, Dec 5 to 9 2024 UTC, 219,863 positions, 224 vessels, NOAA MarineCadastre format, public domain                                                                                                                      | The vessel positions; recorded, so the demo can't fail                                                                                                                  |
| The event's boundary (`data/raw/lummi-reservation-boundary.kml`)                                            | One ring, 132 points, about 24,068 acres                                                                                                                                                                                       | Lummi waters. On all 219,863 positions it agrees with the Census Bureau's reservation polygon.                                                                          |
| The approved patterns and list                                                                              | Seventeen tribal codes (from the Nation's representative) matched as whole words of a call sign, `WSF` matched in a name, all editable by staff, plus an explicit list in the data: the Lummi Island ferry and the patrol boat | Known vessels that never alert; the Nation would own the real list                                                                                                      |
| Live AIS (`apps/streamer`)                                                                                  | A Python service holding one AISStream connection, serving `/v1/vessels` and a Server-Sent Events stream; private boats anonymised the same way                                                                                | The Live mode; the recorded replay stays the demo path, because the feed has no uptime guarantee                                                                        |
| One synthetic vessel                                                                                        | Ours, labeled                                                                                                                                                                                                                  | Real data has no non-priority vessel entering; this one crosses in twice, so the demo shows a suspicious alert and then a watch-list alert without accusing a real boat |

The contract is `data/schema.json`. `data.json` holds:

- `sources`: each with `id`, `name`, `url`, `retrieved`
- `window`: `start` and `end`, ISO UTC
- `boundary`: `source` and `ring`, a list of `[lon, lat]`
- `vessels`: each with `id`, `source`, `name`, `type` (in words), `length_m` (number or null), `callsign` ("" when unknown or private), `fleet` ("Whatcom County ferry" or "Law enforcement, listed" for the two vessels on the explicit list, else null), `priority` (true exactly when `fleet` is set), and `track`, a list of `[time, lon, lat]` with time in Unix seconds, one position per 5 minutes, duplicates removed

Private boats (sailing, pleasure craft and fishing, AIS types 36, 37 and 30) are anonymised: named by type and length, such as "Fishing, 24 m", with ids `private-1`, `private-2`, and so on; the committed raw file has their names, IMO and call signs blanked. Tugs, ferries, cargo ships and tankers keep their AIS names. `data/AGENTS.md` keeps personal data out of the public files.

## Shape

Routes:

- `/` (`app/page.tsx` + `components/SignIn.tsx`): the LVT sign-in. Username, password, Sign in; "Sign up" says accounts are issued by the Nation. `app/auth.ts` is a server function: `signIn(formData)` checks the password against `LVT_DEMO_PASSWORD`, sets an httpOnly cookie and redirects to `/map`; `signOut()` clears it. `src/proxy.ts` (Next 16's middleware) sends requests to `/map` and `/settings` without the cookie back to `/`. A demo gate, not accounts.
- `/map` (`app/map/page.tsx` → `components/Replay.tsx`): the tracker. The map fills the viewport. A thin top bar (`components/TopBar.tsx`): the LVT mark at left, linking to `/settings`; Recorded days and Live; play, speed, the slider, skip; the clock; the paths switch; an eye button at far right that hides the bar and the column, leaving the map and a small "Show controls" button. A thin left column (`components/SidePanel.tsx`), 320 px, with tabs: In the water, Lists (counts plus Approve and Watch for the selected vessel), Alerts, Vessel. The ethics banner is one thin amber line under the bar.
- `/settings` (`app/settings/page.tsx` → `components/SettingsView.tsx`): everything configurable in full: approved name patterns, approved vessel ids, the watch list, the alert email, with a link back to the map and a sign-out button.

Shared state: the configuration and the alert email live in local storage; `components/useConfig.ts` and `components/useAlertEmail.ts` are the two hooks that wrap the tested `parseConfig` and `serializeConfig`, so `lib/` stays pure and both pages see the same values.

Modules (unchanged from the MVP):

- `components/Replay.tsx`: client; owns the clock, the mode, the configuration, the selection, the entries and the overlay visibility; composes `TopBar`, `ShipMap`, `SidePanel` and `AlertPanel`; the Lists tab's Approve and Watch buttons call `lib/config`'s `moveTo`.
- `components/ShipMap.tsx`: client; `{ ring, ships, paths, coverage, selectedId, onSelect, className }`; Leaflet on a canvas renderer; dots moved in place; a popup on click.
- `components/TopBar.tsx` and `components/SidePanel.tsx`: props in, markup out, no state of their own except which tab is open.
- `lib/vessel.ts`, `lib/config.ts`, `lib/live.ts`, `lib/data.ts`, `app/actions.ts`: as before, plus `vessel.shownStatus` (an unlisted vessel that crossed in shows as suspicious) and `config.moveTo` (one list at a time).
- `lib/storage.ts`: `readConfig`, `writeConfig`, `readEmail`, `writeEmail` over a storage-like object, tested with a fake; the two hooks wrap them.
- `lib/status.ts`: the word shown for each status (`priority` is shown as "approved").
- `lib/theme.ts`: `resolveTheme(saved, systemDark)`; the saved sun/moon choice wins, otherwise the system preference. `components/useTheme.ts` applies it through the `dark` class on `<html>`, and an inline script in the layout does the same before first paint.
- `lib/panel.ts`: the side column's width limits and its saved width; the filters drawer takes the column's width so the two never show side by side.
- `lib/radar.ts`: four proposed shore radar sites and a range, drawn as dashed circles when the Radar switch is on; labelled "Proposed radar" on the map, because they are hypothetical.

## Look

A modern web application a government office could run, built from shadcn (`base-nova`, neutral) and nothing hand-rolled: Card, Tabs, Table, Input, Label, Button, Badge, Tooltip, Separator, Switch. One typeface (Geist). The 4 px spacing scale, `size="sm"` controls in the chrome, 16 px lucide icons with a visible label or a tooltip. Muted text for secondary lines, a real empty state for every list, plain US English with no em dashes. No gradients, no glass, no emoji, no radii beyond the library's, no colour as the only signal. The map is the hero; the chrome stays thin and the column collapses.

## Risks and safeguards

| Risk to the user or community               | Safeguard we built                                                                                                                     | Where (file or screen)                               |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| Acting on wrong or outdated information     | Every source named with its date; the replay shows its date, so nobody reads it as live                                                | `data/schema.json`, `SidePanel` footer, replay clock |
| A lawful vessel is treated as a wrongdoer   | Alerts say "not on the approved list", never "illegal"; every alert says "corroborate before acting"; only the synthetic vessel alerts | `app/actions.ts` email text, `AlertPanel`            |
| Real boats accused against an invented list | Banner says the list is invented; the only alerting vessel is synthetic and labeled                                                    | `TopBar` banner, `data/build.py`                     |
| Private boat owners identified              | Private boats shown by type and length only                                                                                            | `data/build.py`                                      |
| The approximate boundary misleads           | Labeled "approximate, not a legal boundary"                                                                                            | `SidePanel` footer, the map                          |
| Boats without AIS are invisible             | The coverage line on screen                                                                                                            | `SidePanel` footer                                   |
| The alert form is abused to send spam       | The address is checked; Resend's test sender delivers only to the account owner's inbox                                                | `app/actions.ts`                                     |
| AI environmental cost                       | Development token totals and an energy estimate on a slide; the app runs no AI                                                         | Slides                                               |

## Glossary

- **Lummi waters**: the boundary polygon.
- **Approved vessel** (`priority` in the code): a vessel allowed in Lummi waters, which never alerts: its AIS name or call sign matches a pattern the user configures (seventeen to start: the tribal codes the Nation's representative listed, `XWL` Lummi Nation, `SWN` Swinomish, `NKK` Nooksack, `TUL` Tulalip and the rest, plus `WSF` for the state ferries), or it is on the explicit list in the data, or the user approved its id. A vessel on neither list is unlisted.
- **Watch list**: vessels the user has asked to be alerted about. The tool never calls a vessel an offender; that is the user's call.
- **Suspicious**: an unlisted vessel that has entered Lummi waters.
- **Entry**: a non-priority vessel's first position inside Lummi waters after one outside; each entry produces one alert.
