"use client";

import { useEffect, useState } from "react";
import { DEFAULT_FILTER, type Filter } from "@/lib/stats";
import { readFilter, writeFilter } from "@/lib/storage";

// The map filter, shared by /settings (where it is edited) and /map (where it applies).
export function useFilter(): [Filter, (f: Filter) => void] {
  const [filter, setFilter] = useState(DEFAULT_FILTER);
  // Loaded after mount, not in the initial state, so the server and first client render agree.
  useEffect(() => {
    setFilter(readFilter(localStorage));
  }, []);
  const set = (f: Filter) => {
    setFilter(f);
    writeFilter(localStorage, f);
  };
  return [filter, set];
}
