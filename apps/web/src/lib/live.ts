import type { Vessel } from "@/lib/data";

// One record from the streamer (apps/streamer, GET /v1/vessels or the "vessel" event).
export type LiveRecord = {
  id: string;
  name: string;
  type: string;
  length_m: number | null;
  callsign: string | null;
  lat: number;
  lon: number;
  heard_at: string;
  // Degrees from north: the AIS heading, else the course while moving; null when neither.
  heading: number | null;
};

// About twelve hours at one fix a minute; older fixes fall off the front.
export const MAX_POINTS = 720;

export function parseRecord(x: unknown): LiveRecord | null {
  if (typeof x !== "object" || x === null) return null;
  const r = x as Record<string, unknown>;
  const str = (k: string) => (typeof r[k] === "string" ? (r[k] as string) : null);
  const num = (k: string) =>
    typeof r[k] === "number" && Number.isFinite(r[k]) ? (r[k] as number) : null;
  const id = str("id");
  const lat = num("lat");
  const lon = num("lon");
  const heard = str("heard_at");
  if (!id || lat === null || lon === null || !heard || Number.isNaN(Date.parse(heard))) return null;
  const degrees = (x: number | null) => (x !== null && x >= 0 && x < 360 ? x : null);
  const moving = (num("sog_kn") ?? 0) >= 1;
  return {
    id,
    name: str("name") ?? "Unidentified vessel",
    type: str("type") ?? "Unknown",
    length_m: num("length_m"),
    callsign: str("callsign"),
    lat,
    lon,
    heard_at: heard,
    heading: degrees(num("heading_deg")) ?? (moving ? degrees(num("cog_deg")) : null),
  };
}

export function toVessel(r: LiveRecord): Vessel {
  return {
    id: r.id,
    source: "aisstream",
    name: r.name,
    type: r.type,
    length_m: r.length_m,
    callsign: r.callsign ?? "",
    fleet: null,
    priority: false,
    track: [[Math.floor(Date.parse(r.heard_at) / 1000), r.lon, r.lat]],
  };
}

// Appends the record's fix to the vessel's track, ignoring fixes no newer than the last one.
export function merge(vessels: Map<string, Vessel>, r: LiveRecord): Map<string, Vessel> {
  const fresh = toVessel(r);
  const point = fresh.track[0];
  const old = vessels.get(r.id);
  const next = new Map(vessels);
  if (!old || !point) {
    next.set(r.id, fresh);
    return next;
  }
  const last = old.track.at(-1)?.[0] ?? -Infinity;
  const track = (point[0] ?? 0) > last ? [...old.track, point].slice(-MAX_POINTS) : old.track;
  next.set(r.id, { ...fresh, track });
  return next;
}
