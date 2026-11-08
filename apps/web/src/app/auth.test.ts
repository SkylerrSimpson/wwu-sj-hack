import { beforeEach, expect, test, vi } from "vitest";
import { enterAsGuest, signIn } from "./auth";

// Typed by what auth.ts calls, not Next's full cookie store.
const cookieStore = vi.hoisted(() => ({
  set: vi.fn<(name: string, value: string, options: object) => void>(),
  delete: vi.fn<(name: string) => void>(),
}));
const redirect = vi.hoisted(() => vi.fn<(url: string) => void>());
vi.mock("next/headers", () => ({ cookies: async () => cookieStore }));
vi.mock("next/navigation", () => ({ redirect }));

const form = (username: string, password: string, token = "") => {
  const data = new FormData();
  data.set("username", username);
  data.set("password", password);
  data.set("cf-turnstile-response", token);
  return data;
};

// Cloudflare's siteverify endpoint is the network edge, so it is the one thing faked.
const siteverify = vi.fn<(url: string, init: RequestInit) => Promise<Response>>();
const turnstileOn = (success: boolean) => {
  process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY = "site";
  process.env.TURNSTILE_SECRET_KEY = "secret";
  siteverify.mockResolvedValue(Response.json({ success }));
};

beforeEach(() => {
  cookieStore.set.mockReset();
  redirect.mockReset();
  siteverify.mockReset();
  vi.stubGlobal("fetch", siteverify);
  process.env.LVT_DEMO_PASSWORD = "salish-sea";
  delete process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  delete process.env.TURNSTILE_SECRET_KEY;
});

test("a wrong password gets one error that names neither field, and no cookie", async () => {
  expect(await signIn(null, form("staff", "nope"))).toEqual({
    error: "Wrong username or password",
  });
  expect(cookieStore.set).not.toHaveBeenCalled();
  expect(redirect).not.toHaveBeenCalled();
});

test("the right password sets the httpOnly lvt cookie and redirects to the map", async () => {
  await signIn(null, form("staff", "salish-sea"));
  expect(cookieStore.set).toHaveBeenCalledWith(
    "lvt",
    expect.any(String),
    expect.objectContaining({ httpOnly: true, sameSite: "lax", path: "/", maxAge: 12 * 60 * 60 }),
  );
  expect(redirect).toHaveBeenCalledWith("/map");
});

test("without LVT_DEMO_PASSWORD the caller is told and nobody gets in", async () => {
  delete process.env.LVT_DEMO_PASSWORD;
  expect(await signIn(null, form("staff", ""))).toEqual({ error: "LVT_DEMO_PASSWORD is not set" });
  expect(cookieStore.set).not.toHaveBeenCalled();
});

test("entering as a guest needs no password, sets a guest cookie and redirects to the map", async () => {
  delete process.env.LVT_DEMO_PASSWORD;
  await enterAsGuest(null, form("", ""));
  expect(cookieStore.set).toHaveBeenCalledWith(
    "lvt",
    "guest",
    expect.objectContaining({ httpOnly: true, sameSite: "lax", path: "/", maxAge: 12 * 60 * 60 }),
  );
  expect(redirect).toHaveBeenCalledWith("/map");
});

test("with Turnstile on, a token Cloudflare rejects keeps both doors shut", async () => {
  turnstileOn(false);
  const error = { error: "The bot check failed. Try again." };
  expect(await signIn(null, form("staff", "salish-sea", "bad"))).toEqual(error);
  expect(await enterAsGuest(null, form("", "", "bad"))).toEqual(error);
  expect(cookieStore.set).not.toHaveBeenCalled();
});

test("with Turnstile on, a passing token is sent with the secret and lets the user in", async () => {
  turnstileOn(true);
  await signIn(null, form("staff", "salish-sea", "good"));
  const [url, init] = siteverify.mock.calls[0]!;
  expect(url).toBe("https://challenges.cloudflare.com/turnstile/v0/siteverify");
  expect(Object.fromEntries(init.body as URLSearchParams)).toEqual({
    secret: "secret",
    response: "good",
  });
  expect(redirect).toHaveBeenCalledWith("/map");
});

test("with Turnstile on, a missing token or an unreachable Cloudflare keeps the door shut", async () => {
  turnstileOn(true);
  expect(await enterAsGuest(null, form("", ""))).toEqual({
    error: "The bot check failed. Try again.",
  });
  expect(siteverify).not.toHaveBeenCalled();
  siteverify.mockRejectedValue(new Error("offline"));
  expect(await enterAsGuest(null, form("", "", "good"))).toEqual({
    error: "The bot check failed. Try again.",
  });
  expect(cookieStore.set).not.toHaveBeenCalled();
});

test("only one Turnstile key set is a configuration error, not an open door", async () => {
  process.env.TURNSTILE_SECRET_KEY = "secret";
  expect(await enterAsGuest(null, form("", ""))).toEqual({
    error: "Set both NEXT_PUBLIC_TURNSTILE_SITE_KEY and TURNSTILE_SECRET_KEY, or neither",
  });
  expect(cookieStore.set).not.toHaveBeenCalled();
});
