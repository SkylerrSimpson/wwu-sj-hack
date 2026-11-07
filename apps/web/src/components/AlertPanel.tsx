"use client";

import Link from "next/link";
import { startTransition, useEffect, useRef, useState } from "react";
import { useAlertEmail } from "@/components/useAlertEmail";
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
  // Set in Settings; this tab only reads it.
  const [email] = useAlertEmail();
  const [log, setLog] = useState<Attempt[]>([]);
  const seen = useRef(new Set<string>());

  const send = (key: string, entry: Entry) => {
    if (!email) {
      setLog((l) => [...l, { key, entry, result: "not sent, no email saved" }]);
      return;
    }
    startTransition(async () => {
      try {
        const r = await sendAlert(email, entry);
        setLog((l) => [...l, { key, entry, result: r.ok ? "sent" : r.error }]);
      } catch (e) {
        const why = e instanceof Error ? e.message : String(e);
        setLog((l) => [...l, { key, entry, result: `Could not reach the server: ${why}` }]);
      }
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
    <div className="space-y-3 text-sm">
      <p className="text-muted-foreground">
        {email ? `Alerts go to ${email}.` : "No alert email set."}{" "}
        <Link href="/settings" className="underline">
          {email ? "Change" : "Set one"} in Settings
        </Link>
      </p>
      <Button
        size="sm"
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
      {log.length === 0 ? (
        <p className="text-muted-foreground">No alerts yet.</p>
      ) : (
        <ol className="list-decimal pl-5">
          {log.map((a) => (
            <li
              key={a.key}
              className="animate-in fade-in slide-in-from-bottom-1 duration-300 motion-reduce:animate-none"
            >
              {pacific.format(a.entry.t * 1000)}: {a.entry.name},{" "}
              {a.entry.status === "watch" ? "watch list" : "suspicious"}: {a.result}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
