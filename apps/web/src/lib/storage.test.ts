import { expect, test } from "vitest";
import { DEFAULT_CONFIG, type Config } from "./config";
import { DEFAULT_FILTER, type Filter } from "./stats";
import {
  readConfig,
  readEmail,
  readFilter,
  readPanelWidth,
  writeConfig,
  writeEmail,
  writeFilter,
  writePanelWidth,
  type StorageLike,
} from "./storage";

const fake = (entries: [string, string][] = []) => {
  const map = new Map(entries);
  const storage: StorageLike = {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => {
      map.set(k, v);
    },
  };
  return { map, storage };
};

const throwing: StorageLike = {
  getItem: () => {
    throw new Error("blocked");
  },
  setItem: () => {
    throw new Error("blocked");
  },
};

test("readConfig falls back to DEFAULT_CONFIG when the key is missing or malformed", () => {
  expect(readConfig(fake().storage)).toEqual(DEFAULT_CONFIG);
  expect(readConfig(fake([["vesselConfig", "not json"]]).storage)).toEqual(DEFAULT_CONFIG);
  expect(readConfig(fake([["vesselConfig", '{"patterns":[]}']]).storage)).toEqual(DEFAULT_CONFIG);
});

test("writeConfig stores under vesselConfig and readConfig reads it back", () => {
  const { map, storage } = fake();
  const config: Config = {
    patterns: [{ text: "WSF", label: "Washington State Ferries", field: "name" }],
    priority: new Set(["a"]),
    watch: new Set(["b"]),
  };
  writeConfig(storage, config);
  expect([...map.keys()]).toEqual(["vesselConfig"]);
  expect(readConfig(storage)).toEqual(config);
});

test("readEmail is empty when missing and writeEmail stores under alertEmail", () => {
  const { map, storage } = fake();
  expect(readEmail(storage)).toBe("");
  writeEmail(storage, "staff@example.org");
  expect([...map.keys()]).toEqual(["alertEmail"]);
  expect(readEmail(storage)).toBe("staff@example.org");
});

test("a storage that throws reads as empty and drops writes without throwing", () => {
  expect(readConfig(throwing)).toEqual(DEFAULT_CONFIG);
  expect(readEmail(throwing)).toBe("");
  expect(() => writeConfig(throwing, DEFAULT_CONFIG)).not.toThrow();
  expect(() => writeEmail(throwing, "staff@example.org")).not.toThrow();
});

test("readPanelWidth is null when missing or not a number, and writePanelWidth stores under panelWidth", () => {
  expect(readPanelWidth(fake().storage)).toBeNull();
  expect(readPanelWidth(fake([["panelWidth", "wide"]]).storage)).toBeNull();
  const { map, storage } = fake();
  writePanelWidth(storage, 420);
  expect([...map.entries()]).toEqual([["panelWidth", "420"]]);
  expect(readPanelWidth(storage)).toBe(420);
  expect(readPanelWidth(throwing)).toBeNull();
  expect(() => writePanelWidth(throwing, 420)).not.toThrow();
});

test("the map filter round-trips under plotFilter and falls back to every vessel", () => {
  const { map, storage } = fake();
  expect(readFilter(storage)).toEqual(DEFAULT_FILTER);
  const f: Filter = { categories: new Set(["fishing"]), start: 1, end: 2 };
  writeFilter(storage, f);
  expect([...map.keys()]).toEqual(["plotFilter"]);
  expect(readFilter(storage)).toEqual(f);
  expect(readFilter(throwing)).toEqual(DEFAULT_FILTER);
});
