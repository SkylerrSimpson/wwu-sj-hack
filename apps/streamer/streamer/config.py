"""Settings from the environment, checked at startup so a bad value fails loudly."""

import logging
import secrets
from collections.abc import Mapping
from dataclasses import dataclass, field

log = logging.getLogger(__name__)

# Lummi waters plus roughly 10 km on every side, so vessels are seen before they reach the boundary.
DEFAULT_BOX = "48.60,-122.90,48.90,-122.40"


@dataclass(frozen=True, slots=True)
class Box:
    south: float
    west: float
    north: float
    east: float

    def contains(self, lat: float, lon: float) -> bool:
        return self.south <= lat <= self.north and self.west <= lon <= self.east


@dataclass(frozen=True, slots=True)
class Config:
    api_key: str = field(repr=False)
    id_salt: bytes = field(repr=False)
    box: Box
    host: str = "127.0.0.1"
    port: int = 8787
    cors_origin: str = "*"
    max_clients: int = 200
    event_buffer: int = 1000
    client_queue: int = 256


def parse_box(text: str) -> Box:
    try:
        south, west, north, east = (float(part) for part in text.split(","))
    except ValueError:
        raise ValueError("STREAMER_BOX must be south,west,north,east in degrees") from None
    if not (-90 <= south < north <= 90 and -180 <= west < east <= 180):
        raise ValueError("STREAMER_BOX must have south < north and west < east, in range")
    return Box(south, west, north, east)


def parse_port(text: str) -> int:
    try:
        port = int(text)
    except ValueError:
        raise ValueError("STREAMER_PORT must be a number") from None
    if not 1 <= port <= 65535:
        raise ValueError("STREAMER_PORT must be between 1 and 65535")
    return port


def load(env: Mapping[str, str]) -> Config:
    api_key = env.get("AIS_API_KEY", "").strip()
    if not api_key:
        raise ValueError("AIS_API_KEY is not set")
    salt = env.get("STREAMER_ID_SALT", "")
    if not salt:
        log.warning("STREAMER_ID_SALT is not set: vessel ids will change on every restart")
    return Config(
        api_key=api_key,
        id_salt=salt.encode() or secrets.token_bytes(32),
        box=parse_box(env.get("STREAMER_BOX", DEFAULT_BOX)),
        host=env.get("STREAMER_HOST", "127.0.0.1"),
        port=parse_port(env.get("STREAMER_PORT", "8787")),
        cors_origin=env.get("STREAMER_CORS_ORIGIN", "*"),
    )
