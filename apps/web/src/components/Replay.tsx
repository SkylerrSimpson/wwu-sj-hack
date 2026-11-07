"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import AlertPanel from "@/components/AlertPanel";
import SidePanel from "@/components/SidePanel";
import TopBar from "@/components/TopBar";
import { useConfig } from "@/components/useConfig";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { Coverage, Path, Ship } from "@/components/ShipMap";
import { labelOf, listsFor, moveTo } from "@/lib/config";
import type { Data, Vessel } from "@/lib/data";
import { merge, parseRecord } from "@/lib/live";
import { RADAR_RANGE_M, RADAR_SITES } from "@/lib/radar";
import { callsignText } from "@/lib/privacy";
import { STATUS_WORD, type ShipStatus } from "@/lib/status";
import {
  inLummiWaters,
  newEntries,
  positionAt,
  summary,
  shownStatus,
  type Entry,
} from "@/lib/vessel";

const ShipMap = dynamic(() => import("./ShipMap"), { ssr: false });

const SPEEDS = [60, 600, 3600];
const TICK_MS = 250;
const COVERAGE: Coverage[] = RADAR_SITES.map((s) => ({ ...s, rangeM: RADAR_RANGE_M }));
const STREAMER = process.env.NEXT_PUBLIC_STREAMER_URL ?? "http://127.0.0.1:8787";
const BANNER = "Approved list invented for this demo; no vessel shown is suspected of anything.";
const CAVEAT =
  "Most fishing and recreational boats under 65 ft don't carry AIS, so a boat without AIS can enter with no alert. Approximate boundary, not a legal boundary.";

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
// The recording's window is whole UTC days, so its dates read in UTC.
const dayUtc = new Intl.DateTimeFormat("en-US", {
  timeZone: "UTC",
  month: "short",
  day: "numeric",
  year: "numeric",
});
// "2026-11-07" to "Nov 7, 2026"
const dayLong = (iso: string) => dayUtc.format(Date.parse(`${iso}T00:00:00Z`));

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
  if (failed)
    return (
      <p role="alert" className="p-6 text-sm">
        The vessel positions could not be loaded. Reload the page.
      </p>
    );
  if (!data)
    return (
      <p aria-live="polite" className="p-6 text-sm text-muted-foreground">
        Loading five days of vessel positions...
      </p>
    );
  return <ReplayView data={data} />;
}

// Owns the clock, the mode, the configuration, the selection, the entries and the overlay.
// Every tick asks lib/vessel where each vessel is and which non-approved vessels crossed in.
function ReplayView({ data }: { data: Data }) {
  const start = Date.parse(data.window.start) / 1000;
  const end = Date.parse(data.window.end) / 1000;
  const demoStart = data.vessels.find((v) => v.id === "demo")?.track[0]?.[0];

  // Few vessels have a fix in the first minutes, so the map opens half an hour in.
  const [t, setT] = useState(start + 1800);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(600);
  const [config, setConfig] = useConfig();
  const [selected, setSelected] = useState<string | null>(null);
  const [showPaths, setShowPaths] = useState(false);
  const [radarOn, setRadarOn] = useState(false);
  const [overlay, setOverlay] = useState(true);
  const [collapsed, setCollapsed] = useState(false);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [mode, setMode] = useState<Mode>("replay");
  const [live, setLive] = useState<Map<string, Vessel>>(new Map());
  const [feed, setFeed] = useState<Feed | null>(null);
  const [now, setNow] = useState(() => Date.now() / 1000);
  // Each mode keeps its own "last tick", so switching modes never opens a giant entry window.
  const prev = useRef<Record<Mode, number>>({ replay: start + 1800, live: Date.now() / 1000 });

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
      // A snapshot after a reconnect merges into what is held, so tracks survive the gap.
      setLive((held) => {
        let next = held;
        for (const x of p?.vessels ?? []) {
          const r = parseRecord(x);
          if (r) next = merge(next, r);
        }
        return next;
      });
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
    // Live fixes arrive seconds after they were heard, so the live window reaches back ten
    // minutes and forward without limit; the seen set below drops repeats.
    const found =
      mode === "live"
        ? newEntries(vessels, data.boundary.ring, at - 600, Infinity, lists)
        : newEntries(vessels, data.boundary.ring, from, at, lists);
    if (!found.length) return;
    // Scrubbing back and playing again crosses the same fixes; the alert log must not repeat them.
    setEntries((e) => {
      const seen = new Set(e.map((x) => `${x.vesselId}:${x.t}`));
      return [...e, ...found.filter((x) => !seen.has(`${x.vesselId}:${x.t}`))];
    });
  }, [at, mode, vessels, data.boundary.ring, lists]);

  const suspicious = useMemo(
    () => new Set(entries.filter((e) => e.status === "suspicious").map((e) => e.vesselId)),
    [entries],
  );
  const statusOf = (v: Vessel): ShipStatus => shownStatus(v, lists, suspicious);
  const rows = summary(inLummiWaters(vessels, data.boundary.ring, at, lists, suspicious), (v) =>
    labelOf(v, config),
  );
  const inWater = rows.reduce((n, r) => n + r.count, 0);
  const retrieved = [...new Set(data.sources.map((s) => s.retrieved))];
  // Rebuilt only when something that changes a path changes, not on every tick.
  const paths = useMemo<Path[]>(
    () =>
      showPaths
        ? vessels.map((v) => ({
            id: v.id,
            status: shownStatus(v, lists, suspicious),
            latLngs: v.track.map(([, lon = 0, lat = 0]) => [lat, lon]),
          }))
        : [],
    [showPaths, vessels, lists, suspicious],
  );
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

  const putOn = (list: "priority" | "watch" | null, id: string) =>
    setConfig(moveTo(config, list, id));
  const onPriorityList = picked ? config.priority.has(picked.id) : false;
  const onWatchList = picked ? config.watch.has(picked.id) : false;

  const feedText =
    mode === "live"
      ? `Feed ${feed?.status ?? "connecting"}${
          feed?.last_message_age_s == null ? "" : `, ${Math.round(feed.last_message_age_s)} s ago`
        }`
      : undefined;

  const water = (
    <div className="space-y-3 text-sm">
      <p className="text-xs text-muted-foreground">
        {mode === "live"
          ? "Live AIS from AISStream through the streamer. Only vessels transmitting AIS and heard by this feed appear; a vessel can be there without being heard."
          : `Recorded AIS, ${dayUtc.format(Date.parse(data.window.start))} to ${dayUtc.format(Date.parse(data.window.end))}.`}{" "}
        {ships.length} vessels on the map, {inWater} in Lummi waters.
      </p>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Status</TableHead>
            <TableHead>Type</TableHead>
            <TableHead className="text-right">Count</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 && (
            <TableRow>
              <TableCell colSpan={3} className="text-muted-foreground">
                No vessel is transmitting from inside Lummi waters right now.
              </TableCell>
            </TableRow>
          )}
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
                <span className="block text-xs text-muted-foreground">{r.names.join(", ")}</span>
              </TableCell>
              <TableCell className="text-right">{r.count}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <p className="text-xs text-muted-foreground">
        Green: {STATUS_WORD.priority}. Red: {STATUS_WORD.watch}. Orange: {STATUS_WORD.suspicious}.
        Grey: {STATUS_WORD.unlisted}. Hover a dot for its name and status.
      </p>
      {radarOn && (
        <p className="text-xs text-purple-900">
          Dashed purple: where {RADAR_SITES.length} shore radars along the Lummi coast would see,
          assuming a {RADAR_RANGE_M / 1000} km range for a small boat. The sites are hypothetical,
          placed by eye. Radar would show boats that don&apos;t broadcast AIS, but not who they are.
        </p>
      )}
    </div>
  );

  const footer = (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">{CAVEAT}</p>
      <p className="text-xs text-muted-foreground">
        {retrieved.length === 1 ? (
          <>
            Data, retrieved <time dateTime={retrieved[0]}>{dayLong(retrieved[0] ?? "")}</time>:{" "}
            {data.sources.map((s, i) => (
              <span key={s.id}>
                {i > 0 && " · "}
                <a className="underline" href={s.url}>
                  {s.name}
                </a>
              </span>
            ))}
          </>
        ) : (
          <>
            Data:{" "}
            {data.sources.map((s) => (
              <span key={s.id}>
                <a className="underline" href={s.url}>
                  {s.name}
                </a>
                , retrieved <time dateTime={s.retrieved}>{dayLong(s.retrieved)}</time>.{" "}
              </span>
            ))}
          </>
        )}
      </p>
    </div>
  );

  const listsPane = (
    <div className="space-y-3 text-sm">
      <dl className="grid grid-cols-[1fr_auto] gap-y-1">
        <dt className="text-muted-foreground">Approved patterns</dt>
        <dd className="text-right">{config.patterns.length}</dd>
        <dt className="text-muted-foreground">Approved vessels</dt>
        <dd className="text-right">{config.priority.size}</dd>
        <dt className="text-muted-foreground">Watch list</dt>
        <dd className="text-right">{config.watch.size}</dd>
      </dl>
      <Separator />
      {picked ? (
        <>
          <p>
            <span className="font-medium">{picked.name}</span>{" "}
            <Badge variant="outline">{STATUS_WORD[statusOf(picked)]}</Badge>
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant={onPriorityList ? "outline" : "default"}
              onClick={() => putOn(onPriorityList ? null : "priority", picked.id)}
            >
              {onPriorityList ? "Remove approval" : "Approve"}
            </Button>
            <Button
              size="sm"
              variant={onWatchList ? "outline" : "destructive"}
              onClick={() => putOn(onWatchList ? null : "watch", picked.id)}
            >
              {onWatchList ? "Remove from watch list" : "Add to watch list"}
            </Button>
          </div>
        </>
      ) : (
        <p className="text-muted-foreground">
          Click a dot on the map to approve or watch a vessel.
        </p>
      )}
      <Button size="sm" variant="outline" render={<Link href="/settings" />}>
        Edit patterns and lists in Settings
      </Button>
    </div>
  );

  const vessel = picked ? (
    <dl
      key={picked.id}
      className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm animate-in fade-in slide-in-from-bottom-1 duration-300 motion-reduce:animate-none"
    >
      <dt className="text-muted-foreground">Name</dt>
      <dd className="font-medium">{picked.name}</dd>
      <dt className="text-muted-foreground">Status</dt>
      <dd>{STATUS_WORD[statusOf(picked)]}</dd>
      <dt className="text-muted-foreground">Type</dt>
      <dd>
        {picked.type}
        {picked.length_m ? `, ${picked.length_m} m` : ""}
      </dd>
      <dt className="text-muted-foreground">Call sign</dt>
      <dd>{callsignText(picked.type, picked.callsign)}</dd>
      <dt className="text-muted-foreground">Fleet</dt>
      <dd>{labelOf(picked, config)}</dd>
      <dt className="text-muted-foreground">AIS id</dt>
      <dd>{picked.id}</dd>
      <dt className="text-muted-foreground">Seen</dt>
      <dd>
        {clock.format((picked.track[0]?.[0] ?? 0) * 1000)} to{" "}
        {clock.format((picked.track.at(-1)?.[0] ?? 0) * 1000)}, {picked.track.length} positions
      </dd>
      <dt className="text-muted-foreground">Now</dt>
      <dd>
        {pickedPos
          ? `${pickedPos[1].toFixed(4)} N ${(-pickedPos[0]).toFixed(4)} W`
          : "not transmitting"}
      </dd>
    </dl>
  ) : (
    <p className="text-sm text-muted-foreground">Click a dot on the map to see a vessel.</p>
  );

  return (
    <div className="relative h-dvh w-full overflow-hidden">
      <ShipMap
        className="absolute inset-0 isolate z-0"
        ring={data.boundary.ring}
        ships={ships}
        paths={paths}
        coverage={radarOn ? COVERAGE : undefined}
        selectedId={selected}
        onSelect={setSelected}
      />
      <TopBar
        mode={mode}
        onMode={(m) => {
          setMode(m);
          setPlaying(false);
        }}
        playing={playing}
        onPlay={() => {
          if (!playing && t >= end) setT(start + 1800);
          setPlaying((p) => !p);
        }}
        speed={speed}
        speeds={SPEEDS}
        onSpeed={setSpeed}
        t={t}
        start={start}
        end={end}
        onSeek={setT}
        onSkip={demoStart === undefined ? undefined : () => setT(demoStart - 300)}
        clockText={clock.format(at * 1000)}
        feedText={feedText}
        showPaths={showPaths}
        onShowPaths={setShowPaths}
        showRadar={radarOn}
        onShowRadar={setRadarOn}
        overlayShown={overlay}
        onToggleOverlay={() => setOverlay((o) => !o)}
        banner={BANNER}
      />
      <SidePanel
        className={`absolute top-[76px] bottom-0 left-0 z-20${overlay ? "" : " hidden"}`}
        panes={{ water, lists: listsPane, alerts: <AlertPanel entries={entries} />, vessel }}
        counts={{ water: inWater, alerts: entries.length }}
        collapsed={collapsed}
        onCollapse={setCollapsed}
        footer={footer}
      />
    </div>
  );
}
