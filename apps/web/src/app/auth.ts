"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

// shortcut: the proxy checks only that this cookie exists, not what it holds; one shared password
// is the demo gate. Upgrade to the Nation's own sign-on when real accounts are needed.
const COOKIE = "lvt";

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

export async function signIn(
  prev: { error: string } | null,
  formData: FormData,
): Promise<{ error: string }> {
  const expected = process.env.LVT_DEMO_PASSWORD;
  if (!expected) return { error: "LVT_DEMO_PASSWORD is not set" };
  const username = formData.get("username");
  if (typeof username !== "string" || !username.trim() || formData.get("password") !== expected)
    return { error: "Wrong username or password" };
  return enter(crypto.randomUUID());
}

export async function enterAsGuest(): Promise<void> {
  await enter("guest");
}

export async function signOut(): Promise<void> {
  (await cookies()).delete(COOKIE);
  redirect("/");
}
