import { expect, test } from "vitest";
import { data, sourceOf } from "./data";

test("every vessel and the boundary name a known source", () => {
  for (const v of data.vessels) expect(sourceOf(v.source)?.id).toBe(v.source);
  expect(sourceOf(data.boundary.source)?.id).toBe(data.boundary.source);
});

test("sourceOf is undefined for an unknown source", () => {
  expect(sourceOf("nowhere")).toBeUndefined();
});

test("every track is [t, lon, lat] points in time order", () => {
  const bad = data.vessels.filter((v) =>
    v.track.some((p, i) => p.length !== 3 || (i > 0 && (p[0] ?? 0) <= (v.track[i - 1]?.[0] ?? 0))),
  );
  expect(bad.map((v) => v.id)).toEqual([]);
});

test("the boundary ring is closed", () => {
  expect(data.boundary.ring.at(0)).toEqual(data.boundary.ring.at(-1));
});
