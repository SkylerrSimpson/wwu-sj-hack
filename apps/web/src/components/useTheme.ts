"use client";

import { useEffect, useSyncExternalStore } from "react";
import { readTheme, writeTheme } from "@/lib/storage";
import { resolveTheme, type Theme } from "@/lib/theme";

const root = () => document.documentElement;
const current = (): Theme => (root().classList.contains("dark") ? "dark" : "light");
const apply = (theme: Theme) => root().classList.toggle("dark", theme === "dark");
const subscribe = (onChange: () => void) => {
  const observer = new MutationObserver(onChange);
  observer.observe(root(), { attributeFilter: ["class"] });
  return () => observer.disconnect();
};

// The <html> class is the one source of truth: layout.tsx sets it before paint and every caller
// watches it, so the toggle in the top bar and the colours on the map always agree.
export function useTheme(): [Theme, () => void] {
  const theme = useSyncExternalStore(subscribe, current, (): Theme => "light");
  // With no saved choice, a system change mid-session is followed.
  useEffect(() => {
    const query = matchMedia("(prefers-color-scheme: dark)");
    const follow = () => apply(resolveTheme(readTheme(localStorage), query.matches));
    query.addEventListener("change", follow);
    return () => query.removeEventListener("change", follow);
  }, []);
  const toggle = () => {
    const next: Theme = current() === "dark" ? "light" : "dark";
    writeTheme(localStorage, next);
    apply(next);
  };
  return [theme, toggle];
}
