"use client";

import Script from "next/script";
import { useActionState, useEffect, useRef, useState } from "react";
import { enterAsGuest, signIn } from "@/app/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Turnstile = {
  render: (el: HTMLElement, options: { sitekey: string }) => string;
  reset: (id: string) => void;
  remove: (id: string) => void;
};
declare global {
  interface Window {
    turnstile?: Turnstile;
  }
}

const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
type Result = { error: string } | null;

export default function SignIn() {
  const [state, action, pending] = useActionState<Result, FormData>(signIn, null);
  const [guestState, guestAction, guestPending] = useActionState<Result, FormData>(
    enterAsGuest,
    null,
  );
  const widgetBox = useRef<HTMLDivElement>(null);
  const widget = useRef<string | null>(null);
  const [scriptReady, setScriptReady] = useState(false);

  // Rendered explicitly rather than by the script's page scan, which misses a sign-in screen
  // reached by client navigation after sign-out.
  useEffect(() => {
    const box = widgetBox.current;
    if (!siteKey || !box || !(scriptReady || window.turnstile)) return;
    widget.current = window.turnstile!.render(box, { sitekey: siteKey });
    return () => {
      if (widget.current) window.turnstile?.remove(widget.current);
      widget.current = null;
    };
  }, [scriptReady]);

  // A token is good for one check, so a refused attempt needs a fresh one.
  useEffect(() => {
    if (widget.current && (state || guestState)) window.turnstile?.reset(widget.current);
  }, [state, guestState]);

  return (
    <Card className="w-full max-w-sm animate-in fade-in zoom-in-95 duration-300 motion-reduce:animate-none">
      {siteKey && (
        <Script
          src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
          onReady={() => setScriptReady(true)}
        />
      )}
      <CardHeader>
        <CardTitle>Lummi Vessel Tracker</CardTitle>
      </CardHeader>
      <CardContent>
        <form action={action} className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="username">Username</Label>
            <Input id="username" name="username" autoComplete="username" required />
          </div>
          <div className="space-y-1">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
            />
          </div>
          {siteKey && <div ref={widgetBox} className="min-h-[65px]" />}
          <p
            role="alert"
            className="text-sm text-destructive animate-in fade-in duration-200 motion-reduce:animate-none"
          >
            {state?.error ?? guestState?.error}
          </p>
          <Button type="submit" className="w-full" disabled={pending || guestPending}>
            Sign in
          </Button>
          <Button
            type="submit"
            variant="outline"
            className="w-full"
            formAction={guestAction}
            formNoValidate
            disabled={pending || guestPending}
          >
            Enter as guest
          </Button>
        </form>
      </CardContent>
      <CardFooter>
        <p className="text-sm text-muted-foreground">
          Demo sign-in: any username and the team password. Guests can look around but can&apos;t
          send email alerts.
        </p>
      </CardFooter>
    </Card>
  );
}
