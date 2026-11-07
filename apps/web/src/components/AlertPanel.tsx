"use client";

import { startTransition, useEffect, useRef, useState } from "react";
import { sendAlert } from "@/app/actions";
import { Button } from "@/components/ui/button";
import type { Entry } from "@/lib/vessel";

type Attempt = { key: string; entry: Entry; result: string };

const pacific = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Los_Angeles",
  dateStyle: "medium",
  timeStyle: "short",
});

export default function AlertPanel({ entries }: { entries: Entry[] }) {
  const [email, setEmail] = useState("");
  const [log, setLog] = useState<Attempt[]>([]);
  const seen = useRef(new Set<string>());

  // Loaded after mount, not in the initial state, so the server and first client render agree.
  useEffect(() => {
    try {
      setEmail(localStorage.getItem("alertEmail") ?? "");
    } catch {
      // No storage (private mode): the address lasts for this page view.
    }
  }, []);

  const send = (key: string, entry: Entry) => {
    if (!email) {
      setLog((l) => [...l, { key, entry, result: "No email saved" }]);
      return;
    }
    startTransition(async () => {
      const r = await sendAlert(email, entry);
      setLog((l) => [...l, { key, entry, result: r.ok ? "sent" : r.error }]);
    });
  };

  useEffect(() => {
    for (const entry of entries) {
      const key = `${entry.vesselId}:${entry.t}`;
      if (seen.current.has(key)) continue;
      seen.current.add(key);
      send(key, entry);
    }
  }, [entries, email]);

  return (
    <section aria-labelledby="alerts-heading" className="my-2 text-sm">
      <h2 id="alerts-heading" className="font-semibold">
        Alerts
      </h2>
      <label htmlFor="alert-email" className="mt-1 block">
        Email for alerts
      </label>
      <div className="mt-1 flex gap-2">
        <input
          id="alert-email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            try {
              localStorage.setItem("alertEmail", e.target.value);
            } catch {
              // Same: without storage the address is kept in state only.
            }
          }}
          className="w-full rounded border border-neutral-300 px-2 py-1"
        />
        <Button
          variant="outline"
          onClick={() =>
            send(`test:${Date.now()}`, {
              vesselId: "demo",
              name: "Demo vessel (synthetic)",
              t: Math.floor(Date.now() / 1000),
              lon: -122.7,
              lat: 48.77,
              status: "suspicious",
            })
          }
        >
          Send test alert
        </Button>
      </div>
      <p className="mt-1 text-neutral-600">
        The demo sender only delivers to the Resend account owner&apos;s inbox.
      </p>
      <ol className="mt-2 list-decimal pl-5">
        {log.map((a) => (
          <li key={a.key}>
            {pacific.format(a.entry.t * 1000)}: {a.entry.name},{" "}
            {a.entry.status === "watch" ? "watch list" : "suspicious"}, {a.result}
          </li>
        ))}
      </ol>
    </section>
  );
}
