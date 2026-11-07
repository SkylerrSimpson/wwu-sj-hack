# Architecture routes, patterns, stack changes

Prep only, outside the repo. It pairs with `../LUMMI-PREP.md`, which covers the data facts. The repo's binding rules are `AGENTS.md`, `agents/standards.md` and `docs/DECISIONS.md`. Every route here has to fit them, or name the decision it would replace.

## Routes

| Route                             | How it works                                                                                                                                                                       | Fits the repo?                                                                                       | Demo risk                                         | Verdict                                                                                    |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| **A. Batch replay (recommended)** | `build.py` turns one recorded day of AIS into a list of visits in `data.json`. The web app renders the list with a server component, plus one map in a client component.           | Yes. It's the existing static-file decision unchanged.                                               | Lowest: no network at demo time except map tiles. | **Build this.**                                                                            |
| B. Browser computes               | `data.json` carries the raw positions, and TypeScript in `lib/` detects the visits.                                                                                                | Allowed, but the data file is large and the core logic sits on the side away from Willow's strength. | Low                                               | Reject: more bytes over a phone connection on the water, and the rules leave Python.       |
| C. Near-live                      | A scheduled job (Vercel Cron or a GitHub Actions schedule) pulls aisstream.io for N minutes, runs the same visit detection, and writes to Vercel Blob or KV. The page revalidates. | No. It replaces "no service at demo time" and adds a secret key and a store.                         | High: the feed is BETA with no uptime guarantee.  | The **"how it scales"** slide, not today.                                                  |
| D. Alerts                         | Route C plus an SMS or email to an officer when a flagged visit starts.                                                                                                            | No                                                                                                   | High                                              | The "next" slide. It is the challenge's own "alert-based" option, so name it on the slide. |

**Why A still tells the scaling story.** Visit detection is a pure function from positions, the boundary and the approved list to visits. Routes C and D feed the same function live input. That's the answer for the Feasibility & Scalability row: "The visit rules are tested and don't change; going live adds a server and a store."

## Patterns

1. **Functional core, imperative shell.** The repo already does this: `fetch()` is the only I/O, and `clean()` and the transforms are pure. Keep the AIS steps pure so every one has a test.
2. **Pipes and filters, in `build.py`:**
   - `fetch()`: stream the daily zip → keep rows inside the padded box → drop names and IMO → map each MMSI to `V001…` → save to `data/raw/`.
   - Transforms: sort by (vessel, time) → mark each fix inside or outside the polygon → visit rules → write and validate.
3. **The visit rules, changed after the audit.** One rule set, each rule with one test, each sayable in one line:
   - **Visit:** a run of fixes inside Lummi waters. Two runs less than 10 minutes apart merge into one, so a wobble across the line isn't a new visit. There's no separate 2-point rule.
   - **Entry and exit:** `entered` is the first fix inside, with `entry: "crossed" | "inside at start"`. `left` is the last fix inside, always set, with `exit: "crossed" | "inside at end"`. One field never carries two meanings.
   - **Gaps:** a gap never ends a visit. Store `longest_gap_min` and show "no AIS received for 47 min". Never say "went dark"; that's an accusation.
   - **Anchored:** minutes with `Status` = 1, or speed below 0.5 kn for at least 10 minutes, counted as a union. Status 5 (moored) and 7 (fishing) are excluded. Class B units send no status, so for them only the speed rule applies.
   - **Moored:** a vessel moored or stationary all day, such as the Sandy Point marina, which is _inside_ the polygon, is "moored" and not a visit. It's only counted on the summary line. This is the `NOTES.md` example of a false result.
   - **Time window:** one NOAA file is one UTC day, which runs 17:00 to 17:00 Pacific time. Use one file as it is and show its window in local time on screen, for example "Sat Sep 14, 5 PM to Sun Sep 15, 5 PM, 2024". Combining two files to get a midnight-to-midnight local day costs double the download and buys nothing. The file's `BaseDateTime` has no `Z`, so parse it as UTC explicitly.
4. **Pseudonymise in `fetch()`, before anything is saved.** `data/raw/` is committed and public, so stripping identities later doesn't help. The vessel-to-pseudonym mapping is never written down. Only flagged visits publish a track; approved vessels appear only as a count, because where Lummi boats work is Lummi's data. A banner on every page says "Approved list invented for this demo; no vessel shown is suspected of anything."
5. **A synthetic fallback, decided now.** If the real day has no flaggable visit, add one track labeled "Demo vessel (synthetic)", with its own source entry. A flag always exists and no real vessel is accused. It needs a decision line.
6. **Track clipping.** Keep the visit's fixes plus 5 minutes either side, so the crossing shows. No simplification algorithm.
7. **The size budget is the visit page, not `data.json`.** Pages are server components, so a phone never downloads `data.json`. It downloads HTML, one visit's track, the 274-vertex ring, Leaflet (about 40 KB gzipped) and OSM tiles (about 20 KB each, 15 to 30 per view). Tiles dominate. Keep `data.json` small for privacy, not for bandwidth.
8. **One page per visit, generated at build time, instead of state held in the browser.** `/` lists the visits. `/visits/[id]`, built with `generateStaticParams` and `export const dynamicParams = false` (in Next 16 `params` is a Promise), shows one visit and its map. The browser remembers nothing between clicks, and the back button and links just work. Replaced: a selected visit held in client state. Don't use `?visit=` either: reading `searchParams` makes the page dynamic.
9. **The list is primary and the map is supplementary.** That's the accessibility answer: the list holds all the information for screen readers, and the map has an `aria-label` and a text summary. A flagged visit is never shown by colour alone: it gets the text "Not on the approved list" plus an icon.
10. **Time formatting.** Data is stored in UTC. A pure `lib` function formats it with `Intl.DateTimeFormat` and `timeZone: "America/Los_Angeles"`. Node on Vercel has full ICU, so the build output is deterministic. No date library.

## Stack changes worth making

| Change                                                    | Justify                                                                                                                                            | Replaced                                                                                                  | Note                                                                                                                                                                                                                                                                                                  |
| --------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Add `leaflet@1.9.4` and `@types/leaflet@1.9.22`**       | The demo's key moment is a track crossing into Lummi waters, which needs a map.                                                                    | Hand-drawn SVG (less legible), MapLibre GL 6.16 (WebGL, heavier), react-leaflet 5 (a wrapper for one map) | 2.0.0-beta.2 shipped 2026-11-02: too new and still beta. Stay on 1.9.4. Import leaflet inside `useEffect` in a client component, because it touches `window`. Draw the track as a polyline and the end points as `circleMarker`, not `L.marker`, whose default icon image paths break under bundlers. |
| **OpenStreetMap tiles**                                   | Checked: they return 200. Free.                                                                                                                    | NOAA nautical charts                                                                                      | Attribution is required ("© OpenStreetMap contributors"). No prefetching or offline use. Best effort, no uptime guarantee. The demo is pre-recorded, so a tile outage can't sink it.                                                                                                                  |
| NOAA nautical chart basemap: **cut first**                | Officers read nautical charts, and they show anchorages and depths.                                                                                | OSM                                                                                                       | The tile endpoint returns 404. WMS GetCapabilities returns 200, but GetMap is untested. It's the first thing on the cut list.                                                                                                                                                                         |
| **Python stays stdlib**: `csv`, `zipfile`, `json`, `math` | One ring of 274 vertices and one day of points within the bounding box.                                                                            | shapely, geopandas, pandas                                                                                | Matches "the platform first" in the standards.                                                                                                                                                                                                                                                        |
| **The direct daily file as the AIS source**               | `coast.noaa.gov/htdata/CMSP/AISDataHandler/2024/AIS_2024_MM_DD.zip` returns 200 with no order queue. The stdlib `zipfile` and `csv` can stream it. | AccessAIS, an order system with no published turnaround                                                   | Tested by downloading one day, 353 MB; see `aischeck.md`. The 2025 daily files are `.zst`, which would need Python 3.14 or a package, so stay on 2024. No duckdb.                                                                                                                                     |
| No other additions                                        | No react-leaflet, no date library, no state library, no database, no types generated from `schema.json`.                                           | —                                                                                                         | A ten-field schema doesn't earn a code generator.                                                                                                                                                                                                                                                     |

## Gotchas found

- **Leaflet traps:**
  - Without `import "leaflet/dist/leaflet.css"` the tiles scatter.
  - The map div needs an explicit height.
  - Strict Mode runs effects twice, so the effect must `return () => map.remove()`, with a cancelled flag around the async `import("leaflet")`. Otherwise it throws "Map container is already initialized".
  - The repo's turbopack rule sends every `*.css` through the Tailwind loader. Check leaflet.css within the first 10 minutes.
- **The schema contract:**
  - `check.py` validates without a format checker, so `"format": "date-time"` is silently ignored. Use a `pattern` such as `^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?Z$`, as `retrieved` already does.
  - A GeoJSON object fails `data: Data = raw` (`type` infers as `string`, not `"Polygon"`). Store `boundary` as a bare `number[][]` ring, with its own `source`.
- **Edge noise:** the Lummi Island ferry's Gooseberry Point dock is on the polygon edge. Put the ferry on the fictional list, "approved by agreement" (it runs under a 2011 county lease). That's a good example to explain.

- **JSON tuples.** A TS import of `data.json` infers `[lon, lat]` as `number[]`, not `[number, number]`, so a tuple type in `data.ts` fails `Data = raw`. Type tracks as `number[][]`, and narrow at the one place that reads them.
- **Raw files are committed.** `data/raw/` is committed by design. Keep only the extract for the bounding box (a few MB at most), never a nationwide daily file (about 300 MB).
- **The boundary isn't a legal line.** Census says "statistical purposes only". Show that next to the map, not only in the notes.
- **One day may be empty.** Pick the day _after_ looking at the extract. A salmon-season weekday is likely busy, but confirm the data has visits by non-approved vessels to show.

## Shape section (draft for `docs/SPEC.md`)

- `/`: a summary line, then flagged visits first, then the rest, then the provenance footer. It's a server component.
- `/visits/[id]`: one visit's facts, its map and the "verify before acting" line. Static, built with `generateStaticParams`.
- `lib/visit.ts`: `Visit`, `flaggedFirst(visits)`, `duration(visit)`, `formatTime(iso)`, with `visit.test.ts`.
- `components/VisitMap.tsx`: the client component. It takes the boundary and one track as props and holds no data of its own.
- The browser remembers nothing.

## Sources

- npm registry, checked 2026-11-07: leaflet 1.9.4 (latest; 2.0.0-beta.2 dated 2026-11-02), @types/leaflet 1.9.22 (tagged ts7.0), react-leaflet 5.0.0 (peers React ^19), maplibre-gl 6.16.0
- OSM tile policy: https://operations.osmfoundation.org/policies/tiles/
- NOAA Chart Display Service: https://nauticalcharts.noaa.gov/data/gis-data-and-services.html; the service endpoint was checked by hand
