import { expect, test } from "vitest";
import { data, type Vessel } from "@/lib/data";
import { isInside, newEntries, positionAt } from "./vessel";

const square = [
  [0, 0],
  [1, 0],
  [1, 1],
  [0, 1],
  [0, 0],
];
// An L: the unit square plus the one to its right, so the notch (1,1)-(2,2) is outside.
const ell = [
  [0, 0],
  [2, 0],
  [2, 1],
  [1, 1],
  [1, 2],
  [0, 2],
  [0, 0],
];

test("isInside tells a point in a square from one outside", () => {
  expect(isInside(0.5, 0.5, square)).toBe(true);
  expect(isInside(2, 2, square)).toBe(false);
});

test("isInside treats the notch of an L as outside", () => {
  expect(isInside(1.5, 1.5, ell)).toBe(false);
  expect(isInside(1.5, 0.5, ell)).toBe(true);
  expect(isInside(0.5, 1.5, ell)).toBe(true);
});

test("isInside places the organizers' example point in Lummi waters and Bellingham outside", () => {
  expect(isInside(-122.673718, 48.7734166, data.boundary.ring)).toBe(true);
  expect(isInside(-122.4787, 48.7519, data.boundary.ring)).toBe(false);
});

const track = [
  [100, 1, 2],
  [200, 3, 4],
  [300, 5, 6],
];

test("positionAt is the last fix at or before t, and null before the first", () => {
  expect(positionAt(track, 50)).toBeNull();
  expect(positionAt(track, 200)).toEqual([3, 4]);
  expect(positionAt(track, 250)).toEqual([3, 4]);
});

test("positionAt holds the last fix for 30 minutes, then goes null", () => {
  expect(positionAt(track, 300 + 1800)).toEqual([5, 6]);
  expect(positionAt(track, 300 + 1801)).toBeNull();
});

const vessel = (id: string, track: number[][], priority = false): Vessel => ({
  id,
  source: "test",
  name: `Boat ${id}`,
  type: "Tug",
  length_m: null,
  priority,
  track,
});

test("newEntries reports the first fix inside after one outside", () => {
  const a = vessel("a", [
    [100, 2, 2],
    [200, 0.5, 0.5],
    [300, 0.6, 0.6],
  ]);
  expect(newEntries([a], square, 0, 1000)).toEqual([
    { vesselId: "a", name: "Boat a", t: 200, lon: 0.5, lat: 0.5, status: "suspicious" },
  ]);
});

test("newEntries counts a window as (from, to] and is empty when to <= from", () => {
  const a = vessel("a", [
    [100, 2, 2],
    [200, 0.5, 0.5],
  ]);
  expect(newEntries([a], square, 200, 1000)).toEqual([]);
  expect(newEntries([a], square, 100, 200)).toHaveLength(1);
  expect(newEntries([a], square, 200, 200)).toEqual([]);
  expect(newEntries([a], square, 1000, 0)).toEqual([]);
});

test("newEntries skips a track that starts inside and every priority vessel", () => {
  const inside = vessel("in", [
    [100, 0.5, 0.5],
    [200, 0.6, 0.6],
  ]);
  const ferry = vessel(
    "ferry",
    [
      [100, 2, 2],
      [200, 0.5, 0.5],
    ],
    true,
  );
  expect(newEntries([inside, ferry], square, 0, 1000)).toEqual([]);
});

test("newEntries lists every entry across vessels in time order", () => {
  const a = vessel("a", [
    [100, 2, 2],
    [200, 0.5, 0.5],
    [300, 2, 2],
    [400, 0.5, 0.5],
  ]);
  const b = vessel("b", [
    [100, 2, 2],
    [150, 0.5, 0.5],
  ]);
  expect(newEntries([a, b], square, 0, 1000).map((e) => [e.vesselId, e.t])).toEqual([
    ["b", 150],
    ["a", 200],
    ["a", 400],
  ]);
});

test("over the whole recorded window only the synthetic vessel enters Lummi waters", () => {
  const from = Date.parse(data.window.start) / 1000;
  const to = Date.parse(data.window.end) / 1000;
  const ids = newEntries(data.vessels, data.boundary.ring, from, to).map((e) => e.vesselId);
  expect(ids.length).toBeGreaterThan(0);
  expect(new Set(ids)).toEqual(new Set(["demo"]));
});
