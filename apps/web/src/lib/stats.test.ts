import { expect, test } from "vitest";
import { data, type Vessel } from "@/lib/data";
import {
  byCategory,
  categoryOf,
  countsOverTime,
  DEFAULT_FILTER,
  extent,
  filterVessels,
  heatmap,
  parseFilter,
  serializeFilter,
  stepFor,
  tilesFor,
  type Filter,
} from "./stats";

const vessel = (
  id: string,
  type: string,
  track: number[][],
  extra: Partial<Vessel> = {},
): Vessel => ({
  id,
  source: "test",
  name: `BOAT ${id}`,
  type,
  length_m: null,
  callsign: "",
  fleet: null,
  priority: false,
  track,
  ...extra,
});

const all: Filter = DEFAULT_FILTER;

test("categoryOf groups AIS types into the five filter categories", () => {
  expect(categoryOf(vessel("a", "Fishing", []))).toBe("fishing");
  expect(categoryOf(vessel("b", "Pleasure craft", []))).toBe("pleasure");
  expect(categoryOf(vessel("c", "Sailing", []))).toBe("pleasure");
  expect(categoryOf(vessel("d", "Law enforcement", []))).toBe("government");
  expect(categoryOf(vessel("e", "Tug", []))).toBe("other");
});

test("categoryOf calls a vessel a ferry by its fleet or WSF, not by the wide Passenger type", () => {
  expect(categoryOf(vessel("a", "Passenger", [], { name: "WSF CHELAN" }))).toBe("ferry");
  expect(categoryOf(vessel("b", "Passenger", [], { fleet: "Whatcom County ferry" }))).toBe("ferry");
  expect(categoryOf(vessel("c", "Passenger", [], { name: "CHIEF ARROW" }))).toBe("other");
});

test("filterVessels keeps the chosen categories", () => {
  const vs = [
    vessel("a", "Fishing", []),
    vessel("b", "Fishing", []),
    vessel("c", "Passenger", [], { name: "WSF YAKIMA" }),
    vessel("d", "Cargo", []),
  ];
  const ids = (f: Filter) => filterVessels(vs, f).map((v) => v.id);
  expect(ids(all)).toEqual(["a", "b", "c", "d"]);
  expect(ids({ ...all, categories: new Set(["fishing", "ferry"]) })).toEqual(["a", "b", "c"]);
});

test("a filter survives a round trip through storage", () => {
  const f: Filter = { categories: new Set(["ferry"]), start: 100, end: null };
  expect(parseFilter(serializeFilter(f))).toEqual(f);
});

test("parseFilter refuses anything malformed", () => {
  expect(parseFilter("not json")).toBeNull();
  expect(parseFilter("{}")).toBeNull();
  expect(parseFilter('{"categories":["boats"],"start":null,"end":null}')).toBeNull();
  // Filters saved while org tags existed still load, without them.
  expect(parseFilter('{"categories":[],"orgs":["XWL"],"start":null,"end":null}')).toEqual({
    categories: new Set(),
    start: null,
    end: null,
  });
  expect(parseFilter('{"categories":[],"start":"soon","end":null}')).toBeNull();
});

test("stepFor picks a bucket that gives at most 60 points", () => {
  expect(stepFor(3600)).toBe(300);
  expect(stepFor(5 * 86400)).toBe(7200);
});

const square = [
  [-1, -1],
  [1, -1],
  [1, 1],
  [-1, 1],
  [-1, -1],
];

test("countsOverTime counts distinct vessels per bucket, once each however many fixes", () => {
  const a = vessel("a", "Fishing", [
    [0, 0, 0],
    [300, 0, 0],
    [600, 0, 0],
    [3600, 0, 0],
  ]);
  const b = vessel("b", "Fishing", [[3700, 0, 0]]);
  expect(countsOverTime([a, b], 0, 7200, 3600, square)).toEqual([
    { t: 0, count: 1 },
    { t: 3600, count: 2 },
  ]);
});

test("countsOverTime ignores fixes outside the window", () => {
  const a = vessel("a", "Fishing", [
    [-1, 0, 0],
    [7200, 0, 0],
  ]);
  expect(countsOverTime([a], 0, 7200, 3600, square).map((p) => p.count)).toEqual([0, 0]);
});

test("countsOverTime counts a vessel only while its fix is inside the ring", () => {
  const a = vessel("a", "Fishing", [
    [0, 5, 5],
    [3600, 0, 0],
    [3900, 5, 5],
  ]);
  expect(countsOverTime([a], 0, 7200, 3600, square).map((p) => p.count)).toEqual([0, 1]);
});

test("byCategory counts each vessel seen in the window once", () => {
  const vs = [
    vessel("a", "Fishing", [[10, 0, 0]]),
    vessel("b", "Fishing", [[20, 0, 0]]),
    vessel("c", "Sailing", [[30, 0, 0]]),
    vessel("d", "Tug", [[9999, 0, 0]]),
  ];
  expect(byCategory(vs, 0, 100)).toEqual({
    fishing: 2,
    pleasure: 1,
    government: 0,
    ferry: 0,
    other: 0,
  });
});

test("heatmap counts fixes per cell, north row first, and drops what is outside the box", () => {
  const box = { west: 0, east: 2, south: 0, north: 2 };
  const a = vessel("a", "Fishing", [
    [0, 0.5, 1.5], // north-west cell
    [1, 0.5, 1.5],
    [2, 1.5, 0.5], // south-east cell
    [3, 5, 5], // outside the box
    [99, 0.5, 1.5], // outside the window
  ]);
  const heat = heatmap([a], 0, 10, box, 2, 2);
  expect(heat.counts).toEqual([2, 0, 0, 1]);
  expect(heat.max).toBe(2);
});

test("extent is the box around every fix", () => {
  const a = vessel("a", "Fishing", [
    [0, -1, 2],
    [1, 3, -4],
  ]);
  expect(extent([a])).toEqual({ west: -1, east: 3, south: -4, north: 2 });
});

test("on the recorded days every vessel lands in a category and the heatmap holds every fix", () => {
  const start = Date.parse(data.window.start) / 1000;
  const end = Date.parse(data.window.end) / 1000 + 1;
  const counts = byCategory(data.vessels, start, end);
  const seen = data.vessels.filter((v) => v.track.some(([t = 0]) => t >= start && t < end));
  expect(Object.values(counts).reduce((a, b) => a + b, 0)).toBe(seen.length);
  const fixes = data.vessels.reduce((n, v) => n + v.track.length, 0);
  const heat = heatmap(data.vessels, start, end, extent(data.vessels), 40, 30);
  expect(heat.counts.reduce((a, b) => a + b, 0)).toBe(fixes);
});

test("tilesFor covers the box with OSM tiles whose edges bracket it", () => {
  const box = { west: -122.97, east: -122.49, south: 48.54, north: 48.89 };
  const tiles = tilesFor(box, 11);
  expect(tiles.length).toBeGreaterThan(1);
  expect(Math.min(...tiles.map((t) => t.west))).toBeLessThanOrEqual(box.west);
  expect(Math.max(...tiles.map((t) => t.east))).toBeGreaterThanOrEqual(box.east);
  expect(Math.min(...tiles.map((t) => t.south))).toBeLessThanOrEqual(box.south);
  expect(Math.max(...tiles.map((t) => t.north))).toBeGreaterThanOrEqual(box.north);
  // Tile 0/0/0 spans the whole Web Mercator world.
  const [world] = tilesFor({ west: -1, east: 1, south: -1, north: 1 }, 0);
  expect(world?.west).toBe(-180);
  expect(world?.north).toBeCloseTo(85.0511, 3);
});
