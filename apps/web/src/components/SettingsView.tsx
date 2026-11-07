"use client";

import Link from "next/link";
import { useState } from "react";
import ConfigPanel from "@/components/ConfigPanel";
import SignOutButton from "@/components/SignOutButton";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAlertEmail } from "@/components/useAlertEmail";
import { useConfig } from "@/components/useConfig";

export default function SettingsView({ vessels }: { vessels: { id: string; name: string }[] }) {
  const [config, setConfig] = useConfig();
  const [email, setEmail] = useAlertEmail();
  const [selected, setSelected] = useState<string | null>(null);

  return (
    <>
      <p className="bg-amber-100 px-4 py-1 text-xs text-amber-900">
        Approved list invented for this demo; no vessel shown is suspected of anything.
      </p>
      <main className="mx-auto w-full max-w-3xl flex-1 space-y-4 p-4 animate-in fade-in slide-in-from-bottom-1 duration-300 motion-reduce:animate-none">
        <header className="flex items-start justify-between gap-4">
          <h1 className="text-2xl font-semibold">Settings</h1>
          <Button variant="outline" render={<Link href="/map" />}>
            Back to map
          </Button>
          <SignOutButton />
        </header>

        <Card size="sm">
          <CardHeader>
            <CardTitle>Alerts</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="alert-email">Email for alerts</Label>
              <Input
                id="alert-email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
          </CardContent>
        </Card>

        <ConfigPanel
          vessels={vessels}
          config={config}
          selected={selected}
          onSelect={setSelected}
          onChange={setConfig}
        />
      </main>
    </>
  );
}
