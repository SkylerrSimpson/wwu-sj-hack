import type { Vessel } from "@/lib/data";
import type { Lists } from "@/lib/vessel";

export type PatternField = "callsign" | "name";
export type Pattern = { text: string; label: string; field: PatternField };
export type Config = { patterns: Pattern[]; priority: Set<string>; watch: Set<string> };

export const DEFAULT_CONFIG: Config = {
  // The tribal codes come from the Nation's representative and live in call signs; a code
  // matched against names approves the wrong boats (a tug called SUN SPIRIT).
  patterns: [
    { text: "XWL", label: "Lummi Nation", field: "callsign" },
    { text: "WSF", label: "Washington State Ferries", field: "name" },
    { text: "HOH", label: "Hoh Tribe", field: "callsign" },
    { text: "JST", label: "Jamestown S'Klallam Tribe", field: "callsign" },
    { text: "KWA", label: "Quinault Nation", field: "callsign" },
    { text: "KWL", label: "Quileute Nation", field: "callsign" },
    { text: "LEK", label: "Lower Elwha Klallam Tribe", field: "callsign" },
    { text: "MKH", label: "Makah Tribe", field: "callsign" },
    { text: "NKK", label: "Nooksack Tribe", field: "callsign" },
    { text: "PGK", label: "Port Gamble S'Klallam Tribe", field: "callsign" },
    { text: "SKK", label: "Skokomish Tribe", field: "callsign" },
    { text: "SST", label: "Sauk-Suiattle Tribe", field: "callsign" },
    { text: "STL", label: "Stillaguamish Tribe", field: "callsign" },
    { text: "SUN", label: "Suquamish Tribe", field: "callsign" },
    { text: "SWN", label: "Swinomish Tribe", field: "callsign" },
    { text: "SXN", label: "Squaxin Island Tribe", field: "callsign" },
    { text: "TUL", label: "Tulalip Tribe", field: "callsign" },
  ],
  priority: new Set(),
  watch: new Set(),
};

const wordsOf = (s: string) => new Set(s.toLowerCase().split(/[\s/-]+/));

// Whole words of one field, not substrings: CG must not approve CMA CGM, and a call-sign code
// must not approve a name that happens to contain it.
export function matchedPattern(v: Vessel, patterns: Pattern[]): Pattern | null {
  const words = { callsign: wordsOf(v.callsign), name: wordsOf(v.name) };
  return patterns.find((p) => p.text !== "" && words[p.field].has(p.text.toLowerCase())) ?? null;
}

// Moving a vessel onto one list takes it off the other; null takes it off both.
export function moveTo(config: Config, list: "priority" | "watch" | null, id: string): Config {
  const next = {
    patterns: config.patterns,
    priority: new Set(config.priority),
    watch: new Set(config.watch),
  };
  next.priority.delete(id);
  next.watch.delete(id);
  if (list) next[list].add(id);
  return next;
}

export function listsFor(vessels: Vessel[], config: Config): Lists {
  const priority = new Set(config.priority);
  for (const v of vessels) if (matchedPattern(v, config.patterns)) priority.add(v.id);
  return { priority, watch: config.watch };
}

export function labelOf(v: Vessel, config: Config): string {
  return (
    v.fleet ??
    matchedPattern(v, config.patterns)?.label ??
    (config.priority.has(v.id) ? "Approved by the Nation" : v.type)
  );
}

const isString = (x: unknown): x is string => typeof x === "string";
const isPattern = (x: unknown): x is Pattern =>
  typeof x === "object" &&
  x !== null &&
  isString((x as Record<string, unknown>).text) &&
  isString((x as Record<string, unknown>).label);

export function parseConfig(text: string): Config | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  const { patterns, priority, watch } = parsed as Record<string, unknown>;
  if (!Array.isArray(patterns) || !Array.isArray(priority) || !Array.isArray(watch)) return null;
  if (!patterns.every(isPattern) || !priority.every(isString) || !watch.every(isString))
    return null;
  return {
    // Configurations saved before patterns had a field matched names.
    patterns: patterns.map(({ text, label, field }) => ({
      text,
      label,
      field: field === "callsign" ? "callsign" : "name",
    })),
    priority: new Set(priority),
    watch: new Set(watch),
  };
}

export function serializeConfig(config: Config): string {
  return JSON.stringify({
    patterns: config.patterns,
    priority: [...config.priority],
    watch: [...config.watch],
  });
}
