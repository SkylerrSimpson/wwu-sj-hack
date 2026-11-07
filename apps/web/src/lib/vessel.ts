import type { Vessel } from "@/lib/data";

export type Entry = {
  vesselId: string;
  name: string;
  t: number;
  lon: number;
  lat: number;
  status: "suspicious" | "watch";
};

export function isInside(lon: number, lat: number, ring: number[][]): boolean {
  let inside = false;
  for (let i = 1; i < ring.length; i++) {
    const [ax, ay] = ring[i - 1] ?? [];
    const [bx, by] = ring[i] ?? [];
    if (ax === undefined || ay === undefined || bx === undefined || by === undefined) continue;
    if (ay > lat !== by > lat && lon < ax + ((lat - ay) * (bx - ax)) / (by - ay)) inside = !inside;
  }
  return inside;
}

export function positionAt(track: number[][], t: number): [number, number] | null {
  for (let i = track.length - 1; i >= 0; i--) {
    const [pt, lon, lat] = track[i] ?? [];
    if (pt === undefined || lon === undefined || lat === undefined || pt > t) continue;
    return t - pt > 1800 ? null : [lon, lat];
  }
  return null;
}

export function newEntries(vessels: Vessel[], ring: number[][], from: number, to: number): Entry[] {
  const entries: Entry[] = [];
  for (const v of vessels) {
    if (v.priority) continue;
    for (let i = 1; i < v.track.length; i++) {
      const [t, lon, lat] = v.track[i] ?? [];
      const [, plon, plat] = v.track[i - 1] ?? [];
      if (t === undefined || lon === undefined || lat === undefined) continue;
      if (plon === undefined || plat === undefined) continue;
      if (t <= from || t > to) continue;
      if (isInside(lon, lat, ring) && !isInside(plon, plat, ring))
        entries.push({ vesselId: v.id, name: v.name, t, lon, lat, status: "suspicious" });
    }
  }
  return entries.sort((a, b) => a.t - b.t);
}
