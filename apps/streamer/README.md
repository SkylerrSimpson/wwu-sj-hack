# Streamer

The live backend. It holds one connection to AISStream, keeps the latest state of each vessel in memory, and serves that state to any number of clients. It stores no history yet.

## Run

```sh
cd apps/streamer
uv sync
AIS_API_KEY=... STREAMER_ID_SALT=... uv run python -m streamer
```

| Variable               | Default                       | What it does                                                                  |
| ---------------------- | ----------------------------- | ----------------------------------------------------------------------------- |
| `AIS_API_KEY`          | required                      | The AISStream key. Keep it in this machine's environment and nowhere else.    |
| `STREAMER_ID_SALT`     | random on each start          | Keeps vessel ids stable across restarts. Set a long random value and keep it. |
| `STREAMER_BOX`         | `48.60,-122.90,48.90,-122.40` | The area to watch: south, west, north, east.                                  |
| `STREAMER_HOST`        | `127.0.0.1`                   | The address to listen on. Put a tunnel or HTTPS proxy in front of it.         |
| `STREAMER_PORT`        | `8787`                        | The port to listen on.                                                        |
| `STREAMER_CORS_ORIGIN` | `*`                           | Set this to the site's address once it has one.                               |

On a home lab, run it under something that restarts it, such as systemd or Docker, and keep the clock synced with NTP. All of a record's ages depend on that clock.

## API

- `GET /v1/vessels`: every vessel heard, newest first. `?max_age_s=600` limits it to recent ones.
- `GET /v1/stream`: Server-Sent Events. The first event is a `snapshot`, then a `vessel` event for each update and a `status` event when the feed changes state. A browser `EventSource` reconnects by itself and sends its last event id, so it receives only what it missed, or a new `snapshot` if too much has passed.
- `GET /healthz`: `live`, `stale` or `down`, plus a count of every message outcome.

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

## What it hides

Fishing, sailing and pleasure boats show only type and length, with no name, MMSI or call sign. A vessel of unknown type is treated the same until its type arrives, which can take about 6 minutes after a restart, since state is held in memory.

## Changing provider

`streamer/aisstream.py` is the only code that knows about the provider. A replacement needs a `parse` that returns `Position` and `Static` reports and a `run` with the same arguments; nothing else changes.
