# Vessel archive API: front-end guide

For Skyler (map, views, integration) and Nathan (use cases, plots, filters). Read-only JSON over HTTP. Dev instance: `http://127.0.0.1:8788` on Willow's laptop, until it moves to a server; only the address changes. CORS is `*` by default, so a browser can call it directly.

Times are ISO 8601 and must carry a zone (`2026-11-07T19:00:00Z`). A time without a zone is a 400. Errors are plain text: 400 bad parameter, 404 not found or private, 503 `history is busy, try again` with `Retry-After: 5`.

Samples below are trimmed to 1 or 2 elements. A "private" vessel (fishing, sailing, pleasure, or unknown type) shows only type and length: `mmsi`, `callsign`, `imo`, `width_m`, `draft_m` and `destination` are `null`, and `name` is a generic label.

## The vessel record

Used by `/v1/vessels`, `/v1/stream`, `/v1/history` and `/v1/reports`.

```json
{"id":"v-9cf4eff544c38403","mmsi":352967000,"name":"CORONA NATURE","type":"Cargo","length_m":228,"callsign":"3FCM","imo":9401908,"width_m":36,"draft_m":6.9,"destination":"CA RTB","vessel_class":"A","lat":49.0152,"lon":-123.15541,"sog_kn":null,"cog_deg":null,"heading_deg":null,"nav_status":null,"high_accuracy":null,"transmit_second":null,"heard_at":"2026-11-07T20:48:21.138Z","received_at":"2026-11-07T20:48:26.700Z","flags":["last_known_position"],"source":"aisstream"}
{"id":"v-27be2aae9acd422b","mmsi":null,"name":"Pleasure craft, 5 m","type":"Pleasure craft","length_m":5,"callsign":null,"imo":null,"width_m":null,"draft_m":null,"destination":null,"vessel_class":"B","lat":48.512,"lon":-122.606,"sog_kn":null,"cog_deg":null,"heading_deg":null,"nav_status":null,"high_accuracy":null,"transmit_second":null,"heard_at":"2026-11-07T20:47:51.833Z","received_at":"2026-11-07T20:47:57.613Z","flags":["last_known_position"],"source":"aisstream"}
```

- `type` is one of: Fishing, Tug, Sailing, Pleasure craft, Anti-pollution, Law enforcement, Passenger, Cargo, Tanker, Other, Unknown. These are the values for every `type=` filter.
- `null` means not reported. Never a placeholder number.
- Age of a position is `now - heard_at`. For `source: "noaa"`, `received_at` is the import time, not the real receive time. Never use it for age.
- Private ids change each UTC day, so a private boat cannot be followed across days.
- `flags` can hold `position_jump`, `nonstandard_mmsi`, `last_known_position` (live only, never stored), `duplicate` and `future_time` (kept in the archive and in `/v1/reports`; `duplicate` is removed from `/v1/history`).

## Endpoints

### GET /v1/vessels

Who is on the live map right now? Newest first.
Params: `max_age_s` (above 0, no default: all vessels held, up to 24 h old).

```json
{
  "generated_at": "2026-11-07T20:41:11.768Z",
  "coverage": "Only vessels transmitting AIS and heard by this feed appear here. No vessel heard does not mean no vessel present.",
  "feed": { "status": "live", "last_message_age_s": 1.3 },
  "vessels": [/* vessel records */]
}
```

`feed.status` is `live`, `stale` or `down`.

### GET /v1/stream (SSE)

Live updates. First event is `snapshot`, then one `vessel` event per update, and `status` when the feed state changes. `: ping` comments every 15 s. `EventSource` resumes by itself from the last id, or gets a new `snapshot`. Returns 503 when too many clients.

```
id: b82a1b31-374
event: snapshot
data: {"generated_at":"...","coverage":"...","feed":{...},"vessels":[...]}

id: b82a1b31-375
event: vessel
data: { /* one vessel record */ }
```

`status` data is `{"status":"live","last_message_age_s":1.3}`.

### GET /v1/history

What did the map look like at time T? Each vessel's latest position in the window ending at `at`.
Params: `at` (default now), `window_s` (default 900, above 0, max 86400).

```json
{
  "at": "2026-06-30T12:00:00.000Z",
  "window_s": 900.0,
  "covered": true,
  "coverage": "Only vessels ...",
  "vessels": [/* vessel records, source "noaa" here */]
}
```

`covered: false` means nothing was recording then. A 24 h window on a NOAA day returned 862 vessels.

### GET /v1/track

Where did one named vessel go? Identified vessels only: a private or unknown mmsi is a 404.
Params: `mmsi` (required), `from`, `to` (default last 24 h, max 31 days), `max_points` (default 2000, max 10000).

```json
{
  "id": "v-d6b7195766557b6a",
  "mmsi": 368011730,
  "name": "WHATCOM CHIEF",
  "type": "Passenger",
  "bucket_s": 201600.0,
  "points": [
    {
      "heard_at": "2026-06-24T23:57:47.000Z",
      "lat": 48.72055,
      "lon": -122.681,
      "sog_kn": 0.0,
      "cog_deg": 205.8,
      "heading_deg": 241,
      "flags": [],
      "source": "noaa"
    },
    {
      "heard_at": "2026-06-27T07:18:52.000Z",
      "lat": 48.72057,
      "lon": -122.68098,
      "sog_kn": 0.1,
      "cog_deg": 312.5,
      "heading_deg": 233,
      "flags": [],
      "source": "noaa"
    }
  ]
}
```

Points are thinned to one per `bucket_s` seconds (at least 1). The count can be one above `max_points`. Thinning can hide gaps, so for silence forensics use `/v1/reports?mmsi=` over a raw range.

### GET /v1/reports

Every raw report in a window, in time order.
Params: `from`, `to` (default last 1 h, max 7 days), `limit` (default 5000, max 50000), `box` (`south,west,north,east`), `type` (comma list, for example `Tug,Cargo`), `mmsi` (identified vessels only, else 404), `after` (the previous page's `next`).

```json
{
  "from": "2026-06-24T00:00:00.000Z",
  "to": "2026-06-25T00:00:00.000Z",
  "truncated": true,
  "next": "1782259215.0~368011730~noaa",
  "reports": [
    {
      "id": "v-d6b7195766557b6a",
      "mmsi": 368011730,
      "name": "WHATCOM CHIEF",
      "type": "Passenger",
      "length_m": 32,
      "callsign": "WDJ7956",
      "imo": null,
      "width_m": 14,
      "draft_m": null,
      "destination": null,
      "vessel_class": "B",
      "lat": 48.72055,
      "lon": -122.68099,
      "sog_kn": 0.0,
      "cog_deg": 256.0,
      "heading_deg": 241,
      "nav_status": null,
      "high_accuracy": null,
      "transmit_second": null,
      "heard_at": "2026-06-24T00:00:15.000Z",
      "received_at": "2026-11-07T20:49:16.244Z",
      "flags": [],
      "source": "noaa"
    }
  ]
}
```

`truncated: true` means the limit cut it off. Time: one NOAA day with `limit=50000` took about 2 s and was truncated (a day holds about 230,000 reports), so narrow with `box`, `type` or a shorter window.

Paging: when `truncated` is true, call again with the same parameters plus `after` set to `next`. Stop when `next` is `null`. Pages never repeat or skip a row, even where many reports share one `heard_at`, which NOAA rows often do. Treat `next` as an opaque string.

### GET /v1/catalog

Who was heard in a period?
Params: `from`, `to` (default last 7 days, no stated maximum), `type`.

```json
{
  "from": "2026-06-24T00:00:00.000Z",
  "to": "2026-06-25T00:00:00.000Z",
  "vessels": [
    {
      "id": "v-d6b7195766557b6a",
      "mmsi": 368011730,
      "name": "WHATCOM CHIEF",
      "callsign": "WDJ7956",
      "type": "Passenger",
      "length_m": 32,
      "hours_heard": 22,
      "reports": 591,
      "first_heard": "2026-06-24T00:00:00.000Z",
      "last_heard": "2026-06-25T00:00:00.000Z"
    }
  ],
  "private": [
    { "type": "Fishing", "vessels": 40, "reports": 14141 },
    { "type": "Pleasure craft", "vessels": 549, "reports": 144003 }
  ]
}
```

Identified vessels are listed, sorted by `hours_heard`. Private ones are only counted by type. Times are rounded to the hour, and the hour that contains `to` is included, so `last_heard` can equal `to`.

### GET /v1/density

Where is traffic concentrated? Heat map cells.
Params: `from`, `to` (default last 30 days), `type`.

```json
{
  "from": "2026-06-24T00:00:00.000Z",
  "to": "2026-06-25T00:00:00.000Z",
  "cell_deg": 0.01,
  "cells": [
    { "lat": 48.4, "lon": -123.2, "vessels": 16, "reports": 26 },
    { "lat": 48.4, "lon": -123.19, "vessels": 5, "reports": 11 }
  ]
}
```

`lat` and `lon` are the cell's south-west corner. Cells with fewer than 3 private vessels are dropped, so a home dock cannot show. One NOAA day with `type=Passenger,Cargo` gave 1649 cells.

### GET /v1/activity

How busy was it over time?
Params: `from`, `to` (default last 7 days), `bin_s` (`3600` or `86400`, default 3600).

```json
{
  "from": "2026-06-24T00:00:00.000Z",
  "to": "2026-07-01T00:00:00.000Z",
  "bins": [
    { "at": "2026-06-24T00:00:00.000Z", "source": "noaa", "vessels": 870, "reports": 233909 },
    { "at": "2026-06-25T00:00:00.000Z", "source": "noaa", "vessels": 827, "reports": 220192 }
  ]
}
```

One row per bin per source. `at` is the bin start. `reports` includes duplicates (see Raw data).

### GET /v1/coverage

When was anything recording?
Params: `from`, `to` (default last 365 days).

```json
{
  "from": "...",
  "to": "...",
  "segments": [
    { "source": "noaa", "from": "2026-06-05T00:00:00.000Z", "to": "2026-07-01T00:00:00.000Z" },
    { "source": "aisstream", "from": "2026-11-07T20:47:04.000Z", "to": "2026-11-07T21:08:31.000Z" }
  ],
  "gaps": [{ "from": "2026-07-01T00:00:00.000Z", "to": "2026-11-07T20:47:04.000Z" }]
}
```

### GET /healthz

Is the server up? `{"status":"live","connected":true,"last_message_age_s":0.7,"vessels":241,"clients":0,"archive":{"pending":0,"written":192,"dropped":0,...},...}`. Not for the UI.

## Which call for which feature

| Feature                         | Call                                                                           | Notes                                                                                                                                                                                                                                                                                                                                                                                          |
| ------------------------------- | ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Live map                        | `/v1/stream` (or `/v1/vessels` to poll)                                        | Draw the `snapshot`, then upsert each `vessel` by `id`. Show the status banner from `feed` and `status`.                                                                                                                                                                                                                                                                                       |
| Scrub back in time              | `/v1/history?at=T` per step, or `/v1/reports` for one window                   | History: simple, one vessel per row, one call per step, good for jumping to a moment or a coarse slider. Reports: one call for a window (at most 7 days, 50000 rows), then animate in the browser with `positionAt`-style lookups; good for smooth playback and when `truncated` is false. Use reports when the user plays a short window, history when they jump around or look further back. |
| Vessel track on click           | `/v1/track?mmsi=`                                                              | Identified vessels only. For a private boat, show "track not available", not an error.                                                                                                                                                                                                                                                                                                         |
| Filter panel (type, area, time) | `/v1/reports?type=&box=&from=&to=`; `type=` on `/v1/catalog` and `/v1/density` | `/v1/history` and the live calls have no filters: filter those rows in the browser.                                                                                                                                                                                                                                                                                                            |
| Traffic over time chart         | `/v1/activity`                                                                 | Split the series by `source`.                                                                                                                                                                                                                                                                                                                                                                  |
| Heat map                        | `/v1/density`                                                                  | Cells of 0.01 degree. Filter by `type`.                                                                                                                                                                                                                                                                                                                                                        |
| Who was here last week          | `/v1/catalog?from=&to=`                                                        | Named list plus private counts by type.                                                                                                                                                                                                                                                                                                                                                        |
| Recording gaps on a timeline    | `/v1/coverage`                                                                 | Draw `segments` as bars and `gaps` as hatched.                                                                                                                                                                                                                                                                                                                                                 |
| AIS-silence forensic            | `/v1/reports?mmsi=` (or an unthinned `/v1/track`)                              | Compute the time between consecutive `heard_at` values in the browser. Prefer `/v1/reports?mmsi=` (raw rows): thinned tracks can hide gaps. Ignore a gap that falls inside a `/v1/coverage` gap: nothing was recording.                                                                                                                                                                        |
| Boundary entries                | `/v1/reports` or `/v1/track` rows, with `isInside` and `newEntries`            | See below.                                                                                                                                                                                                                                                                                                                                                                                     |

### Boundary entries

`apps/web/src/lib/vessel.ts` has `isInside(lon, lat, ring)` and `newEntries(vessels, ring, from, to, lists)`. `ring` is `[lon, lat][]` with the first point repeated last. Note lon comes first, the API gives `lat` and `lon` as named fields.

`newEntries` takes the web `Vessel` type, with `track: [unixSeconds, lon, lat][]` in time order, plus `from` and `to` in unix seconds. So convert API rows first:

1. Group rows by `id` (the API `id`, not `mmsi`; private ids change daily).
2. For each group, build `{ id, name, track: rows.map(r => [Date.parse(r.heard_at)/1000, r.lon, r.lat]), priority: false, ... }`, filling the other `Vessel` fields the type requires.
3. Drop rows with `last_known_position` in `flags` first.
4. Pass `lists` for priority and watch ids.

An entry is a point inside whose previous point is outside. If the first point in your window is already inside, no entry is reported. If the previous point is across a recording gap, the "entry" may be older than it looks: check `/v1/coverage`.

## Rules the UI must follow

- Say "no vessels heard", never "no vessels present". The responses carry the wording in `coverage`.
- Show the age of each position, from `heard_at`.
- When `covered` is `false`, say "not recording then", not "no vessels".
- Mark `last_known_position`. That position is of unknown age: leave it out of alerts. These are never stored, so never in history or reports.
- Show `source` on each record. Never compare counts across sources: NOAA and AISStream use different receivers, so a drop at the seam is not a real drop.
- Never draw a trend across the seam between NOAA and AISStream. Split charts by `source` and leave the gap visible.
- On feed status `stale` or `down`, say the map is not current.
- Show `flags` (`position_jump`, `nonstandard_mmsi`, `duplicate`, `future_time`) as unverified data issues, not as evidence.

## Raw data

The archive stores values as heard. Public records turn "not available" codes into `null`. Every live message is also stored verbatim in the `raw_messages` table. Analysis that needs original values or real MMSIs must read the SQLite file on the server. That file holds private boats' real MMSIs: never serve it and never copy it into the repo.

For plots: the `reports` counts in `/v1/activity`, and the rows in `/v1/reports`, include duplicates (the same transmission relayed by several receivers). Drop rows flagged `duplicate` before counting.

## What data exists

A snapshot from 2026-11-07 about 21:10Z. A NOAA import is still running, so call `/v1/coverage` for the current answer.

- **NOAA, continuous:** 2026-05-16 to 2026-06-30, apart from small holes being refilled, and the import is working back toward 2026-01-01. About 230,000 reports and 850 vessels a day.
- **NOAA, one day a month:** the 17th of July 2025, then roughly monthly to 2026-05-03.
- **The seam:** nothing from 2026-07-01 until live recording began. NOAA hasn't published those months yet; importing them later fills the gap.
- **AISStream live:** since 2026-11-07 about 20:47Z, with a 2-minute outage near 21:08Z when the laptop lost its connection. Coverage treats silences under 5 minutes as normal quiet, so that outage doesn't show as a gap.

Each NOAA segment runs hour by hour, so a hole inside a day shows as a gap rather than being papered over.

## Examples

```ts
const api = "http://127.0.0.1:8788";
const day = await (await fetch(`${api}/v1/history?at=2026-06-30T12:00:00Z&window_s=900`)).json();
```

```ts
const es = new EventSource(`${api}/v1/stream`);
es.addEventListener("snapshot", (e) => setVessels(JSON.parse(e.data).vessels));
es.addEventListener("vessel", (e) => upsert(JSON.parse(e.data)));
es.addEventListener("status", (e) => setFeed(JSON.parse(e.data)));
```
