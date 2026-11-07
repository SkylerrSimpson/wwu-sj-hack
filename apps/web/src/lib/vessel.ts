import type { Vessel } from "@/lib/data";

export type Lists = { priority: Set<string>; watch: Set<string> };
export type Status = "priority" | "watch" | "suspicious" | "unlisted";
export type Entry = {
  vesselId: string;
  name: string;
  t: number;
  lon: number;
  lat: number;
  status: "suspicious" | "watch";
};

export function vesselStatus(v: Vessel, lists: Lists): Status {
  if (lists.watch.has(v.id)) return "watch";
  if (v.priority || lists.priority.has(v.id)) return "priority";
  return "unlisted";
}

// What the screen shows: an unlisted vessel that has crossed in is suspicious until it is listed.
export function shownStatus(v: Vessel, lists: Lists, crossed: ReadonlySet<string>): Status {
  const s = vesselStatus(v, lists);
  return s === "unlisted" && crossed.has(v.id) ? "suspicious" : s;
}

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

export function newEntries(
  vessels: Vessel[],
  ring: number[][],
  from: number,
  to: number,
  lists: Lists,
): Entry[] {
  const entries: Entry[] = [];
  for (const v of vessels) {
    const status = vesselStatus(v, lists);
    if (status === "priority") continue;
    for (let i = 1; i < v.track.length; i++) {
      const [t, lon, lat] = v.track[i] ?? [];
      const [, plon, plat] = v.track[i - 1] ?? [];
      if (t === undefined || lon === undefined || lat === undefined) continue;
      if (plon === undefined || plat === undefined) continue;
      if (t <= from || t > to) continue;
      if (isInside(lon, lat, ring) && !isInside(plon, plat, ring))
        entries.push({
          vesselId: v.id,
          name: v.name,
          t,
          lon,
          lat,
          status: status === "watch" ? "watch" : "suspicious",
        });
    }
  }
  return entries.sort((a, b) => a.t - b.t);
}

export type InWater = { vessel: Vessel; status: Status; lon: number; lat: number };

export function inLummiWaters(
  vessels: Vessel[],
  ring: number[][],
  t: number,
  lists: Lists,
  crossed: ReadonlySet<string> = new Set(),
): InWater[] {
  const out: InWater[] = [];
  for (const vessel of vessels) {
    const pos = positionAt(vessel.track, t);
    if (!pos || !isInside(pos[0], pos[1], ring)) continue;
    out.push({ vessel, status: shownStatus(vessel, lists, crossed), lon: pos[0], lat: pos[1] });
  }
  return out;
}

export type Row = { label: string; status: Status; count: number; names: string[] };

const statusOrder: Record<Status, number> = { watch: 0, suspicious: 1, unlisted: 2, priority: 3 };

export function summary(inWater: InWater[], labelOf: (v: Vessel) => string): Row[] {
  const rows: Row[] = [];
  for (const { vessel, status } of inWater) {
    const label = labelOf(vessel);
    const row = rows.find((r) => r.status === status && r.label === label);
    if (row) {
      row.count++;
      row.names.push(vessel.name);
    } else rows.push({ label, status, count: 1, names: [vessel.name] });
  }
  return rows.sort(
    (a, b) =>
      statusOrder[a.status] - statusOrder[b.status] ||
      b.count - a.count ||
      a.label.localeCompare(b.label),
  );
}
