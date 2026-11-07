"use client";

import { useEffect, useState } from "react";
import { readEmail, writeEmail } from "@/lib/storage";

export function useAlertEmail(): [string, (e: string) => void] {
  const [email, setEmail] = useState("");
  // Loaded after mount, not in the initial state, so the server and first client render agree.
  useEffect(() => {
    setEmail(readEmail(localStorage));
  }, []);
  const set = (e: string) => {
    setEmail(e);
    writeEmail(localStorage, e);
  };
  return [email, set];
}
