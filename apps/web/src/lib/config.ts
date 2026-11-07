import type { Vessel } from "@/lib/data";
import type { Lists } from "@/lib/vessel";

export type Pattern = { text: string; label: string };
export type Config = { patterns: Pattern[]; priority: Set<string>; watch: Set<string> };

export const DEFAULT_CONFIG: Config = {
  patterns: [
    { text: "XWL", label: "Lummi Nation" },
    { text: "WSF", label: "Washington State Ferries" },
    { text: "SWN", label: "Swinomish" },
    { text: "NKK", label: "Nooksack" },
  ],
  priority: new Set(),
  watch: new Set(),
};

// Whole words, not substrings: the pattern CG must not approve CMA CGM.
export function matchedPattern(v: Vessel, patterns: Pattern[]): Pattern | null {
  const words = new Set(`${v.name} ${v.callsign}`.toLowerCase().split(/[\s/-]+/));
  return patterns.find((p) => p.text !== "" && words.has(p.text.toLowerCase())) ?? null;
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
    patterns: patterns.map(({ text, label }) => ({ text, label })),
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
