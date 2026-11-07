# Streamer

The live backend. It holds one connection to AISStream, keeps the latest state of each vessel in memory, records every accepted report to SQLite, and serves that state and its history to any number of clients.

## Run

```sh
cd apps/streamer
uv sync
AIS_API_KEY=... STREAMER_ID_SALT=... uv run python -m streamer
```

| Variable               | Default                       | What it does                                                                     |
| ---------------------- | ----------------------------- | -------------------------------------------------------------------------------- |
| `AIS_API_KEY`          | required                      | The AISStream key. Keep it in this machine's environment and nowhere else.       |
| `STREAMER_ID_SALT`     | random on each start          | Keeps vessel ids stable across restarts. Set a long random value and keep it.    |
| `STREAMER_DB`          | unset                         | Path to a SQLite file. Unset means nothing is recorded, and a warning is logged. |
| `STREAMER_BOX`         | `48.60,-122.90,48.90,-122.40` | The area to watch: south, west, north, east.                                     |
| `STREAMER_HOST`        | `127.0.0.1`                   | The address to listen on. Put a tunnel or HTTPS proxy in front of it.            |
| `STREAMER_PORT`        | `8787`                        | The port to listen on.                                                           |
| `STREAMER_CORS_ORIGIN` | `*`                           | Set this to the site's address once it has one.                                  |

On a home lab, run it under something that restarts it, such as systemd or Docker, and keep the clock synced with NTP. All of a record's ages depend on that clock. The next section sets that up on Ubuntu.

## Deploy on Ubuntu

Run these on the server, in order.

```sh
sudo apt update && sudo apt install -y sqlite3 git curl openssl
curl -LsSf https://astral.sh/uv/install.sh | sudo env UV_INSTALL_DIR=/usr/local/bin UV_NO_MODIFY_PATH=1 sh
sudo useradd --system --home-dir /var/lib/lummi-streamer --shell /usr/sbin/nologin lummi
sudo git clone <repo url> /opt/lummi-streamer
sudo chown -R lummi:lummi /opt/lummi-streamer
cd /opt/lummi-streamer/apps/streamer
sudo -u lummi env UV_CACHE_DIR=/tmp/uv-cache uv sync --frozen --no-dev
openssl rand -hex 32
```

Copy the `openssl` output into `STREAMER_ID_SALT`. Keep the salt: it keeps vessel ids stable across restarts.

```sh
sudo install -m 600 -o root -g root deploy/lummi-streamer.env.example /etc/lummi-streamer.env
sudo nano /etc/lummi-streamer.env
sudo install -m 644 deploy/lummi-streamer.service deploy/lummi-streamer-backup.service deploy/lummi-streamer-backup.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now lummi-streamer.service lummi-streamer-backup.timer
curl -s 127.0.0.1:8787/healthz
timedatectl
```

Fill in `AIS_API_KEY` and `STREAMER_ID_SALT` in the env file. `timedatectl` should say `System clock synchronized: yes`.

The database lives at `/var/lib/lummi-streamer/ais.db`, which systemd creates for the `lummi` user. It must be on a local disk, not NFS, because SQLite's WAL mode needs that. The backup timer runs daily at 03:30 and uses SQLite's online `.backup`, which is safe while the server writes. It keeps the last 7 files in `/var/lib/lummi-streamer/backups/`. Never copy the live database with `cp`: a WAL database copied that way can be corrupt.

### Expose it

The live site needs public HTTPS, for example Tailscale Funnel or a Cloudflare Tunnel pointing at `127.0.0.1:8787`. Keep `STREAMER_HOST` at `127.0.0.1`, and set `STREAMER_CORS_ORIGIN` to the site's address. With nginx, turn proxy buffering off for `/v1/stream` (`proxy_buffering off;`), or events arrive in lumps.

The database holds real MMSIs of private boats. Never serve it, and never copy it into the repo or a backup that leaves the server.

## API

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
STREAMER_DB=/var/lib/lummi-streamer/ais.db uv run python -m streamer.noaa data/raw/ais-bulk/ais-*.csv.zst
```

It can run while the server is live, and importing a file twice changes nothing. It keeps 48.40 to 49.05 N, 123.20 to 122.40 W unless `NOAA_BOX` is set. A day imported later fills that stretch of `gaps`. Rows stay labeled by source, and counts from different sources are not comparable.

## Changing provider

`streamer/aisstream.py` is the only code that knows about the provider. A replacement needs a `parse` that returns `Position` and `Static` reports and a `run` with the same arguments; nothing else changes.
