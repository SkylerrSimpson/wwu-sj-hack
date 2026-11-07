"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import AlertPanel from "@/components/AlertPanel";
import ConfigPanel from "@/components/ConfigPanel";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { Coverage, Path, Ship } from "@/components/ShipMap";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DEFAULT_CONFIG,
  labelOf,
  listsFor,
  parseConfig,
  serializeConfig,
  type Config,
} from "@/lib/config";
import type { Data, Vessel } from "@/lib/data";
import { merge, parseRecord, toVessel } from "@/lib/live";
import { RADAR_RANGE_M, RADAR_SITES } from "@/lib/radar";
import { STATUS_WORD, type ShipStatus } from "@/lib/status";
import {
  inLummiWaters,
  newEntries,
  positionAt,
  summary,
  vesselStatus,
  type Entry,
} from "@/lib/vessel";

const ShipMap = dynamic(() => import("./ShipMap"), { ssr: false });

const SPEEDS = [60, 600, 3600];
const TICK_MS = 250;
const STORAGE_KEY = "vesselConfig";
const COVERAGE: Coverage[] = RADAR_SITES.map((s) => ({ ...s, rangeM: RADAR_RANGE_M }));
const STREAMER = process.env.NEXT_PUBLIC_STREAMER_URL ?? "http://127.0.0.1:8787";

type Mode = "replay" | "live";
type Feed = { status: string; last_message_age_s: number | null };

const clock = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Los_Angeles",
  weekday: "short",
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZoneName: "short",
});

// The tracks are 4 MB, so the page fetches the static file instead of embedding it in the HTML.
export default function Replay() {
  const [data, setData] = useState<Data | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    fetch("/data.json")
      .then((r) => (r.ok ? (r.json() as Promise<Data>) : Promise.reject(new Error(r.statusText))))
      .then(setData)
      .catch(() => setFailed(true));
  }, []);
  if (failed) return <p role="alert">The vessel positions could not be loaded. Reload the page.</p>;
  if (!data) return <p aria-live="polite">Loading five days of vessel positions...</p>;
  return <ReplayView data={data} />;
}

// Owns the clock, the configuration, the selection and the entries. Every tick asks lib/vessel
// where each vessel is and which non-approved vessels crossed in since the last tick.
function ReplayView({ data }: { data: Data }) {
  const start = Date.parse(data.window.start) / 1000;
  const end = Date.parse(data.window.end) / 1000;
  const demoStart = data.vessels.find((v) => v.id === "demo")?.track[0]?.[0];

  // Few vessels have a fix in the first minutes, so the map opens half an hour in.
  const [t, setT] = useState(start + 1800);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(600);
  const [config, setConfig] = useState<Config>(DEFAULT_CONFIG);
  const [selected, setSelected] = useState<string | null>(null);
  const [showPaths, setShowPaths] = useState(false);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [mode, setMode] = useState<Mode>("replay");
  const [live, setLive] = useState<Map<string, Vessel>>(new Map());
  const [feed, setFeed] = useState<Feed | null>(null);
  const [now, setNow] = useState(() => Date.now() / 1000);
  // Each mode keeps its own "last tick", so switching modes never opens a giant entry window.
  const prev = useRef<Record<Mode, number>>({ replay: start + 1800, live: Date.now() / 1000 });
  const loaded = useRef(false);

  useEffect(() => {
    try {
      const saved = parseConfig(localStorage.getItem(STORAGE_KEY) ?? "");
      if (saved) setConfig(saved);
    } catch {
      // Storage can be unavailable; the configuration then lives for the session only.
    }
    loaded.current = true;
  }, []);
  useEffect(() => {
    if (!loaded.current) return;
    try {
      localStorage.setItem(STORAGE_KEY, serializeConfig(config));
    } catch {
      // Same as above.
    }
  }, [config]);

  useEffect(() => {
    if (mode !== "live") return;
    const es = new EventSource(`${STREAMER}/v1/stream`);
    const parse = (e: MessageEvent): unknown => {
      try {
        return JSON.parse(String(e.data));
      } catch {
        return null;
      }
    };
    es.addEventListener("snapshot", (e) => {
      const p = parse(e) as { feed?: Feed; vessels?: unknown[] } | null;
      const next = new Map<string, Vessel>();
      for (const x of p?.vessels ?? []) {
        const r = parseRecord(x);
        if (r) next.set(r.id, toVessel(r));
      }
      setLive(next);
      if (p?.feed) setFeed(p.feed);
    });
    es.addEventListener("vessel", (e) => {
      const r = parseRecord(parse(e));
      if (r) setLive((m) => merge(m, r));
    });
    es.addEventListener("status", (e) => {
      const f = parse(e) as Feed | null;
      if (f) setFeed(f);
    });
    es.onerror = () => setFeed({ status: "down", last_message_age_s: null });
    const tick = setInterval(() => setNow(Date.now() / 1000), 2000);
    return () => {
      es.close();
      clearInterval(tick);
    };
  }, [mode]);

  const liveVessels = useMemo(() => [...live.values()], [live]);
  const vessels = mode === "live" ? liveVessels : data.vessels;
  const at = mode === "live" ? now : t;
  const lists = useMemo(() => listsFor(vessels, config), [vessels, config]);
  const [radarOn, setRadarOn] = useState(false);

  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => setT((p) => Math.min(end, p + speed / (1000 / TICK_MS))), TICK_MS);
    return () => clearInterval(id);
  }, [playing, speed, end]);
  useEffect(() => {
    if (t >= end) setPlaying(false);
  }, [t, end]);

  // Entries come only from time moving forward; scrubbing back resets the window without firing.
  useEffect(() => {
    const from = prev.current[mode];
    prev.current[mode] = at;
    if (at <= from) return;
    const found = newEntries(vessels, data.boundary.ring, from, at, lists);
    if (!found.length) return;
    // Scrubbing back and playing again crosses the same fixes; the alert log must not repeat them.
    setEntries((e) => {
      const seen = new Set(e.map((x) => `${x.vesselId}:${x.t}`));
      return [...e, ...found.filter((x) => !seen.has(`${x.vesselId}:${x.t}`))];
    });
  }, [at, mode, vessels, data.boundary.ring, lists]);

  const suspicious = new Set(
    entries.filter((e) => e.status === "suspicious").map((e) => e.vesselId),
  );
  const statusOf = (v: Vessel): ShipStatus => {
    const s = vesselStatus(v, lists);
    return s === "unlisted" && suspicious.has(v.id) ? "suspicious" : s;
  };
  const rows = summary(inLummiWaters(vessels, data.boundary.ring, at, lists), (v) =>
    labelOf(v, config),
  );
  const paths: Path[] = showPaths
    ? vessels.map((v) => ({
        id: v.id,
        status: statusOf(v),
        latLngs: v.track.map(([, lon = 0, lat = 0]) => [lat, lon]),
      }))
    : [];
  const picked = vessels.find((v) => v.id === selected);
  const pickedPos = picked ? positionAt(picked.track, at) : null;
  const ships: Ship[] = vessels.flatMap((v) => {
    const p = positionAt(v.track, at);
    return p
      ? [
          {
            id: v.id,
            name: v.name,
            type: v.type,
            lengthM: v.length_m,
            callsign: v.callsign,
            status: statusOf(v),
            lon: p[0],
            lat: p[1],
          },
        ]
      : [];
  });

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <div className="lg:col-span-2">
        <div className="my-2 flex flex-wrap items-center gap-2 text-sm">
          <Button
            size="sm"
            variant={mode === "replay" ? "default" : "outline"}
            onClick={() => setMode("replay")}
          >
            Recorded days
          </Button>
          <Button
            size="sm"
            variant={mode === "live" ? "default" : "outline"}
            onClick={() => setMode("live")}
          >
            Live
          </Button>
          {mode === "replay" && (
            <>
              <Button size="sm" onClick={() => setPlaying((p) => !p)}>
                {playing ? "Pause" : "Play"}
              </Button>
              <label htmlFor="speed">Speed</label>
              <select
                id="speed"
                className="rounded border border-neutral-300 p-1"
                value={speed}
                onChange={(e) => setSpeed(Number(e.target.value))}
              >
                {SPEEDS.map((sp) => (
                  <option key={sp} value={sp}>
                    {sp}x
                  </option>
                ))}
              </select>
              {demoStart !== undefined && (
                <Button size="sm" variant="outline" onClick={() => setT(demoStart - 300)}>
                  Skip to the demo vessel
                </Button>
              )}
            </>
          )}
          <span className="font-mono" aria-live="polite">
            {clock.format(at * 1000)}
          </span>
          <label className="ml-auto flex items-center gap-1">
            <input
              type="checkbox"
              checked={showPaths}
              onChange={(e) => setShowPaths(e.target.checked)}
            />
            Show paths
          </label>
          <label className="flex items-center gap-1">
            <input
              type="checkbox"
              checked={radarOn}
              onChange={(e) => setRadarOn(e.target.checked)}
            />
            Show radar coverage
          </label>
        </div>
        {mode === "replay" && (
          <>
            <label htmlFor="time" className="sr-only">
              Replay time
            </label>
            <input
              id="time"
              type="range"
              className="mb-2 w-full"
              min={start}
              max={end}
              step={300}
              value={t}
              onChange={(e) => setT(Number(e.target.value))}
            />
          </>
        )}
        <ShipMap
          ring={data.boundary.ring}
          ships={ships}
          paths={paths}
          coverage={radarOn ? COVERAGE : undefined}
          selectedId={selected}
          onSelect={setSelected}
        />
        <p className="mt-1 text-xs text-neutral-600">
          {mode === "live"
            ? `Live AIS through the streamer: feed ${feed?.status ?? "connecting"}${
                feed?.last_message_age_s == null
                  ? ""
                  : `, last message ${Math.round(feed.last_message_age_s)} s ago`
              }. Only vessels transmitting AIS and heard by this feed appear; no vessel heard does not mean no vessel present.`
            : `Recorded AIS, ${data.window.start.slice(0, 10)} to ${data.window.end.slice(0, 10)} (UTC).`}{" "}
          {ships.length} vessels transmitting now. Green: {STATUS_WORD.priority}. Red:{" "}
          {STATUS_WORD.watch}. Orange: {STATUS_WORD.suspicious}. Grey: {STATUS_WORD.unlisted}. Hover
          a dot for its name and status.
        </p>
        {radarOn && (
          <p className="mt-1 text-xs text-purple-900">
            Dashed purple: where {RADAR_SITES.length} shore radars along the Lummi coast would see,
            assuming a {RADAR_RANGE_M / 1000} km range for a small boat. The sites are hypothetical,
            placed by eye. Radar would show boats that don&apos;t broadcast AIS, but not who they
            are; low boats, rough seas and land in the way reduce what it sees.
          </p>
        )}
      </div>
      <div className="space-y-4">
        {picked && (
          <Card
            key={picked.id}
            className="animate-in fade-in slide-in-from-bottom-1 duration-300 motion-reduce:animate-none"
          >
            <CardHeader>
              <CardTitle>{picked.name}</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
                <dt className="text-neutral-600">Status</dt>
                <dd>{STATUS_WORD[statusOf(picked)]}</dd>
                <dt className="text-neutral-600">Type</dt>
                <dd>
                  {picked.type}
                  {picked.length_m ? `, ${picked.length_m} m` : ""}
                </dd>
                <dt className="text-neutral-600">Call sign</dt>
                <dd>{picked.callsign || "not broadcast"}</dd>
                <dt className="text-neutral-600">Fleet</dt>
                <dd>{labelOf(picked, config)}</dd>
                <dt className="text-neutral-600">AIS id</dt>
                <dd>{picked.id}</dd>
                <dt className="text-neutral-600">Seen</dt>
                <dd>
                  {clock.format((picked.track[0]?.[0] ?? 0) * 1000)} to{" "}
                  {clock.format((picked.track.at(-1)?.[0] ?? 0) * 1000)}, {picked.track.length}{" "}
                  positions
                </dd>
                <dt className="text-neutral-600">Now</dt>
                <dd>
                  {pickedPos
                    ? `${pickedPos[1].toFixed(4)} N ${(-pickedPos[0]).toFixed(4)} W`
                    : "not transmitting"}
                </dd>
              </dl>
            </CardContent>
          </Card>
        )}
        <Card>
          <CardHeader>
            <CardTitle>In Lummi waters now ({rows.reduce((n, r) => n + r.count, 0)})</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Status</TableHead>
                  <TableHead>Kind</TableHead>
                  <TableHead className="text-right">Count</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow
                    key={`${r.status}:${r.label}`}
                    className="animate-in fade-in slide-in-from-bottom-1 duration-300 motion-reduce:animate-none"
                  >
                    <TableCell>
                      <Badge
                        variant={
                          r.status === "watch"
                            ? "destructive"
                            : r.status === "priority"
                              ? "secondary"
                              : "outline"
                        }
                      >
                        {STATUS_WORD[r.status]}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {r.label}
                      <span className="block text-xs text-neutral-600">{r.names.join(", ")}</span>
                    </TableCell>
                    <TableCell className="text-right">{r.count}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
        <ConfigPanel
          vessels={data.vessels.map((v) => ({ id: v.id, name: v.name }))}
          config={config}
          selected={selected}
          onSelect={setSelected}
          onChange={setConfig}
        />
        <AlertPanel entries={entries} />
      </div>
    </div>
  );
}
