import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { data, type Vessel } from "@/lib/data";
import type { Detection, SensorData } from "@/lib/sensors";
import { interpolateAt, corroboration, echoCounts, matchAis, radarEntries, wedge } from "./fusion";

const vessel = (id: string, track: number[][]): Vessel => ({
  id,
  source: "test",
  name: `Boat ${id}`,
  type: "Tug",
  length_m: null,
  callsign: "",
  fleet: null,
  priority: false,
  track,
});

// About 111 m per 0.001 degrees of latitude.
const LAT = 48.78;

test("interpolateAt interpolates between fixes, and is null outside the track or across a gap", () => {
  const track = [
    [1000, -122.7, LAT],
    [1300, -122.69, LAT],
    [5000, -122.68, LAT],
  ];
  expect(interpolateAt(track, 1000)).toEqual([-122.7, LAT]);
  expect(interpolateAt(track, 1150)?.[0]).toBeCloseTo(-122.695);
  expect(interpolateAt(track, 999)).toBeNull();
  expect(interpolateAt(track, 3000)).toBeNull(); // 1300 to 5000 is over 30 minutes
  expect(interpolateAt(track, 5001)).toBeNull();
});

test("matchAis names the AIS vessel that sits on the radar track, and null when none does", () => {
  const ais = vessel("tug", [
    [0, -122.7, LAT],
    [600, -122.69, LAT],
  ]);
  const far = vessel("far", [
    [0, -122.6, LAT],
    [600, -122.6, LAT],
  ]);
  const onTug = vessel("radar-1", [
    [0, -122.7, LAT + 0.0005],
    [300, -122.695, LAT],
    [600, -122.69, LAT],
  ]);
  const alone = vessel("radar-2", [
    [0, -122.75, LAT],
    [300, -122.75, LAT],
  ]);
  expect(matchAis(onTug, [far, ais])).toBe("tug");
  expect(matchAis(alone, [far, ais])).toBeNull();
});

test("matchAis needs the AIS vessel on at least half the radar fixes", () => {
  // The radar boat passes the AIS boat once and goes on alone.
  const moored = vessel("moored", [
    [0, -122.7, LAT],
    [1200, -122.7, LAT],
  ]);
  const passer = vessel("radar-1", [
    [0, -122.7, LAT],
    [300, -122.71, LAT],
    [600, -122.72, LAT],
    [900, -122.73, LAT],
  ]);
  expect(matchAis(passer, [moored])).toBeNull();
});

const square = [
  [0, 0],
  [1, 0],
  [1, 1],
  [0, 1],
  [0, 0],
];

test("radarEntries marks every crossing into the boundary unidentified", () => {
  const contact = vessel("radar-7", [
    [100, 2, 2],
    [200, 0.5, 0.5],
  ]);
  expect(radarEntries([contact], square, 0, 1000)).toEqual([
    {
      vesselId: "radar-7",
      name: "Boat radar-7",
      t: 200,
      lon: 0.5,
      lat: 0.5,
      status: "unidentified",
    },
  ]);
  expect(radarEntries([contact], square, 200, 1000)).toEqual([]);
});

const hit = (over: Partial<Detection>): Detection => ({
  t: 1000,
  sensor: "cam",
  kind: "camera",
  lon: -122.7,
  lat: LAT,
  size_m: 12,
  boat: true,
  label: "small vessel",
  confidence: 0.9,
  ...over,
});

test("corroboration keeps each other sensor's most confident hit near the radar fix", () => {
  const hits = [
    hit({ confidence: 0.7 }),
    hit({ confidence: 0.9, t: 1060 }),
    hit({ sensor: "lidar", kind: "lidar", boat: false, label: "debris", confidence: 0.6 }),
    hit({ sensor: "radar", kind: "radar" }), // radar is what is being corroborated
    hit({ sensor: "far", lat: LAT + 0.01 }), // over a kilometre away
    hit({ sensor: "late", t: 2000 }), // over two minutes later
  ];
  expect(corroboration(hits, -122.7, LAT, 1000)).toEqual([
    { sensor: "cam", kind: "camera", boat: true, label: "small vessel", confidence: 0.9 },
    { sensor: "lidar", kind: "lidar", boat: false, label: "debris", confidence: 0.6 },
  ]);
});

test("echoCounts counts radar echoes up to t, and how many were judged not a boat", () => {
  const hits = [
    hit({ kind: "radar", t: 100 }),
    hit({ kind: "radar", t: 200, boat: false, label: "bird" }),
    hit({ kind: "radar", t: 300, boat: false, label: "debris" }),
    hit({ kind: "camera", t: 100, boat: false }),
  ];
  expect(echoCounts(hits, 200)).toEqual({ echoes: 2, boats: 1, dropped: 1 });
  expect(echoCounts(hits, 300)).toEqual({ echoes: 3, boats: 1, dropped: 2 });
});

test("wedge starts and ends at the sensor and reaches its range at the centre bearing", () => {
  const ring = wedge({ lon: -122.7, lat: LAT, range_m: 1000, bearing_deg: 0, fov_deg: 90 });
  expect(ring.at(0)).toEqual([-122.7, LAT]);
  expect(ring.at(-1)).toEqual([-122.7, LAT]);
  const north = ring[Math.floor(ring.length / 2)] ?? [];
  expect(north[0]).toBeCloseTo(-122.7);
  expect(((north[1] ?? 0) - LAT) * 111_320).toBeCloseTo(1000, -1);
});

// The generated files: the app's copy has no ground truth; nonais/sensors.json keeps it for scoring.
const read = (path: string): unknown =>
  JSON.parse(readFileSync(new URL(path, import.meta.url), "utf-8"));
const sensors = read("../../public/sensors.json") as SensorData;
const truth = (read("../../../../nonais/sensors.json") as { truth: Record<string, unknown> }).truth;

test("matchAis finds the AIS vessel behind every synthetic radar track, and none for boats without AIS", () => {
  const matched = Object.fromEntries(sensors.vessels.map((v) => [v.id, matchAis(v, data.vessels)]));
  const expected = Object.fromEntries(
    Object.entries(truth).map(([id, t]) => [id, (t as { ais_id: string | null }).ais_id]),
  );
  expect(matched).toEqual(expected);
});

test("exactly one synthetic boat without AIS enters Lummi waters", () => {
  const unknown = sensors.vessels.filter((v) => matchAis(v, data.vessels) === null);
  const entries = radarEntries(unknown, data.boundary.ring, 0, Infinity);
  expect(entries).toHaveLength(1);
});
