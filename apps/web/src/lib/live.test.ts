import { expect, test } from "vitest";
import { MAX_POINTS, merge, parseRecord, toVessel, type LiveRecord } from "./live";

const record: LiveRecord = {
  id: "v-1",
  name: "WHATCOM CHIEF",
  type: "Passenger",
  length_m: 32,
  callsign: "WDA1234",
  lat: 48.73,
  lon: -122.67,
  heard_at: "2026-11-07T19:48:11.907Z",
};

test("parseRecord accepts the streamer's record and rejects one missing a position", () => {
  expect(parseRecord({ ...record, callsign: null, length_m: null })).toEqual({
    ...record,
    callsign: null,
    length_m: null,
  });
  expect(parseRecord({ ...record, lat: "48" })).toBeNull();
  expect(parseRecord("nonsense")).toBeNull();
});

test("toVessel makes a one-point track in unix seconds, unapproved and with no fleet", () => {
  expect(toVessel(record)).toEqual({
    id: "v-1",
    source: "aisstream",
    name: "WHATCOM CHIEF",
    type: "Passenger",
    length_m: 32,
    callsign: "WDA1234",
    fleet: null,
    priority: false,
    track: [[1794080891, -122.67, 48.73]],
  });
});

test("merge appends newer fixes in order, ignores stale ones, and keeps the newest MAX_POINTS", () => {
  let vessels = merge(new Map(), record);
  vessels = merge(vessels, { ...record, lat: 48.74, heard_at: "2026-11-07T19:49:00Z" });
  vessels = merge(vessels, { ...record, lat: 48.0, heard_at: "2026-11-07T19:48:30Z" });
  expect(vessels.get("v-1")?.track).toEqual([
    [1794080891, -122.67, 48.73],
    [1794080940, -122.67, 48.74],
  ]);
  for (let i = 0; i < MAX_POINTS + 5; i++) {
    vessels = merge(vessels, {
      ...record,
      heard_at: new Date(1794081000000 + i * 60000).toISOString(),
    });
  }
  expect(vessels.get("v-1")?.track).toHaveLength(MAX_POINTS);
});
