import type { LiveRecord } from "@/lib/live";

// One recorded stretch from the streamer's GET /v1/coverage.
export type Segment = { source: string; from: string; to: string };
// One UTC day the archive covers; from and to are unix seconds.
export type Day = { label: string; from: number; to: number; source: string };

const DAY_S = 86400;
const dayLabel = new Intl.DateTimeFormat("en-US", {
  timeZone: "UTC",
  weekday: "short",
  month: "short",
  day: "numeric",
  year: "numeric",
});

export function dayChoices(coverage: Segment[]): Day[] {
  const days: Day[] = [];
  for (const s of coverage) {
    const first = Math.floor(Date.parse(s.from) / 1000 / DAY_S) * DAY_S;
    const last = Date.parse(s.to) / 1000;
    if (!Number.isFinite(first) || !Number.isFinite(last)) continue;
    for (let from = first; from < last; from += DAY_S)
      days.push({ label: dayLabel.format(from * 1000), from, to: from + DAY_S, source: s.source });
  }
  return days;
}

// GET /v1/reports for one window, the streamer's largest page; after is the previous page's next.
export function reportsUrl(base: string, from: number, to: number, box: string, after?: string) {
  const q = new URLSearchParams({
    from: new Date(from * 1000).toISOString(),
    to: new Date(to * 1000).toISOString(),
    limit: "50000",
    box,
  });
  if (after) q.set("after", after);
  return `${base}/v1/reports?${q}`;
}

// A whole day is tens of thousands of fixes; one per vessel per step is plenty to animate.
export function thin(records: LiveRecord[], stepSeconds = 300): LiveRecord[] {
  const seen = new Set<string>();
  return records.filter((r) => {
    const key = `${r.id}:${Math.floor(Date.parse(r.heard_at) / 1000 / stepSeconds)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
