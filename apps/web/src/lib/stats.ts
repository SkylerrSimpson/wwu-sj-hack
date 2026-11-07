import { matchedPattern, type Pattern } from "@/lib/config";
import type { Vessel } from "@/lib/data";
import { isInside } from "@/lib/vessel";

export type Category = "fishing" | "pleasure" | "government" | "ferry" | "other";

export const CATEGORIES: [Category, string][] = [
  ["fishing", "Fishing"],
  ["pleasure", "Pleasure and sailing"],
  ["government", "Government and police"],
  ["ferry", "Ferry"],
  ["other", "Other"],
];

// `start` and `end` are unix seconds, or null to follow the data and the clock.
export type Filter = {
  categories: Set<Category>;
  start: number | null;
  end: number | null;
};
export type Box = { west: number; east: number; south: number; north: number };
export type Heat = { counts: number[]; cols: number; rows: number; max: number };

export const DEFAULT_FILTER: Filter = {
  categories: new Set(CATEGORIES.map(([c]) => c)),
  start: null,
  end: null,
};

const GOVERNMENT = new Set(["Law enforcement", "Search and rescue", "Military"]);
const WSF: Pattern[] = [{ text: "WSF", label: "Washington State Ferries", field: "name" }];

export function categoryOf(v: Vessel): Category {
  if (v.type === "Fishing") return "fishing";
  if (v.type === "Pleasure craft" || v.type === "Sailing") return "pleasure";
  if (GOVERNMENT.has(v.type)) return "government";
  // "Passenger" also covers water taxis and whale-watching boats, so it can't mean ferry.
  if (/ferry/i.test(v.fleet ?? "") || matchedPattern(v, WSF)) return "ferry";
  return "other";
}

export function filterVessels(vessels: Vessel[], f: Filter): Vessel[] {
  return vessels.filter((v) => f.categories.has(categoryOf(v)));
}

const isCategory = (x: unknown): x is Category => CATEGORIES.some(([c]) => c === x);
const isTime = (x: unknown): x is number | null => x === null || typeof x === "number";

export function parseFilter(text: string): Filter | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  const { categories, start, end } = parsed as Record<string, unknown>;
  if (!Array.isArray(categories) || !categories.every(isCategory)) return null;
  if (!isTime(start) || !isTime(end)) return null;
  return { categories: new Set(categories), start, end };
}

export function serializeFilter(f: Filter): string {
  return JSON.stringify({ categories: [...f.categories], start: f.start, end: f.end });
}

const STEPS = [300, 900, 1800, 3600, 7200, 21600, 43200, 86400];

export function stepFor(span: number): number {
  return STEPS.find((s) => span / s <= 60) ?? 86400;
}

// Distinct vessels with at least one fix in each bucket [t, t + step).
// One inside flag per fix, computed once per track and ring: the charts re-run on every move of
// the time cut and would otherwise ray-cast all 124,000 fixes each time (measured 468 ms).
const insideFlags = new WeakMap<number[][], WeakMap<number[][], Uint8Array>>();
function flagsFor(track: number[][], ring: number[][]): Uint8Array {
  let byRing = insideFlags.get(ring);
  if (!byRing) insideFlags.set(ring, (byRing = new WeakMap()));
  const cached = byRing.get(track);
  if (cached) return cached;
  const flags = new Uint8Array(track.length);
  track.forEach(([, lon = 0, lat = 0], k) => {
    flags[k] = isInside(lon, lat, ring) ? 1 : 0;
  });
  byRing.set(track, flags);
  return flags;
}

export function countsOverTime(
  vessels: Vessel[],
  start: number,
  end: number,
  step: number,
  ring: number[][],
): { t: number; count: number }[] {
  const counts = Array.from({ length: Math.max(0, Math.ceil((end - start) / step)) }, () => 0);
  for (const v of vessels) {
    const flags = flagsFor(v.track, ring);
    let last = -1;
    for (let k = 0; k < v.track.length; k++) {
      const t = v.track[k]?.[0] ?? 0;
      if (t < start || t >= end) continue;
      const i = Math.floor((t - start) / step);
      if (i === last || !flags[k]) continue;
      counts[i] = (counts[i] ?? 0) + 1;
      last = i;
    }
  }
  return counts.map((count, i) => ({ t: start + i * step, count }));
}

export function byCategory(
  vessels: Vessel[],
  start: number,
  end: number,
): Record<Category, number> {
  const out: Record<Category, number> = {
    fishing: 0,
    pleasure: 0,
    government: 0,
    ferry: 0,
    other: 0,
  };
  for (const v of vessels)
    if (v.track.some(([t = 0]) => t >= start && t < end)) out[categoryOf(v)]++;
  return out;
}

// Fixes per cell, row 0 at the north; each fix stands for about 5 minutes in the water.
export function heatmap(
  vessels: Vessel[],
  start: number,
  end: number,
  box: Box,
  cols: number,
  rows: number,
): Heat {
  const counts = Array.from({ length: cols * rows }, () => 0);
  for (const v of vessels)
    for (const [t = 0, lon = 0, lat = 0] of v.track) {
      if (t < start || t >= end) continue;
      if (lon < box.west || lon > box.east || lat < box.south || lat > box.north) continue;
      // The east and north edges belong to the last cell, not to one past it.
      const c = Math.min(cols - 1, Math.floor(((lon - box.west) / (box.east - box.west)) * cols));
      const r = Math.min(
        rows - 1,
        Math.floor(((box.north - lat) / (box.north - box.south)) * rows),
      );
      counts[r * cols + c] = (counts[r * cols + c] ?? 0) + 1;
    }
  return { counts, cols, rows, max: Math.max(0, ...counts) };
}

export function extent(vessels: Vessel[]): Box {
  const box = { west: Infinity, east: -Infinity, south: Infinity, north: -Infinity };
  for (const v of vessels)
    for (const [, lon = 0, lat = 0] of v.track) {
      box.west = Math.min(box.west, lon);
      box.east = Math.max(box.east, lon);
      box.south = Math.min(box.south, lat);
      box.north = Math.max(box.north, lat);
    }
  return box;
}

export type Tile = { z: number; x: number; y: number } & Box;

// Web Mercator (OSM) tiles at zoom z that cover the box, with each tile's edges in degrees.
export function tilesFor(box: Box, z: number): Tile[] {
  const n = 2 ** z;
  const tx = (lon: number) => Math.floor(((lon + 180) / 360) * n);
  const ty = (lat: number) => {
    const r = (lat * Math.PI) / 180;
    return Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n);
  };
  const lonOf = (x: number) => (x / n) * 360 - 180;
  const latOf = (y: number) => (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / n))) * 180) / Math.PI;
  const tiles: Tile[] = [];
  for (let y = ty(box.north); y <= ty(box.south); y++)
    for (let x = tx(box.west); x <= tx(box.east); x++)
      tiles.push({
        z,
        x,
        y,
        west: lonOf(x),
        east: lonOf(x + 1),
        north: latOf(y),
        south: latOf(y + 1),
      });
  return tiles;
}
