import { expect, test } from "vitest";
import { PANEL_DEFAULT, PANEL_MAX, PANEL_MIN, clampPanelWidth } from "./panel";

test("clampPanelWidth keeps a width between the minimum and the maximum", () => {
  expect(clampPanelWidth(400, 1600)).toBe(400);
  expect(clampPanelWidth(100, 1600)).toBe(PANEL_MIN);
  expect(clampPanelWidth(2000, 1600)).toBe(PANEL_MAX);
});

test("clampPanelWidth leaves at least 120 px of map on a narrow window", () => {
  expect(clampPanelWidth(600, 600)).toBe(480);
});

test("clampPanelWidth never goes below the minimum, even on a tiny window", () => {
  expect(clampPanelWidth(600, 300)).toBe(PANEL_MIN);
});

test("clampPanelWidth rounds to whole pixels and treats a non-number as the default", () => {
  expect(clampPanelWidth(300.6, 1600)).toBe(301);
  expect(clampPanelWidth(Number.NaN, 1600)).toBe(PANEL_DEFAULT);
});
