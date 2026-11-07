"use server";

import { Resend } from "resend";
import type { Entry } from "@/lib/vessel";

// Component options rather than dateStyle/timeStyle: Intl refuses to mix those with timeZoneName.
const pacific = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Los_Angeles",
  weekday: "short",
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZoneName: "short",
});

export async function sendAlert(
  to: string,
  entry: Entry,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const address = to.trim();
  if (address.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address))
    return { ok: false, error: "Enter a valid email address" };
  const key = process.env.RESEND_API_KEY;
  if (!key) return { ok: false, error: "RESEND_API_KEY is not set" };
  const where = `${Math.abs(entry.lat).toFixed(2)} ${entry.lat < 0 ? "S" : "N"} ${Math.abs(entry.lon).toFixed(2)} ${entry.lon < 0 ? "W" : "E"}`;
  const what = `${entry.name}, ${pacific.format(entry.t * 1000)}, ${where}`;
  const mail = {
    suspicious: {
      subject: "Lummi waters: vessel entered",
      text: `A vessel not on the approved list entered Lummi waters: ${what}. Self-reported AIS: corroborate before acting.`,
    },
    watch: {
      subject: "Lummi waters: watch-list vessel entered",
      text: `A vessel on your watch list entered Lummi waters: ${what}. Self-reported AIS: corroborate before acting.`,
    },
    unidentified: {
      subject: "Lummi waters: unidentified boat entered",
      text: `A boat seen by radar, with no AIS signal, entered Lummi waters: ${what}. Synthetic sensor data: corroborate before acting.`,
    },
  }[entry.status];
  try {
    const { error } = await new Resend(key).emails.send({
      from: "Lummi Vessel Tracker <onboarding@resend.dev>",
      to: address,
      ...mail,
    });
    return error ? { ok: false, error: error.message } : { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
