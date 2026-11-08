"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

// shortcut: the proxy checks only that this cookie exists, not what it holds; one shared password
// is the demo gate. Upgrade to the Nation's own sign-on when real accounts are needed.
const COOKIE = "lvt";

type Result = { error: string } | null;

// Turnstile is off with neither key set, so local dev needs no Cloudflare account; one key alone
// is refused rather than skipped, so a half-finished setup can't leave the door open.
async function botCheck(formData: FormData): Promise<Result> {
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!siteKey && !secret) return null;
  if (!siteKey || !secret)
    return {
      error: "Set both NEXT_PUBLIC_TURNSTILE_SITE_KEY and TURNSTILE_SECRET_KEY, or neither",
    };
  const failed = { error: "The bot check failed. Try again." };
  const token = formData.get("cf-turnstile-response");
  if (typeof token !== "string" || !token) return failed;
  try {
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      body: new URLSearchParams({ secret, response: token }),
    });
    const { success } = (await res.json()) as { success?: boolean };
    return success === true ? null : failed;
  } catch {
    return failed;
  }
}

// "guest" lets a visitor see the app without the password; sendAlert refuses it.
async function enter(value: string): Promise<never> {
  (await cookies()).set(COOKIE, value, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 12 * 60 * 60,
  });
  return redirect("/map");
}

export async function signIn(prev: Result, formData: FormData): Promise<Result> {
  const expected = process.env.LVT_DEMO_PASSWORD;
  if (!expected) return { error: "LVT_DEMO_PASSWORD is not set" };
  const blocked = await botCheck(formData);
  if (blocked) return blocked;
  const username = formData.get("username");
  if (typeof username !== "string" || !username.trim() || formData.get("password") !== expected)
    return { error: "Wrong username or password" };
  return enter(crypto.randomUUID());
}

export async function enterAsGuest(prev: Result, formData: FormData): Promise<Result> {
  return (await botCheck(formData)) ?? enter("guest");
}

export async function signOut(): Promise<void> {
  (await cookies()).delete(COOKIE);
  redirect("/");
}
