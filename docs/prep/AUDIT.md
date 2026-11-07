# Audit of the Lummi prep

Independent audit, Sat 2026-11-07, 02:03 to 02:16 PST. It covers README.md, TALKING-POINTS.md, LUMMI-PREP.md, research/architecture.md, research/public-info.md and the boundary GeoJSON, checked against the repo rules (read-only). Tags: [read] means I fetched it, [snippet] means search results only, [computed] means I calculated it here.

## Verdict

1. Route A (a recorded day, rules in `build.py`, static pages) is right and buildable by 14:00, and most of the facts hold up.
2. The riskiest assumption has not been tested: that the polygon holds any useful AIS visits at all. The polygon is mostly drying tideflats, and its likeliest AIS traffic is boats moored at the Sandy Point marina.
3. Fix the visit rules (data start, moored, `left: null`, Class B), the pseudonym leak through `data/raw/`, and the AIS source facts before 10:30. Everything else is minor.

## Findings (most severe first)

**F1. Blocker. LUMMI-PREP "First hour" and architecture "One day may be empty": no one has looked at real AIS inside this polygon.**

- What's wrong: the water in the polygon is Lummi Bay and Portage Bay, both tideflats. The vessels that must carry AIS (commercial, 65 ft or more) rarely enter them. Tribal fishing boats are modeled as "non-AIS" ([Ecology 2020](https://ecology.wa.gov/Asset-Collections/Doc-Assets/Spills/Preventing-spills/November-4,-2020-Vessels-that-do-not-transmit-AIS), via public-info [read]). The Sandy Point marina is inside the polygon [computed]. So a real day may show zero non-approved visits, or only moored pleasure boats, and the demo script ("14 visits, 3 flagged") is a guess.
- Fix:
  - At 10:00, before any rule is coded, pull one day and count the MMSIs inside the polygon. A direct download needs no order queue: `https://coast.noaa.gov/htdata/CMSP/AISDataHandler/2024/AIS_2024_09_15.zip` returned 200 [read]. Stream it with `zipfile` and `csv`, keep only the padded box.
  - Fallback, decided now: one synthetic track labeled "Demo vessel (synthetic)" in its own source entry, so a flag always exists and no real vessel is accused. It needs a decision line.

**F2. Major. architecture.md, patterns 3 to 6, and the LUMMI-PREP draft schema: the visit rules have holes that will show in the demo.**

- What's wrong:
  - (a) A vessel already inside when the data starts has a fake `entered` time. Only the end-of-data case is handled.
  - (b) `left: null` means both "still inside at end" (schema) and "lost signal" (pattern 5). That's one field with two meanings.
  - (c) Moored (Status 5, marina boats) is not anchored, but the speed rule (SOG < 0.5 kn) counts a moored boat as "anchored 1,440 min". That's a false flag on a boat at a dock on Sandy Point, a contested fee-land area ([Planet Magazine, "Sovereignty at Sandy Point"](https://theplanetmagazine.net/spring-24-choice/sovereignty-at-sandy-point) [snippet]). The marina, at 48.7976 N, 122.7072 W ([TopoZone](https://www.topozone.com/washington/whatcom-wa/locale/sandy-point-marina-2/) [snippet]), tests inside the polygon [computed]. Its dredging is in a live dispute, which the Lummi have blocked, citing treaty tidelands ([AOL news](https://www.aol.com/rescue-boat-local-marina-t-230000788.html) [snippet]), so a false flag there would be read politically.
  - (d) "2 inside to open, 2 outside to close, _or_ merge under 10 min" is two rules joined by "or". Pick one.
  - (e) Class B position reports carry no navigational status, so Status-based anchoring only works for Class A (public-info section 4; [NAVCEN class comparison](https://navcen.uscg.gov/sites/default/files/pdf/AIS_Comparison_By_Class.pdf) [via public-info]).
  - (f) Status 7 (engaged in fishing) plus slow speed while hauling pots reads as "anchored".
  - (g) A 30-minute gap splits one anchoring into two visits.
  - (h) `BaseDateTime` has no `Z`. Parse it as UTC explicitly. A daily file is a **UTC** day, which runs 17:00 to 17:00 Pacific time in September (PDT), so the "day's summary" isn't a local day.
- Fix: one explainable rule set, each rule with one test.
  - A visit is a run of inside fixes. Two runs less than 10 min apart merge. No 2-point hysteresis.
  - `entered` is the first inside fix, plus `entry: "crossed" | "inside at start"`. `left` is the last inside fix, always set, plus `exit: "crossed" | "inside at end"`.
  - A gap never ends a visit. Store `longest_gap_min` and show "no AIS received for 47 min", not "went dark".
  - Anchored minutes come from Status 1, or SOG < 0.5 kn for 10 min or more, excluding Status 5 and 7, counted as a union, not a sum.
  - A vessel moored all day (Status 5, or never moving) is "moored", not a visit. Count it on the summary line.
  - Choose the window as a local day (07:00Z to 07:00Z) and show it on screen.

**F3. Major. architecture.md pattern 7 and LUMMI-PREP decision 6: pseudonyms don't hold, and the safeguard is aimed at the wrong harm.**

- What's wrong:
  - `data/raw/` is committed and public, with MMSI, name and exact timestamps, so "Vessel 07" joins back to its name in seconds.
  - Even without raw, type, length, time and track re-identify a vessel on MarineTraffic. AIS is public domain, so secrecy isn't the harm. The harm is that the approved list is fictional, so every "not on the approved list" label on a real vessel is a false statement.
  - Showing approved vessels' tracks publicly also shows where Lummi boats work. That's tribal data, per the CARE principles' "authority to control" ([GIDA](https://www.gida-global.org/care) [snippet]).
- Fix:
  - `fetch()` drops `VesselName`, `IMO` and `CallSign`, replaces each MMSI with `V001…` in order of first appearance, and discards the mapping _before_ writing `data/raw/`. Note this in `NOTES.md`.
  - Tracks are published only for flagged visits; approved visits appear as a count.
  - A banner on every page says "Approved list invented for this demo; no vessel shown is suspected of anything."
  - Prefer F1's synthetic track for the flagged example.

**F4. Major. LUMMI-PREP "Exclusive Lummi waters" row and its sources: the main source is dead, and a better one exists.**

- What's wrong: `https://nill.narf.org/codes/lummi/13Tidelands.pdf` returns 404 [read]. NILL says the titles are an unofficial 2019 compilation ([NILL index](https://narf.org/nill/codes/lummi/index.html), via public-info).
- Better evidence:
  - WDFW's 2026-27 rules: "Lummi Bay (waters east of a line from Gooseberry Point to Sandy Point) AND Reservation Closed to non-Indian fishing and/or access." ([eRegulations, Marine Area 7](https://eregulations.com/washington/fishing/marine-area-7), updated 2026-10-05 [read])
  - The Census polygon's west edge runs along that Gooseberry Point to Sandy Point line [computed].
  - LNR's own "approximate combined upland and tideland boundary" differs from the Census polygon by about 0.1 km² out of 96.6 km² [computed from the LNR shapefile; inspected, then deleted].
- Fix: cite WDFW and the Census Bureau on screen ("Lummi Reservation and Lummi Bay, closed to non-Indian fishing by state rule; approximate boundary"). Drop public-info implication 2's plan to load the LNR layer at deploy time: the two shapes are the same, and Census needs no consent.

**F5. Major. LUMMI-PREP "Vessel positions" row and decision 2: the AIS facts are partly wrong, and the fallback is overbuilt.**

- What's wrong:
  - "2025 is only available as monthly tracks" is wrong. 2025 daily one-minute points were published on 2026-03-05 as daily CSV/.zst, with invalid MMSIs removed ([InPort 77594](https://www.fisheries.noaa.gov/inport/item/77594) [read]).
  - The 2024 daily CSV zips download directly (F1), so the fallback needs neither duckdb nor GeoParquet.
  - AccessAIS is an _order_ system with no published turnaround ([repo README](https://github.com/ocm-marinecadastre/ais-vessel-traffic) [read]), so 10:30 is a fragile cutoff.
  - No 2026 data exists. The demo day is from 2025 or earlier, and the screen must say so, or judges will read it as live.
- Fix: the primary is the 2024 (or 2025) daily file, streamed and boxed in `fetch()` with the stdlib. AccessAIS becomes the nice-to-have. Delete the duckdb and Python 3.14 rows.

**F6. Minor. LUMMI-PREP draft schema against the repo contract.**

- What's wrong:
  - `check.py` builds `Draft202012Validator(SCHEMA)` without a format checker, so `"format": "date-time"` is silently not enforced. Use `pattern: "^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}(:\\d{2})?Z$"`, as `retrieved` does.
  - A GeoJSON `boundary` object fails `data: Data = raw` for the same reason as tuples: JSON infers `type: string`, not the literal `"Polygon"`. Store `boundary` as a bare `number[][]` ring, plus its own `source`.
  - Every source needs an `^https?://` URL. The fictional approved list's source can point to its file in the (public) repo.
  - `vessel_type` needs a code-to-words table (30 Fishing, 31/32/52 Towing or tug, 36 Sailing, 37 Pleasure, 60-69 Passenger, 70-79 Cargo, 80-89 Tanker) and a `NOTES.md` line.
  - Add F2's `entry`, `exit` and `longest_gap_min`.

**F7. Minor. The architecture "Gotchas" and Leaflet row: Leaflet traps that aren't listed.**

- What's wrong:
  - Without `import "leaflet/dist/leaflet.css"` the tiles scatter.
  - The map div needs an explicit height.
  - Strict Mode runs effects twice in dev, so the effect must `return () => map.remove()`, with a cancelled flag around the async `import("leaflet")`, or it throws "Map container is already initialized".
  - The repo's turbopack rule sends every `*.css`, leaflet.css included, through the Tailwind loader. Check this in the first 10 minutes.
- What holds: `/visits/[id]` with `generateStaticParams` is the simplest option. In Next 16 `params` is a Promise; add `export const dynamicParams = false`. The page imports `@/lib/data` on the server and passes the ring and track as props, which follows the repo rule.

**F8. Minor. Architecture pattern 8, "data.json under 300 KB for cellular", budgets the wrong thing.**

- What's wrong: pages are server components, so a phone never downloads `data.json`. It downloads HTML, the RSC payload for one visit, Leaflet (about 40 KB gzipped) and OSM tiles (about 20 KB each, 15 to 30 per view [read: one tile was 20.8 KB]). The tiles dominate.
- Fix: keep `data.json` small for privacy reasons (F3), and budget the visit page instead: one visit's track plus the 274-vertex ring.

**F9. Minor. Wording in TALKING-POINTS #4 and the LUMMI-PREP demo step 4.**

- What's wrong:
  - "No flags doesn't mean no intruders" uses the accusatory word the team itself banned.
  - "Boats under 65 ft aren't required to carry AIS" is imprecise: towing vessels of 26 ft or more with over 600 hp must carry it, and tugs are the documented gear-loss problem.
  - "The code doesn't change" (architecture.md) overclaims. Going live adds a server, a store, a key, and visits that span batches.
- Fix:
  - "No flag does not mean no unapproved boat was there."
  - "Most fishing and recreational boats under 65 ft don't have to carry AIS."
  - "The visit rules don't change; going live adds a server."

**F10. Minor. public-info implication 1 overreaches.**

- What's wrong: the 2008 forum's gear-loss areas were "north and south of Alden Bank to the docks at Cherry Point". That is the usual and accustomed area, outside the reservation, and the forum was 18 years ago. It doesn't overturn the challenge's stated problem.
- Fix: keep the challenge framing. The list shows every vessel type with no type filter, which costs nothing. Ask the rep which threat matters.

**F11. Minor. Repo-rule and rubric gaps.**

- What's wrong:
  - `data/AGENTS.md` requires a `NOTES.md` Cleaning entry with an example of a false result for rule-based matching. The visit rules qualify; use the F2(c) moored-boat case.
  - The environmental estimate needs a cited energy-per-token figure, plus the line "the app itself runs no AI."
  - `docs/HACKATHON.md` lists a seventh review row, **Fitness** ("directly addresses the problem statement, then goes beyond"), which the prep never mentions. Confirm the rubric at kickoff.
- Fix: the decision lines must also cover OSM tiles as an external service, the direct-download source, and the synthetic track if it's used.

**F12. Minor. Safeguards are missing three rows.**

- What's wrong, with the fix for each:
  - Surveillance creep: the tool watches everyone, Lummi members included. Fix: the public build shows tracks only for flagged visits (F3), and the slide says that real data, list and outputs belong to the Nation (CARE).
  - Retention: the recorded day is kept only as the reduced `data/raw/` file.
  - Evidence quality: each flagged card lists its fixes, its gaps and "self-reported AIS", because AIS alone has never proven a fishing case ([Stop Illegal Fishing 2018](https://stopillegalfishing.com/wp-content/uploads/2025/03/reports-the-potential-use-of-ais-fisheries-as-a-monitoring-tool-english.pdf), via public-info).

## Missing research filled

- **The exclusive waters have an official public definition.** WDFW Marine Area 7 closes "Lummi Bay (east of Gooseberry Point–Sandy Point) AND Reservation" to non-Indian fishing and access ([eRegulations 2026-27](https://eregulations.com/washington/fishing/marine-area-7) [read]). The Census polygon's west edge follows that line [computed].
- **Census and the Nation's own layer agree.** LNR's 2013 shapefile (97 vertices) and Census 2070R differ by about 0.1 km² [computed]. Its metadata says it is "approximate" and "No part of this document may be reproduced without prior consent of the Lummi Nation" ([LNR f=72](https://lumminaturalresources.org/document.php?f=72) [read]).
- **The Census areas are exact.** AREALAND is 54,075,215 m² and AREAWATER is 43,287,533 m², about 10,697 water acres ([TIGERweb query](https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/AIANNHA/MapServer/2/query?where=GEOID%3D%272070R%27&outFields=NAME,AREALAND,AREAWATER&f=json&returnGeometry=false) [read]). Lummi's own tideland figures vary: 10,500 acres ([Lummi OZ deck](https://cob.org/wp-content/uploads/opportunity-zone-presentation-ln.pdf) [snippet]), about 13,000 ([Lummi About page](https://www.lummi-nsn.gov/Website.php?PageID=388) [snippet]), and 7,000 ([WA resources guide](https://www.ezview.wa.gov/pr/Portals/_1357/images/default/Lummi%20Resources%20Guide%20Final%20Draft%20Sept14.pdf) [snippet]). Say "about", never "matches".
- **The Lummi Island ferry.** The Whatcom Chief crosses Lummi tidelands under a 2011 county lease ([Wikipedia](https://en.wikipedia.org/wiki/Whatcom_Chief), [Crosscut 2010](https://crosscut.com/2010/08/lummi-island-ferry-caught-in-snag-over-tribal-tide) [snippet]). Its Gooseberry Point dock sits on the polygon edge [computed]. Expect edge noise from it, and put it on the fictional list: it's "approved by agreement" and a good example to explain.
- **AIS files.** The 2024 daily zip downloads directly [read]. 2025 daily points are published as .zst ([InPort 77594](https://www.fisheries.noaa.gov/inport/item/77594) [read]). The CSV columns match the prep's list ([InPort data dictionary](https://www.fisheries.noaa.gov/inport/item/70162) [snippet]).
- **Leaflet.** `leaflet` latest is 1.9.4; the beta tag is 2.0.0-beta.2 (`npm view`) [read].
- **Jurisdiction.**
  - RCW 10.92.020: the authority is "coextensive with the exterior boundaries of the reservation"; a citation goes "to a Washington court"; it requires insurance and RCW 43.101.157 training ([RCW](https://app.leg.wa.gov/RCW/default.aspx?cite=10.92.020) [read]).
  - So the output is a referral record for WDFW, the sheriff or USCG, which supports the "verify before acting" wording.

## Fact check table

| Claim (file)                                                                       | Verdict                                                                                                                                         | Source                                                                                                                                  |
| ---------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| AccessAIS: custom area and time, zipped CSV, orders up to about 2 GB (LP)          | Confirmed                                                                                                                                       | [GitHub README](https://github.com/ocm-marinecadastre/ais-vessel-traffic) [read]                                                        |
| AccessAIS current date range (LP)                                                  | Unverifiable                                                                                                                                    | The tool is JavaScript; not opened                                                                                                      |
| 2025 only as monthly tracks (LP)                                                   | **Wrong**: daily points exist                                                                                                                   | [InPort 77594](https://www.fisheries.noaa.gov/inport/item/77594) [read]                                                                 |
| 2024 daily GeoParquet, about 325 MB/day (LP)                                       | Exists; size unverified                                                                                                                         | GitHub README [read]                                                                                                                    |
| One-minute sampling (LP)                                                           | Confirmed                                                                                                                                       | InPort 77594 [read]                                                                                                                     |
| Timestamps in UTC (LP)                                                             | Unverifiable here; standard for NAIS                                                                                                            | n/a                                                                                                                                     |
| Repo archived Oct 28 2026 (LP)                                                     | Confirmed                                                                                                                                       | GitHub [read]                                                                                                                           |
| CSV column list (LP, "unverified")                                                 | Confirmed                                                                                                                                       | [InPort 70162](https://www.fisheries.noaa.gov/inport/item/70162) [snippet]                                                              |
| Status 1 anchor, 5 moored, 7 fishing (LP, PI)                                      | Confirmed                                                                                                                                       | [NAVCEN Class A](https://www.navcen.uscg.gov/ais-class-a-reports) (PI) [read by PI]                                                     |
| GEOID 2070R: one ring, 274 vertices, box as stated (LP)                            | Confirmed                                                                                                                                       | [computed]                                                                                                                              |
| Land 54.1 km², water 43.3 km², about 10,700 acres (LP)                             | Confirmed                                                                                                                                       | TIGERweb query [read]                                                                                                                   |
| "Matching Lummi's tidelands about 10,500 acres" (LP)                               | Partly: one Lummi source; others say 7,000 or 13,000                                                                                            | See above                                                                                                                               |
| Census water area represents the tidelands (LP)                                    | Confirmed, approximately                                                                                                                        | LNR layer [computed]; WDFW line [read]                                                                                                  |
| Census "statistical purposes only" (LP)                                            | Confirmed (TIGER/Line disclaimer; not re-fetched)                                                                                               | [data.gov](https://catalog.data.gov/dataset/tiger-line-shapefile-current-nation-u-s-american-indian-alaska-native-native-hawaiian-area) |
| Tidelands Code quote "exclusive use … Treaty of 1855" (LP)                         | Unverifiable: URL 404; archived PDF not text-extractable                                                                                        | [read: 404]                                                                                                                             |
| 33 CFR 164.46: 65 ft or more, commercial; fishing may use Class B (LP)             | Confirmed                                                                                                                                       | [eCFR](https://www.ecfr.gov/current/title-33/chapter-I/subchapter-P/part-164/section-164.46) [read]                                     |
| "Smaller boats are not required" (LP, TP)                                          | Imprecise: towing vessels 26 ft+ and 600 hp+ are                                                                                                | eCFR (b)(1) [read]                                                                                                                      |
| AIS continual operation; may be switched off for safety (PI)                       | Confirmed                                                                                                                                       | eCFR (d)(2)(v) [read]                                                                                                                   |
| leaflet 1.9.4, @types/leaflet 1.9.22, react-leaflet 5.0.0, maplibre-gl 6.16.0 (AR) | Confirmed                                                                                                                                       | `npm view` [read]                                                                                                                       |
| OSM: attribution required, no prefetch or offline use, best effort (AR)            | Confirmed; also requires a valid User-Agent and Referer                                                                                         | [OSM tile policy](https://operations.osmfoundation.org/policies/tiles/) [read]                                                          |
| NOAA chart: ArcGIS tiles 404; WMS might work (AR)                                  | WMS GetCapabilities 200 (151 KB); GetMap untested; old tileservice gone                                                                         | [read]                                                                                                                                  |
| `searchParams` makes the page dynamic (AR)                                         | Confirmed (Next docs; not re-fetched)                                                                                                           | n/a                                                                                                                                     |
| aisstream.io is BETA; GFW needs a token (LP)                                       | Unverifiable; not checked                                                                                                                       | n/a                                                                                                                                     |
| PI: LNR shapefile and its no-reproduction clause                                   | Confirmed                                                                                                                                       | Downloaded and inspected [read]                                                                                                         |
| PI: 2008 forum: 34 people; tugs and barges primary; poaching small                 | Confirmed                                                                                                                                       | PDF text extracted [read]                                                                                                               |
| PI: RCW 10.92.020 wording                                                          | Confirmed                                                                                                                                       | [RCW](https://app.leg.wa.gov/RCW/default.aspx?cite=10.92.020) [read]                                                                    |
| PI: Oliphant, Montana, Cooley holdings                                             | Confirmed (standard holdings; Cooley PDF not re-fetched)                                                                                        | n/a                                                                                                                                     |
| PI: WDFW 2026-27 Lummi Bay and Reservation closure                                 | Confirmed                                                                                                                                       | eRegulations [read]                                                                                                                     |
| PI: Skylight free to agencies and NGOs                                             | Confirmed, but only for organisations "that work to protect seas from illegal fishing and other maritime crimes"; tribal eligibility not stated | [skylight.global](https://www.skylight.global/) [read]                                                                                  |
| PI: General Anchorage edge about 0.8 km from the boundary                          | Confirmed: 814 m (Explosives Anchorage 2,081 m)                                                                                                 | [computed] from 33 CFR 110.230 coordinates                                                                                              |

LP = LUMMI-PREP.md, AR = architecture.md, TP = TALKING-POINTS.md, PI = public-info.md.

### What public-info changes in the decisions

- **Decision 3 (boundary):** keep it, and cite WDFW and LNR agreement (F4).
- **Decision 6 (pseudonyms):** strengthen per F3.
- **Demo wording:** "referral record, not a verdict" (PI implication 3) should go into TALKING-POINTS #2.
- **PI implication 7:** add a minimum time inside before a visit counts as flagged. The anchorage edge is 0.8 km away, so swinging ships rarely cross; the ferry and the marina are the real edge noise.
- **Prior art:** Skylight means the "why not Skylight?" answer must be ready. Ours is the Nation's own list, kept local, plus an officer-ready record.

## Cut list (in this order)

1. The NOAA chart basemap.
2. Track simplification: just clip to the visit plus or minus 5 min.
3. The 2-point hysteresis (already replaced by F2's single merge rule).
4. AccessAIS: use the direct daily file.
5. The Leaflet map: replace it with a server-rendered SVG of the ring and track (no dependency, no tiles, works offline).
6. The `/visits/[id]` route: put the details inline on `/`.

Never cut: the caveat lines, provenance, the "not on the approved list" wording, the banner saying the list is invented, the pseudonym step in `fetch()`, and the NOTES.md false-result example.

**Feasibility.**

- Willow: about 3 h (fetch and box 45 min, visits and tests 90, anchoring, moored and pseudonyms 45).
- Skyler: about 3.3 h (deploy 20, schema and `data.ts` 20, list and `lib/visit` 60, visit page and map 75, caveats 20).
- That fits 10:00 to 14:00 only if F1's data check finishes by 10:45 and Skyler builds against hand-written sample visits until then.
