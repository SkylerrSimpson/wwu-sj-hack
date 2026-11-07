import { expect, test } from "vitest";
import type { LiveRecord } from "./live";
import { dayChoices, reportsUrl, thin } from "./history";

const record: LiveRecord = {
  id: "v-1",
  name: "WHATCOM CHIEF",
  type: "Passenger",
  length_m: 32,
  callsign: "WDA1234",
  lat: 48.73,
  lon: -122.67,
  heard_at: "2026-06-24T00:00:10Z",
  heading: null,
};

test("dayChoices lists one UTC day per day a segment touches, a partial last day included", () => {
  expect(
    dayChoices([
      { source: "noaa", from: "2026-06-24T00:00:00.000Z", to: "2026-06-26T00:00:00.000Z" },
      { source: "aisstream", from: "2026-11-07T20:47:41.679Z", to: "2026-11-08T01:10:00.000Z" },
    ]),
  ).toEqual([
    { label: "Wed, Jun 24, 2026", from: 1782259200, to: 1782345600, source: "noaa" },
    { label: "Thu, Jun 25, 2026", from: 1782345600, to: 1782432000, source: "noaa" },
    { label: "Sat, Nov 7, 2026", from: 1794009600, to: 1794096000, source: "aisstream" },
    { label: "Sun, Nov 8, 2026", from: 1794096000, to: 1794182400, source: "aisstream" },
  ]);
  // A segment whose dates do not parse is skipped, not a crash.
  expect(dayChoices([{ source: "noaa", from: "soon", to: "later" }])).toEqual([]);
});

test("thin keeps the first record per vessel in each five-minute bucket, in order", () => {
  const at = (heard_at: string, id = "v-1") => ({ ...record, id, heard_at });
  expect(
    thin([
      at("2026-06-24T00:00:10Z"),
      at("2026-06-24T00:00:30Z", "v-2"),
      at("2026-06-24T00:03:00Z"),
      at("2026-06-24T00:05:00Z"),
      at("2026-06-24T00:06:00Z", "v-2"),
      at("2026-06-24T00:09:59Z"),
    ]),
  ).toEqual([
    at("2026-06-24T00:00:10Z"),
    at("2026-06-24T00:00:30Z", "v-2"),
    at("2026-06-24T00:05:00Z"),
    at("2026-06-24T00:06:00Z", "v-2"),
  ]);
  expect(thin([at("2026-06-24T00:00:10Z"), at("2026-06-24T00:00:40Z")], 60)).toHaveLength(1);
});

test("reportsUrl asks for one whole day inside the box, 50000 rows a page, and pages with after", () => {
  const box = "48.544,-122.974,48.895,-122.486";
  expect(reportsUrl("https://s.test", 1782259200, 1782345600, box)).toBe(
    "https://s.test/v1/reports?from=2026-06-24T00%3A00%3A00.000Z&to=2026-06-25T00%3A00%3A00.000Z&limit=50000&box=48.544%2C-122.974%2C48.895%2C-122.486",
  );
  expect(
    reportsUrl("https://s.test", 1782259200, 1782345600, box, "1782336191.0~338329348~noaa"),
  ).toContain("&after=1782336191.0%7E338329348%7Enoaa");
});
