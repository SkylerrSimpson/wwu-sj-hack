# Lummi vessel monitoring: head-start research

Researched early in the morning of Sat 2026-11-07, before the event, and **revised after `AUDIT.md`**. Nothing here is in the repo. After 10:00, copy over only what the team agrees on: decision lines go to `docs/DECISIONS.md`, the rest to `docs/SPEC.md` and `data/NOTES.md`.

## The finding that shapes everything (`research/aischeck.md`)

On one real day (UTC Sunday 2024-09-15), only **3 vessels** transmitted AIS from inside the Lummi polygon:

- a 32 m passenger vessel, almost certainly the Lummi Island ferry, _Whatcom Chief_;
- a 10 m law-enforcement boat;
- an 8 m pleasure craft.

All three are Class B, so none sends a navigational status. There were no fishing vessels. On a weekday (Wed 2024-09-18) the only vessel inside was the ferry. Next door, in the padded box, there were 9 tugs and towing vessels and no fishing vessels at all. With the 10-minute merge rule the Sunday gives **31 visits**: the ferry 26 (each under 10 min, 99 min in total, six of them a single fix at the dock), the pleasure boat 3, the patrol boat 2. So the home page lists flagged visits one by one and summarises approved vessels one line each. The water inside is mostly Lummi Bay and Portage Bay tideflats, and the boats the challenge worries about mostly don't broadcast.

So:

1. The demo flags **one synthetic vessel**, clearly labeled "Demo vessel (synthetic)". The real vessels appear as unflagged context.
2. The pitch says it plainly: "AIS sees only a few vessels in these waters. The tool is honest about that, and the Nation's own sightings or satellite radar are the next source to add." That strengthens Knowledge and Ethics; it doesn't weaken the project.

## What the data can do

| Need                     | Source                                     | What we found                                                                                                                                                                                                                                                                                                                                                                       | Verified?                                                                   |
| ------------------------ | ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Vessel positions         | NOAA/BOEM MarineCadastre AIS, CC0          | **The direct daily file**: `https://coast.noaa.gov/htdata/CMSP/AISDataHandler/2024/AIS_2024_MM_DD.zip`, about 353 MB, no order queue. Stream it with stdlib `zipfile` and `csv` and keep only the box. One file is one UTC day, one-minute fixes. The 2025 daily files exist but are `.zst`, so stay on 2024. AccessAIS (custom order) is optional only: no published turnaround.   | Yes: downloaded and processed, 90 s with the stdlib.                        |
| Live positions           | aisstream.io                               | Free key, WebSocket feed limited to a box; BETA, no uptime guarantee; the key would be exposed in the browser.                                                                                                                                                                                                                                                                      | Not chosen.                                                                 |
| Dark vessels             | Global Fishing Watch satellite radar (SAR) | Non-commercial use, token required, attribution required.                                                                                                                                                                                                                                                                                                                           | The "next" slide.                                                           |
| "Exclusive Lummi waters" | Census TIGERweb, GEOID `2070R`             | One ring of 274 vertices. Water 43.3 km², about 10,700 acres. Lummi's own tideland figures vary (7,000, 10,500 and 13,000 acres), so say "about". Its west edge follows WDFW's closure line from Gooseberry Point to Sandy Point. The Lummi Natural Resources boundary layer differs from it by about 0.1 km², and that layer may not be reproduced without consent, so use Census. | Yes: `lummi-reservation-census.geojson`.                                    |
| Why the reservation      | WDFW 2026-27 rules, Marine Area 7          | "Lummi Bay (waters east of a line from Gooseberry Point to Sandy Point) AND Reservation: Closed to non-Indian fishing and/or access." The usual and accustomed fishing areas are larger and shared, not exclusive.                                                                                                                                                                  | Yes (audit read it). The old Tidelands Code URL is a 404, so don't cite it. |
| Who must carry AIS       | 33 CFR 164.46                              | Commercial vessels of 65 ft or more, including fishing vessels, which may use Class B. Also towing vessels of 26 ft or more with over 600 hp. **Most fishing and recreational boats under 65 ft don't have to carry it.**                                                                                                                                                           | Yes.                                                                        |
| Who can act              | RCW 10.92.020; _Oliphant_; _Cooley_        | Tribal officers' authority is "coextensive with the exterior boundaries of the reservation". A citation of a non-Indian goes to a Washington court. So the output is a **referral record**.                                                                                                                                                                                         | Yes (RCW read; the case holdings are standard).                             |

The CSV columns are confirmed: `MMSI, BaseDateTime, LAT, LON, SOG, COG, Heading, VesselName, IMO, CallSign, VesselType, Status, Length, Width, Draft, Cargo, TransceiverClass`. `BaseDateTime` has no `Z`, so treat it as UTC. `Status` is empty for Class B.

## Draft decisions (become `docs/DECISIONS.md` lines once agreed)

1. **Replay one recorded day of AIS, not a live feed.** It keeps the static `data.json` design, nothing can fail at demo time, and no key is exposed. Replaced: aisstream.io live.
2. **Use the NOAA daily file, streamed with the stdlib in `fetch()`.** No dependency and no order queue. Replaced: AccessAIS orders, and 2024 GeoParquet with duckdb.
3. **The boundary is the Census Lummi Reservation polygon**, cited together with the WDFW closure line. It's labeled "approximate, not a legal boundary". Replaced: a hand-drawn polygon, and the Lummi Natural Resources layer, which needs consent.
4. **The inside-the-boundary check is plain Python ray casting.** Assert a single ring. Replaced: shapely or geopandas.
5. **The pipeline computes visits and the web app displays them (route A).** Replaced: shipping raw positions to the browser.
6. **Identities are stripped in `fetch()` before anything is saved.** Names, IMO and call signs are dropped, each MMSI becomes `V001…`, and the mapping is never written. Only flagged visits publish a track. A banner on every page says "Approved list invented for this demo; no vessel shown is suspected of anything." Replaced: pseudonymising after `data/raw/`, which is committed and public.
7. **The approved list is a fictional CSV that includes every real vessel seen**: the ferry as "approved by agreement" (2011 county lease), the patrol boat, the pleasure boat. Only the synthetic vessel is unlisted. Replaced: flagging real vessels against an invented list, which would be a false statement.
8. **Approved vessels are summarised one line each on the home page; flagged visits are listed one by one.** The ferry crosses the boundary 26 times a day. Replaced: one card per visit.
9. **One synthetic flagged vessel, in its own source entry.** The real day has nothing to flag, and flagging a real vessel against an invented list would be a false statement. Replaced: flagging real vessels.
10. **The map is plain `leaflet@1.9.4` with OSM tiles, in one client component.** Replaced: react-leaflet, MapLibre, and SVG (SVG is the cut-list fallback).
11. **Times are stored in UTC and shown in America/Los_Angeles**, with the file's window shown in local time. Replaced: presenting it as "a day".

## Draft schema (becomes the `schema: visits` issue)

**Each record is one visit:**

- `id`, `source`, `name` (the pseudonym, or "Demo vessel (synthetic)")
- `vessel_type`: a word, mapped from the code (30 Fishing; 31/32/52 Towing; 36 Sailing; 37 Pleasure; 55 Law enforcement; 60–69 Passenger; 70–79 Cargo; 80–89 Tanker). The table goes in `NOTES.md`.
- `length_m`: number or null
- `approved`: boolean
- `entered` and `left`: always set, UTC, pattern `^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?Z$` (`check.py` ignores `format`)
- `entry`: `"crossed"` or `"inside at start"`
- `exit`: `"crossed"` or `"inside at end"`
- `anchored_minutes` and `longest_gap_min`: integers ≥ 0
- `track`: `number[][]` as `[lon, lat]`, only when `approved` is false

**New top-level fields:**

- `boundary`: `{ "source": id, "ring": number[][] }`. A bare ring, because a GeoJSON object fails `data: Data = raw`.
- `window`: `{ "start", "end" }`
- `moored_count`: integer

Every source keeps `url` and `retrieved`. The fictional list's URL points to its file in the repo.

## Glossary (at most five terms)

- **Lummi waters**: the boundary polygon.
- **Vessel**: one MMSI, shown by its pseudonym.
- **Visit**: a run of fixes inside Lummi waters. Runs less than 10 minutes apart merge.
- **Approved list**: vessels allowed inside. Invented for the demo.
- **Flagged**: a visit by a vessel not on the approved list.

## Demo script (draft, 90 seconds)

1. **The page opens on the banner** ("Approved list invented for this demo…") and the summary: "Lummi waters, Sat Sep 14, 5 PM to Sun Sep 15, 5 PM, 2024 (recorded): 1 visit not on the approved list; 3 approved vessels, 31 visits; 0 moored."
2. **The flagged visit sits at the top:** "Demo vessel (synthetic), fishing vessel, 21 m. Crossed in 05:12, anchored 47 min, left 06:40. No AIS received for 12 min. Not on the approved list. Self-reported AIS: corroborate before acting."
3. **Clicking it** opens `/visits/[id]`, where the map shows the track crossing the boundary and the details read as a referral record.
4. **Back on the list:** approved vessels are one line each: "Ferry, 32 m, approved by agreement: 26 visits, 1 h 39 min inside". On screen throughout: the source and retrieved date, "approximate boundary (Census; WDFW closure line)", and "Most fishing and recreational boats under 65 ft don't carry AIS; no flag does not mean no unapproved boat was there."

## Risks and safeguards (draft rows)

| Risk                                           | Safeguard                                                                                                                                | Where                       |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | --------------------------- |
| A lawful vessel is treated as a wrongdoer      | Say "not on the approved list", never "illegal"; show the reasons; say "corroborate before acting"; only the synthetic vessel is flagged | Visit card, `/visits/[id]`  |
| False statements about real vessels            | Strip identities in `fetch()`; the banner says the list is invented                                                                      | `data/build.py`, every page |
| The approximate boundary misleads              | Label it with both sources, "not a legal boundary"                                                                                       | Map caption                 |
| Invisible vessels                              | The AIS-coverage line on screen, and the 3-vessel finding in `NOTES.md`                                                                  | Page, `data/NOTES.md`       |
| Surveillance creep: it watches Lummi boats too | Approved visits appear only as a count, with no tracks; the real list and outputs belong to the Nation (CARE)                            | `build.py`, slides          |
| Weak evidence                                  | Each record lists its fixes, gaps and "self-reported AIS"; AIS alone has never proven a fishing case                                     | `/visits/[id]`              |
| Retention                                      | Keep only the reduced, de-identified `data/raw/` extract                                                                                 | `data/NOTES.md`             |
| AI environmental cost                          | Token totals from the Claude Code session logs times a cited energy-per-token figure; "the app itself runs no AI"                        | Slides                      |

## Questions for the rep (Q1 of the kickoff)

- Who is the one user: a Lummi Natural Resources enforcement officer, or Lummi Nation Police? What do they do today when they see a vessel? Who do they refer it to: WDFW, the sheriff, or the USCG?
- Is the threat illegal fishing in the reservation, or commercial traffic (tugs and barges anchoring on the fishing grounds, as the Nation's 2008 gear-loss forum found)? That decides which vessel types matter.
- Do Lummi boats carry AIS? (Our data suggests almost none do.)
- Would they share the Lummi boundary layer, or have us use the Census one?
- Real time, or a next-morning report? What device and connection: a phone on a patrol boat, on cellular?
- Confirm the rubric: `docs/HACKATHON.md` lists a seventh row, "Fitness", which the Devpost page doesn't have.

## First hour

- **Willow, 10:00:**
  - `fetch()` streams `AIS_2024_09_15.zip`, or a busier day if a quick check finds one, boxed to lon −122.75 to −122.53, lat 48.67 to 48.84.
  - It strips identities and saves the extract to `data/raw/`, plus the TIGERweb boundary:
    `https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/AIANNHA/MapServer/2/query?where=GEOID%3D%272070R%27&outFields=NAME,GEOID&outSR=4326&f=geojson`
  - The working script is in `research/aischeck.md`.
- **Skyler, 10:00:**
  - One commit fixing the schedule in the repo docs.
  - Deploy the bare-bones version to Vercel and fill in the README `Live:` line.
  - Build against **hand-written sample visits**, including the synthetic one, until Willow's data lands, so neither of you waits on the other.
- **Both:** the `schema: visits` issue first, then the slices. If time runs short, the cut list is in `AUDIT.md`.

## Sources

- MarineCadastre AIS: https://marinecadastre.gov/ais and https://github.com/ocm-marinecadastre/ais-vessel-traffic (CC0); 2025 daily files, https://www.fisheries.noaa.gov/inport/item/77594
- WDFW Marine Area 7 rules, 2026-27: https://eregulations.com/washington/fishing/marine-area-7
- 33 CFR 164.46: https://www.ecfr.gov/current/title-33/chapter-I/subchapter-P/part-164/section-164.46
- RCW 10.92.020: https://app.leg.wa.gov/RCW/default.aspx?cite=10.92.020
- TIGER/Line terms: https://catalog.data.gov/dataset/tiger-line-shapefile-current-nation-u-s-american-indian-alaska-native-native-hawaiian-area
- The rest: `research/public-info.md` and `AUDIT.md`
