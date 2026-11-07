"use client";

import { startTransition, useEffect, useRef, useState } from "react";
import { useAlertEmail } from "@/components/useAlertEmail";
import { sendAlert } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Entry } from "@/lib/vessel";

type Attempt = { key: string; entry: Entry; result: string };

const pacific = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Los_Angeles",
  dateStyle: "medium",
  timeStyle: "short",
});

export default function AlertPanel({ entries }: { entries: Entry[] }) {
  const [email, setEmail] = useAlertEmail();
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
    <Card className="text-sm">
      <CardHeader>
        <CardTitle>Alerts</CardTitle>
      </CardHeader>
      <CardContent>
        <Label htmlFor="alert-email">Email for alerts</Label>
        <div className="mt-1 flex gap-2">
          <Input
            id="alert-email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
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
        <ol className="mt-2 list-decimal pl-5">
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
      </CardContent>
    </Card>
  );
}
