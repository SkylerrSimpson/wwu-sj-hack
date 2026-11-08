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

const form = (username: string, password: string) => {
  const data = new FormData();
  data.set("username", username);
  data.set("password", password);
  return data;
};

beforeEach(() => {
  cookieStore.set.mockReset();
  redirect.mockReset();
  process.env.LVT_DEMO_PASSWORD = "salish-sea";
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
  await enterAsGuest();
  expect(cookieStore.set).toHaveBeenCalledWith(
    "lvt",
    "guest",
    expect.objectContaining({ httpOnly: true, sameSite: "lax", path: "/", maxAge: 12 * 60 * 60 }),
  );
  expect(redirect).toHaveBeenCalledWith("/map");
});
