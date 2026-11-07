import { expect, test } from "vitest";
import { callsignText } from "./privacy";

test("callsignText shows a broadcast call sign as it is", () => {
  expect(callsignText("Tug", "WDJ7956")).toBe("WDJ7956");
});

test("callsignText says a private boat's call sign is hidden, not missing", () => {
  expect(callsignText("Pleasure craft", "")).toBe("hidden (private boat)");
  expect(callsignText("Sailing", "")).toBe("hidden (private boat)");
  expect(callsignText("Fishing", "")).toBe("hidden (private boat)");
  // The live feed keeps a vessel private until its type arrives.
  expect(callsignText("Unknown", "")).toBe("hidden (private boat)");
});

test("callsignText says not broadcast when a public vessel sends none", () => {
  expect(callsignText("Tug", "")).toBe("not broadcast");
});
