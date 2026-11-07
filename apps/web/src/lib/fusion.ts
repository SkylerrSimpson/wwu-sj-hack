import type { Vessel } from "@/lib/data";
import type { Detection, Sensor } from "@/lib/sensors";
import { newEntries, type Entry } from "@/lib/vessel";

// Radar sees boats but not who they are; AIS says who a boat is but only if it broadcasts.
// A radar track that no AIS vessel sits on is an unidentified boat.

const M_PER_DEG_LAT = 111_320;
const MAX_GAP = 1800; // as positionAt: past 30 minutes without a fix, the position is unknown
const MATCH_GATE_M = 300; // radar error is tens of metres; boats rarely sit closer than this
const NEAR_M = 150;
const NEAR_S = 120;

function distanceM(lon1: number, lat1: number, lon2: number, lat2: number): number {
  const east = (lon2 - lon1) * M_PER_DEG_LAT * Math.cos((lat1 * Math.PI) / 180);
  return Math.hypot(east, (lat2 - lat1) * M_PER_DEG_LAT);
}

// Unlike positionAt, interpolates: a radar fix falls between two AIS fixes, and a tug at 10 kn
// moves 1.5 km in the 5 minutes between them.
export function interpolateAt(track: number[][], t: number): [number, number] | null {
  let lo = 0;
  let hi = track.length - 1;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if ((track[mid]?.[0] ?? Infinity) <= t) lo = mid;
    else hi = mid - 1;
  }
  const [ta, lona, lata] = track[lo] ?? [];
  if (ta === undefined || lona === undefined || lata === undefined || ta > t) return null;
  if (ta === t) return [lona, lata];
  const [tb, lonb, latb] = track[lo + 1] ?? [];
  if (tb === undefined || lonb === undefined || latb === undefined || tb - ta > MAX_GAP)
    return null;
  const f = (t - ta) / (tb - ta);
  return [lona + (lonb - lona) * f, lata + (latb - lata) * f];
}

// The AIS vessel nearest the radar fix, within the gate, on at least half the fixes; else null.
export function matchAis(radar: Vessel, ais: Vessel[]): string | null {
  const votes = new Map<string, number>();
  for (const [t, lon, lat] of radar.track) {
    if (t === undefined || lon === undefined || lat === undefined) continue;
    let best: string | null = null;
    let bestM = MATCH_GATE_M;
    for (const v of ais) {
      const p = interpolateAt(v.track, t);
      if (!p) continue;
      const m = distanceM(lon, lat, p[0], p[1]);
      if (m <= bestM) [best, bestM] = [v.id, m];
    }
    if (best) votes.set(best, (votes.get(best) ?? 0) + 1);
  }
  for (const [id, n] of votes) if (n * 2 >= radar.track.length) return id;
  return null;
}

export function radarEntries(
  tracks: Vessel[],
  ring: number[][],
  from: number,
  to: number,
): Entry[] {
  const none = { priority: new Set<string>(), watch: new Set<string>() };
  return newEntries(tracks, ring, from, to, none).map((e) => ({ ...e, status: "unidentified" }));
}

export type Sighting = Pick<Detection, "sensor" | "kind" | "boat" | "label" | "confidence">;

// What the camera and LIDAR made of the spot where radar has a boat: each sensor's most
// confident hit within 150 m and 2 minutes.
export function corroboration(
  detections: Detection[],
  lon: number,
  lat: number,
  t: number,
): Sighting[] {
  const best = new Map<string, Detection>();
  for (const d of detections) {
    if (d.kind === "radar" || Math.abs(d.t - t) > NEAR_S) continue;
    if (distanceM(lon, lat, d.lon, d.lat) > NEAR_M) continue;
    if ((best.get(d.sensor)?.confidence ?? -1) < d.confidence) best.set(d.sensor, d);
  }
  return [...best.values()].map(({ sensor, kind, boat, label, confidence }) => ({
    sensor,
    kind,
    boat,
    label,
    confidence,
  }));
}

export function echoCounts(
  detections: Detection[],
  t: number,
): { echoes: number; boats: number; dropped: number } {
  let echoes = 0;
  let boats = 0;
  for (const d of detections)
    if (d.kind === "radar" && d.t <= t) {
      echoes++;
      if (d.boat) boats++;
    }
  return { echoes, boats, dropped: echoes - boats };
}

// A camera's field of view as a closed [lon, lat] ring; flat-earth is fine at a few km.
export function wedge(
  s: Pick<Sensor, "lon" | "lat" | "range_m" | "bearing_deg" | "fov_deg">,
): number[][] {
  const fov = s.fov_deg ?? 360;
  const from = (s.bearing_deg ?? 0) - fov / 2;
  const steps = 16;
  const arc: number[][] = [];
  for (let i = 0; i <= steps; i++) {
    const b = ((from + (fov * i) / steps) * Math.PI) / 180;
    arc.push([
      s.lon + (s.range_m * Math.sin(b)) / (M_PER_DEG_LAT * Math.cos((s.lat * Math.PI) / 180)),
      s.lat + (s.range_m * Math.cos(b)) / M_PER_DEG_LAT,
    ]);
  }
  return [[s.lon, s.lat], ...arc, [s.lon, s.lat]];
}
