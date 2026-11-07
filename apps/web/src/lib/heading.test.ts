import { expect, test } from "vitest";
import { arrowShape, bearing, directionAt } from "./heading";

const LAT = 48.75;
// 0.001 degrees of latitude is about 111 m.
const north = (m: number) => (m / 111_320) * 1;

test("bearing is degrees clockwise from north", () => {
  expect(bearing(-122.7, LAT, -122.7, LAT + 0.01)).toBeCloseTo(0);
  expect(bearing(-122.7, LAT, -122.69, LAT)).toBeCloseTo(90);
  expect(bearing(-122.7, LAT, -122.7, LAT - 0.01)).toBeCloseTo(180);
  expect(bearing(-122.7, LAT, -122.71, LAT)).toBeCloseTo(270);
});

test("directionAt points along the move from the previous fix to the one shown", () => {
  // 600 m north in 5 minutes is about 3.9 knots.
  const track = [
    [0, -122.7, LAT],
    [300, -122.7, LAT + north(600)],
  ];
  expect(directionAt(track, 300)).toBeCloseTo(0);
  expect(directionAt(track, 400)).toBeCloseTo(0);
});

test("directionAt is null for a boat moving under 1 knot, so drift at a dock shows no arrow", () => {
  // 100 m in 5 minutes is about 0.65 knots.
  const track = [
    [0, -122.7, LAT],
    [300, -122.7, LAT + north(100)],
  ];
  expect(directionAt(track, 300)).toBeNull();
});

test("directionAt is null before the track, at its first fix, across a long gap, or once stale", () => {
  const track = [
    [1000, -122.7, LAT],
    [1300, -122.7, LAT + north(600)],
    [9000, -122.7, LAT + north(1200)],
  ];
  expect(directionAt(track, 999)).toBeNull();
  expect(directionAt(track, 1000)).toBeNull();
  expect(directionAt(track, 9000)).toBeNull(); // 1300 to 9000 is over 30 minutes
  expect(directionAt(track, 1300 + 1801)).toBeNull(); // positionAt has dropped the dot
});

test("arrowShape draws a shaft from the dot's edge to a tip, and a head at the tip", () => {
  // North is up on screen, so a northward arrow's tip has a smaller y.
  const [shaft, head] = arrowShape(100, 100, 0, 6, 18, 5);
  expect(shaft).toEqual([
    [100, 94],
    [100, 82],
  ]);
  expect(head?.[1]).toEqual([100, 82]);
  const [left, , right] = head ?? [];
  expect(left?.[1]).toBeGreaterThan(82);
  expect(right?.[1]).toBeGreaterThan(82);
  expect(left?.[0]).toBeLessThan(100);
  expect(right?.[0]).toBeGreaterThan(100);
  const [east] = arrowShape(100, 100, 90, 6, 18, 5);
  expect(east?.[1]?.[0]).toBeCloseTo(118);
  expect(east?.[1]?.[1]).toBeCloseTo(100);
});
