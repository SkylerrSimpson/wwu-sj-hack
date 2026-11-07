import type { CreateEmailOptions } from "resend";
import { beforeEach, expect, test, vi } from "vitest";
import type { Entry } from "@/lib/vessel";
import { sendAlert } from "./actions";

// Typed by what sendAlert reads of the response, not Resend's full shape.
const send = vi.hoisted(() =>
  vi.fn<(mail: CreateEmailOptions) => Promise<{ error: { message: string } | null }>>(),
);
const signedIn = vi.hoisted(() => ({ value: true }));
vi.mock("next/headers", () => ({
  cookies: async () => ({ has: (name: string) => name === "lvt" && signedIn.value }),
}));
vi.mock("resend", () => ({
  Resend: class {
    emails = { send };
  },
}));

// Thu Dec 5 2024, 5:30 AM PST, the demo vessel's first crossing.
const entry: Entry = {
  vesselId: "demo",
  name: "Demo vessel (synthetic)",
  t: 1733405400,
  lon: -122.7,
  lat: 48.77,
  status: "suspicious",
};

beforeEach(() => {
  send.mockReset();
  send.mockResolvedValue({ error: null });
  process.env.RESEND_API_KEY = "re_test";
  signedIn.value = true;
});

test("a bad address is refused on the server and nothing is sent", async () => {
  expect(await sendAlert("officer@", entry)).toEqual({
    ok: false,
    error: "Enter a valid email address",
  });
  expect(send).not.toHaveBeenCalled();
});

test("a good address gets one email naming the vessel, the time in Pacific, and the caveat", async () => {
  expect(await sendAlert(" officer@example.org ", entry)).toEqual({ ok: true });
  expect(send).toHaveBeenCalledTimes(1);
  expect(send).toHaveBeenCalledWith({
    from: "Lummi Vessel Tracker <onboarding@resend.dev>",
    to: "officer@example.org",
    subject: "Lummi waters: vessel entered",
    text: "A vessel not on the approved list entered Lummi waters: Demo vessel (synthetic), Thu, Dec 5, 2024, 5:30 AM PST, 48.77 N 122.70 W. Self-reported AIS: corroborate before acting.",
  });
});

test("a watch-list entry says so in the subject and the text", async () => {
  await sendAlert("officer@example.org", { ...entry, status: "watch" });
  const mail = send.mock.calls[0]?.[0];
  expect(mail?.subject).toBe("Lummi waters: watch-list vessel entered");
  expect(mail?.text).toMatch(/^A vessel on your watch list entered Lummi waters: Demo vessel/);
  expect(mail?.text).not.toMatch(/illegal/i);
});

test("without RESEND_API_KEY the caller is told and nothing is sent", async () => {
  delete process.env.RESEND_API_KEY;
  expect(await sendAlert("officer@example.org", entry)).toEqual({
    ok: false,
    error: "RESEND_API_KEY is not set",
  });
  expect(send).not.toHaveBeenCalled();
});

test("Resend's error comes back as the result, not a throw", async () => {
  send.mockResolvedValue({ error: { message: "Daily quota exceeded" } });
  expect(await sendAlert("officer@example.org", entry)).toEqual({
    ok: false,
    error: "Daily quota exceeded",
  });
});

test("a network failure comes back as the result too", async () => {
  send.mockRejectedValue(new Error("fetch failed"));
  expect(await sendAlert("officer@example.org", entry)).toEqual({
    ok: false,
    error: "fetch failed",
  });
});

test("a caller without the sign-in cookie is refused and nothing is sent", async () => {
  signedIn.value = false;
  expect(await sendAlert("staff@example.org", entry)).toEqual({
    ok: false,
    error: "Sign in to send alerts",
  });
  expect(send).not.toHaveBeenCalled();
});

test("an entry with an impossible position is refused and a long name is cut to 80 characters", async () => {
  expect(await sendAlert("staff@example.org", { ...entry, lat: 123 })).toEqual({
    ok: false,
    error: "The entry has no valid time or position",
  });
  await sendAlert("staff@example.org", { ...entry, name: "x".repeat(200) });
  const mail = send.mock.calls[0]?.[0];
  expect(String(mail?.text)).toContain("x".repeat(80) + ",");
  expect(String(mail?.text)).not.toContain("x".repeat(81));
});
