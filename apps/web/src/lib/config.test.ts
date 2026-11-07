import { expect, test } from "vitest";
import { data, type Vessel } from "@/lib/data";
import {
  DEFAULT_CONFIG,
  labelOf,
  listsFor,
  matchedPattern,
  parseConfig,
  serializeConfig,
  type Config,
  type Pattern,
} from "./config";

const vessel = (name: string, callsign = "", fleet: string | null = null): Vessel => ({
  id: name,
  source: "test",
  name,
  type: "Tug",
  length_m: null,
  callsign,
  fleet,
  priority: fleet !== null,
  track: [],
});

const wsf: Pattern = { text: "WSF", label: "Washington State Ferries", field: "name" };
const xwl: Pattern = { text: "XWL", label: "Lummi Nation", field: "callsign" };

test("matchedPattern finds a pattern in the name and returns null when none matches", () => {
  expect(matchedPattern(vessel("WSF CHELAN"), [xwl, wsf])).toEqual(wsf);
  expect(matchedPattern(vessel("SEASPAN RAVEN"), [xwl, wsf])).toBeNull();
});

test("matchedPattern looks in the call sign too, ignoring case", () => {
  expect(matchedPattern(vessel("Patrol one", "xwl"), [wsf, xwl])).toEqual(xwl);
  expect(matchedPattern(vessel("wsf chelan"), [wsf])).toEqual(wsf);
});

test("matchedPattern matches whole words only, split on spaces, hyphens and slashes", () => {
  const cg: Pattern = { text: "CG", label: "Coast Guard", field: "name" };
  expect(matchedPattern(vessel("CMA CGM MARCO POLO"), [cg])).toBeNull();
  expect(matchedPattern(vessel("WSF-CHELAN/2"), [wsf])).toEqual(wsf);
  expect(matchedPattern(vessel("Patrol one", "xwl123"), [xwl])).toBeNull();
});

test("matchedPattern takes the first pattern in order and skips empty text", () => {
  const empty: Pattern = { text: "", label: "Everything", field: "name" };
  const chelan: Pattern = { text: "CHELAN", label: "Chelan", field: "name" };
  expect(matchedPattern(vessel("WSF CHELAN"), [empty, chelan, wsf])).toEqual(chelan);
  expect(matchedPattern(vessel("SEASPAN RAVEN"), [empty])).toBeNull();
});

test("listsFor adds every matched vessel to the approved ids and passes the watch ids through", () => {
  const config: Config = {
    patterns: [wsf],
    priority: new Set(["private-1"]),
    watch: new Set(["private-2"]),
  };
  const vessels = [vessel("WSF CHELAN"), vessel("SEASPAN RAVEN"), vessel("private-1")];
  expect(listsFor(vessels, config)).toEqual({
    priority: new Set(["private-1", "WSF CHELAN"]),
    watch: new Set(["private-2"]),
  });
  expect(config.priority).toEqual(new Set(["private-1"]));
});

test("labelOf prefers the data's fleet, then the pattern label, then approval, then the type", () => {
  const config: Config = { patterns: [wsf], priority: new Set(["private-1"]), watch: new Set() };
  expect(labelOf(vessel("WSF CHELAN", "", "Whatcom County ferry"), config)).toBe(
    "Whatcom County ferry",
  );
  expect(labelOf(vessel("WSF CHELAN"), config)).toBe("Washington State Ferries");
  expect(labelOf(vessel("private-1"), config)).toBe("Approved by the Nation");
  expect(labelOf(vessel("SEASPAN RAVEN"), config)).toBe("Tug");
});

test("parseConfig returns null for garbage, missing keys and non-string entries", () => {
  expect(parseConfig("not json")).toBeNull();
  expect(parseConfig("null")).toBeNull();
  expect(parseConfig('{"patterns":[],"priority":[]}')).toBeNull();
  expect(parseConfig('{"patterns":[],"priority":[1],"watch":[]}')).toBeNull();
  expect(parseConfig('{"patterns":[{"text":"WSF"}],"priority":[],"watch":[]}')).toBeNull();
});

test("parseConfig reads arrays into Sets and a pattern list", () => {
  const text =
    '{"patterns":[{"text":"WSF","label":"Washington State Ferries","field":"name"}],"priority":["a"],"watch":["b"]}';
  expect(parseConfig(text)).toEqual({
    patterns: [wsf],
    priority: new Set(["a"]),
    watch: new Set(["b"]),
  });
});

test("serializeConfig writes JSON with arrays that parseConfig reads back", () => {
  const config: Config = { patterns: [wsf], priority: new Set(["a"]), watch: new Set(["b"]) };
  expect(serializeConfig(config)).toBe(
    '{"patterns":[{"text":"WSF","label":"Washington State Ferries","field":"name"}],"priority":["a"],"watch":["b"]}',
  );
  expect(parseConfig(serializeConfig(config))).toEqual(config);
  expect(parseConfig(serializeConfig(DEFAULT_CONFIG))).toEqual(DEFAULT_CONFIG);
});

test("DEFAULT_CONFIG approves the four WSF ferries in the recording and nothing else by pattern", () => {
  const matched = data.vessels.filter((v) => matchedPattern(v, DEFAULT_CONFIG.patterns));
  expect(matched.map((v) => v.name).sort()).toEqual([
    "WSF CHELAN",
    "WSF KALEETAN",
    "WSF TILLIKUM",
    "WSF YAKIMA",
  ]);
  expect(matched.map((v) => labelOf(v, DEFAULT_CONFIG))).toEqual(
    Array<string>(4).fill("Washington State Ferries"),
  );
  expect(DEFAULT_CONFIG.priority.size).toBe(0);
  expect(DEFAULT_CONFIG.watch.size).toBe(0);
});

test("a call-sign pattern never matches a name: SUN does not approve the tug SUN SPIRIT", () => {
  const sun: Pattern = { text: "SUN", label: "Suquamish Tribe", field: "callsign" };
  const base = {
    source: "ais",
    type: "Tug",
    length_m: 30,
    fleet: null,
    priority: false,
    track: [],
  };
  const spirit = { ...base, id: "1", name: "SUN SPIRIT", callsign: "WDA1" };
  const coded = { ...base, id: "2", name: "TUG", callsign: "SUN" };
  expect(matchedPattern(spirit, [sun])).toBeNull();
  expect(matchedPattern(coded, [sun])).toEqual(sun);
  expect(matchedPattern(spirit, DEFAULT_CONFIG.patterns)).toBeNull();
});
