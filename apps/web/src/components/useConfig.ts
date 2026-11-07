"use client";

import { useEffect, useState } from "react";
import { DEFAULT_CONFIG, type Config } from "@/lib/config";
import { readConfig, writeConfig } from "@/lib/storage";

export function useConfig(): [Config, (c: Config) => void] {
  const [config, setConfig] = useState(DEFAULT_CONFIG);
  // Loaded after mount, not in the initial state, so the server and first client render agree.
  useEffect(() => {
    setConfig(readConfig(localStorage));
  }, []);
  const set = (c: Config) => {
    setConfig(c);
    writeConfig(localStorage, c);
  };
  return [config, set];
}
