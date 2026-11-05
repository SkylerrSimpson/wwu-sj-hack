import { expect, test } from "vitest";
import { data, sourceOf } from "./data";

test("sourceOf resolves each record's source", () => {
  for (const item of data.records) expect(sourceOf(item)?.id).toBe(item.source);
});

test("sourceOf is undefined for an unknown source", () => {
  expect(sourceOf({ id: "x", source: "nowhere", name: "x" })).toBeUndefined();
});
