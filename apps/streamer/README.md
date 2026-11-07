# Streamer

The live backend. It holds one connection to AISStream, keeps the latest state of each vessel in memory, records every accepted report to SQLite, and serves that state and its history to any number of clients.

## Run it anywhere

It needs Docker and nothing else, on any Linux host. Keep the clock synced with NTP: all of a record's ages depend on it.

```sh
git clone <repo url> && cd <repo>/apps/streamer
cp streamer.env.example .env   # then put your AISStream key in .env
mkdir -p data
docker compose up -d --build
curl -s 127.0.0.1:8787/healthz
```

It starts by itself after a reboot, and it records as soon as it's up. If your user isn't uid 1000, set `STREAMER_UID` and `STREAMER_GID` in `.env` to the output of `id -u` and `id -g`, so it can write to `data`.

Everything the service keeps is in `data`: `ais.db`, and `id_salt.txt`, which keeps vessel ids stable. Keep `data` on a local disk, not a network share, because SQLite's write-ahead log needs that.

## Move it to another host

Nothing ties it to one machine. To move it, or to hand it to someone else:

```sh
docker compose down          # on the old host, so the last writes finish
rsync -a data/ newhost:<repo>/apps/streamer/data/
```

Then follow the steps above on the new host, skipping `mkdir`. Vessel ids and history carry over, and the coverage record shows the time it was off as a gap. The site only needs its streamer address changed. Each host needs its own AISStream key, or the old one with the old host stopped: a key allows 3 connections.

To copy the data while it keeps running, take a snapshot, which is one consistent file and is also the way to back up:

```sh
docker compose exec streamer python -m streamer.snapshot /data/ais.db /data/backups/ais.db
```

To stop hosting, run `docker compose down` and keep `data`. Never copy a running `ais.db` with `cp` or `rsync`: a copy taken mid-write can be corrupt.

Whoever holds `data` holds real MMSIs of private boats, so treat handing it over as a decision, not a file transfer. Never serve it or commit it.

## Settings

Set these in `.env`.

| Variable                | Default                       | What it does                                                                    |
| ----------------------- | ----------------------------- | ------------------------------------------------------------------------------- |
| `AIS_API_KEY`           | required                      | The AISStream key. Keep it in `.env` and nowhere else.                          |
| `STREAMER_BOX`          | `48.60,-122.90,48.90,-122.40` | The area to watch: south, west, north, east. The example file sets a wider one. |
| `STREAMER_CORS_ORIGIN`  | `*`                           | Set this to the site's address once it has one.                                 |
| `STREAMER_PUBLISH_PORT` | `8787`                        | The port on this machine.                                                       |
| `STREAMER_DATA`         | `./data`                      | The folder that holds everything the service keeps.                             |
| `STREAMER_ID_SALT`      | from `id_salt.txt`            | Overrides the file. Rarely needed.                                              |

To run without Docker, for development: `uv sync`, then `AIS_API_KEY=... STREAMER_DB=data/ais.db uv run python -m streamer`. Without `STREAMER_DB`, nothing is recorded.

### Expose it

The live site needs public HTTPS. Tailscale Funnel gives it for free, with no domain, no open router ports and no proxy to configure: run `sudo tailscale funnel --bg 8787` on the host, and it prints a stable `https://<host>.<tailnet>.ts.net` address that forwards to the streamer. With nginx instead, turn proxy buffering off for `/v1/stream` (`proxy_buffering off;`), or events arrive in lumps.

### Keep it up to date

`deploy/update.sh` pulls `main` and rebuilds the streamer when files under `apps/streamer` changed. Run it from cron each minute, and the team deploys by pushing to `main`, with no access to the host:

```sh
( crontab -l 2>/dev/null; echo "* * * * * sh $PWD/deploy/update.sh >> $HOME/streamer-deploy.log 2>&1" ) | crontab -
```

Anyone who can push to `main` changes what runs on the host, inside an unprivileged container. To review each deploy instead, remove the cron line and run the script by hand. A read-only deploy key is enough for the host to pull.

## API

`API.md` is the front-end guide: every endpoint with real samples, and which call suits which feature.

- `GET /v1/vessels`: every vessel heard, newest first. `?max_age_s=600` limits it to recent ones.
- `GET /v1/stream`: Server-Sent Events. The first event is a `snapshot`, then a `vessel` event for each update and a `status` event when the feed changes state. A browser `EventSource` reconnects by itself and sends its last event id, so it receives only what it missed, or a new `snapshot` if too much has passed.
- `GET /healthz`: `live`, `stale` or `down`, plus a count of every message outcome.

### History

Times are ISO 8601 and must include a zone, such as `2026-11-07T19:00:00Z`.

- `GET /v1/history?at=<time>&window_s=900`: each vessel's latest position in the window ending at `at`, for scrolling back. `window_s` is at most 86400. Returns `{at, window_s, covered, coverage, vessels}`, with the same records as live. `covered: false` means nothing was recording then, which is different from no vessels heard.
- `GET /v1/track?mmsi=&from=&to=&max_points=2000`: one identified vessel's path. The range is at most 31 days and `max_points` at most 10000. The path is thinned to `max_points`, and `bucket_s` says by how much. Returns 404 for private or unidentified vessels.
- `GET /v1/activity?from=&to=&bin_s=3600`: vessels and reports per bin per source. `bin_s` is 3600 or 86400.
- `GET /v1/coverage?from=&to=`: `segments` shows what each source covered, and `gaps` shows what none did.

```json
{
  "id": "v-3f9a1c0d2e4b5a68",
  "mmsi": 368000001,
  "name": "EXAMPLE SHIP",
  "type": "Passenger",
  "length_m": 30,
  "callsign": "WXY1234",
  "vessel_class": "B",
  "lat": 48.72345,
  "lon": -122.677412,
  "sog_kn": 9.5,
  "cog_deg": 220.0,
  "heading_deg": 217,
  "nav_status": null,
  "high_accuracy": true,
  "transmit_second": null,
  "heard_at": "2026-11-07T19:15:49.160Z",
  "received_at": "2026-11-07T19:15:52.100Z",
  "flags": [],
  "source": "aisstream"
}
```

Use `id` to follow a vessel. `null` means the vessel didn't report that value; it's never a placeholder number. `heard_at` is when the provider heard it, and `received_at` is when this service did.

## What a client must get right

- **Show how old each position is.** Vessels update about every 1 to 3 minutes on this feed, so a dot can be minutes old.
- **Say "no vessels heard", never "no vessels present".** Boats without AIS never appear, and a short crossing can fall between updates. Snapshots carry this wording in `coverage`.
- **Show the feed status.** On `stale` or `down`, say the map isn't current.
- **Show `flags`.** `position_jump` is a move no vessel could make, and `nonstandard_mmsi` is an identity no vessel should have. Either can be bad data or a false identity, so they aren't evidence on their own.
- **Mark `last_known_position`, and leave it out of alerts.** The vessel's own position reports haven't reached this feed, so the dot is the provider's last known place, of unknown age. It's usually a moored boat, but a moving one could be well away from it. These are never stored in history.

## What it hides

Fishing, sailing and pleasure boats show only type and length, with no name, MMSI or call sign. A vessel of unknown type is treated the same until its type arrives, which can take about 6 minutes after a restart when no archive is set, since state is then held in memory only. With `STREAMER_DB` set, a restart refills the live map and identities from the archive, so that anonymous period goes away.

## Privacy in history

Private and unknown vessels show only type and length, their ids change each UTC day, and tracks are refused. Boats can still be followed within one UTC day through the frames, and a parked position can itself reveal a home dock.

## Import NOAA files

```sh
docker compose run --rm streamer python -m streamer.noaa --days 2026-06-30 2026-01-01 --workers 6
```

It downloads each day, keeps only the area in `NOAA_BOX` (by default 48.40 to 49.05 N, 123.20 to 122.40 W), and discards the rest. Newest days go first, and days already imported are skipped, so interrupting it loses nothing: run the same line again. It can run while the service is live, and importing a day twice changes nothing. An imported day fills that stretch of `gaps`. Rows stay labeled by source, and counts from different sources are not comparable.

## Changing provider

`streamer/aisstream.py` is the only code that knows about the provider. A replacement needs a `parse` that returns `Position` and `Static` reports and a `run` with the same arguments; nothing else changes.
