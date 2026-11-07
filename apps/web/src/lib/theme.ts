export type Theme = "light" | "dark";

// A saved choice wins; nothing saved, or a stray value, follows the system.
export function resolveTheme(saved: string | null, systemDark: boolean): Theme {
  if (saved === "light" || saved === "dark") return saved;
  return systemDark ? "dark" : "light";
}
