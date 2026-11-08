"use client";

import { useActionState } from "react";
import { enterAsGuest, signIn } from "@/app/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function SignIn() {
  const [state, action, pending] = useActionState<{ error: string } | null, FormData>(signIn, null);

  return (
    <Card className="w-full max-w-sm animate-in fade-in zoom-in-95 duration-300 motion-reduce:animate-none">
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
          <p
            role="alert"
            className="text-sm text-destructive animate-in fade-in duration-200 motion-reduce:animate-none"
          >
            {state?.error}
          </p>
          <Button type="submit" className="w-full" disabled={pending}>
            Sign in
          </Button>
        </form>
      </CardContent>
      <CardFooter className="flex-col items-stretch gap-3">
        <form action={enterAsGuest}>
          <Button type="submit" variant="outline" className="w-full">
            Enter as guest
          </Button>
        </form>
        <p className="text-sm text-muted-foreground">
          Demo sign-in: any username and the team password. Guests can look around but can&apos;t
          send email alerts.
        </p>
      </CardFooter>
    </Card>
  );
}
