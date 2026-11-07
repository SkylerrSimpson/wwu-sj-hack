import type { CreateEmailOptions } from "resend";
import { beforeEach, expect, test, vi } from "vitest";
import type { Entry } from "@/lib/vessel";
import { sendAlert } from "./actions";

// Typed by what sendAlert reads of the response, not Resend's full shape.
const send = vi.hoisted(() =>
  vi.fn<(mail: CreateEmailOptions) => Promise<{ error: { message: string } | null }>>(),
);
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

test("an unidentified radar contact says radar saw it, with no AIS, and that the sensors are synthetic", async () => {
  await sendAlert("officer@example.org", {
    ...entry,
    vesselId: "radar-7",
    name: "Radar contact 7 (synthetic)",
    status: "unidentified",
  });
  const mail = send.mock.calls[0]?.[0];
  expect(mail?.subject).toBe("Lummi waters: unidentified boat entered");
  expect(mail?.text).toBe(
    "A boat seen by radar, with no AIS signal, entered Lummi waters: Radar contact 7 (synthetic), Thu, Dec 5, 2024, 5:30 AM PST, 48.77 N 122.70 W. Synthetic sensor data: corroborate before acting.",
  );
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
