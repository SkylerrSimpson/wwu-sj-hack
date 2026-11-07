"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import AlertPanel from "@/components/AlertPanel";
import FilterPanel from "@/components/FilterPanel";
import Plots from "@/components/Plots";
import SidePanel from "@/components/SidePanel";
import SignOutButton from "@/components/SignOutButton";
import TopBar from "@/components/TopBar";
import { useConfig } from "@/components/useConfig";
import { useFilter } from "@/components/useFilter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
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
import { directionAt } from "@/lib/heading";
import { merge, parseRecord, type LiveRecord } from "@/lib/live";
import { RADAR_RANGE_M, RADAR_SITES } from "@/lib/radar";
import { callsignText } from "@/lib/privacy";
import {
  byCategory,
  CATEGORIES,
  countsOverTime,
  extent,
  filterVessels,
  heatmap,
  stepFor,
} from "@/lib/stats";
import { PANEL_DEFAULT } from "@/lib/panel";
import { STATUS_WORD, type ShipStatus } from "@/lib/status";
import {
  appendEntries,
  inLummiWaters,
  liveWindow,
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
const HEAT_COLS = 48;
const BANNER = "Approved list invented for this demo; no vessel shown is suspected of anything.";
const CAVEAT =
  "Most small boats carry no AIS, so a boat can be in Lummi waters without an alert. Approximate boundary, not a legal boundary.";

type Mode = "replay" | "live";
type Feed = { status: string; last_message_age_s: number | null };
// When the browser last heard anything from the streamer, so the age on screen keeps counting.
type Heard = number | null;

// For a phone's top bar: no weekday or time zone, so the slider keeps its width.
const clockShort = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Los_Angeles",
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});
const clock = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Los_Angeles",
  weekday: "short",
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZoneName: "short",
});
// Retrieval dates are calendar dates, so they read in UTC.
const dayUtc = new Intl.DateTimeFormat("en-US", {
  timeZone: "UTC",
  month: "short",
  day: "numeric",
  year: "numeric",
});
// "2026-11-07" to "Nov 7, 2026"
const dayLong = (iso: string) => dayUtc.format(Date.parse(`${iso}T00:00:00Z`));
// The recording's first and last days in Pacific time, to agree with the clock.
const dayPacific = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Los_Angeles",
  month: "short",
  day: "numeric",
});
const yearPacific = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Los_Angeles",
  year: "numeric",
});

// The shape of the screen, pulsing, while the 4 MB of tracks download.
function LoadingScreen() {
  return (
    <div className="fixed inset-0 overflow-hidden" aria-busy="true">
      <span className="sr-only" aria-live="polite">
        Loading vessel positions
      </span>
      <div className="fixed inset-x-0 top-0 z-10 flex h-12 items-center gap-3 border-b bg-background px-3">
        <Skeleton className="h-6 w-12" />
        <Skeleton className="h-7 w-28" />
        <Skeleton className="h-7 w-16" />
        <Skeleton className="h-7 max-w-md flex-1" />
        <Skeleton className="ml-auto size-7 rounded-full" />
        <Skeleton className="size-7 rounded-full" />
      </div>
      <Skeleton className="fixed inset-x-0 top-12 h-7 rounded-none" />
      <Skeleton className="absolute inset-0 top-[76px] rounded-none" />
      <div className="absolute top-[76px] bottom-0 left-0 w-80 space-y-3 border-r bg-background p-3 max-md:hidden">
        <div className="flex gap-2">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-8 flex-1" />
          ))}
        </div>
        {["w-full", "w-5/6", "w-full", "w-2/3", "w-3/4", "w-1/2"].map((w, i) => (
          <Skeleton key={i} className={`h-4 ${w}`} />
        ))}
      </div>
    </div>
  );
}

// The tracks are 4 MB, so the page fetches the static file instead of embedding it in the HTML.
export default function Replay() {
  const [data, setData] = useState<Data | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    // The map chunk downloads beside the data instead of after it.
    void import("./ShipMap");
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
  if (!data) return <LoadingScreen />;
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
  // null: hidden on a phone, open from md up, until the user opens or hides it.
  const [collapsed, setCollapsed] = useState<boolean | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [panelWidth, setPanelWidth] = useState(PANEL_DEFAULT);
  const [filter, setFilter] = useFilter();
  const [entries, setEntries] = useState<Entry[]>([]);
  const [mode, setMode] = useState<Mode>("replay");
  const [live, setLive] = useState<Map<string, Vessel>>(new Map());
  // Each live vessel's latest heading; the replay works its direction out from the track.
  const [headings, setHeadings] = useState<Map<string, number | null>>(new Map());
  const [feed, setFeed] = useState<Feed | null>(null);
  const [heard, setHeard] = useState<Heard>(null);
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
      const records = (p?.vessels ?? []).flatMap((x) => parseRecord(x) ?? []);
      // A snapshot after a reconnect merges into what is held, so tracks survive the gap.
      setLive((held) => records.reduce(merge, held));
      setHeadings((held) => new Map([...held, ...records.map((r) => [r.id, r.heading] as const)]));
      if (p?.feed) setFeed(p.feed);
      setHeard(Date.now() / 1000);
    });
    // Events wait in a queue and land once a second in one render, not one render per event.
    const pending: LiveRecord[] = [];
    es.addEventListener("vessel", (e) => {
      const r = parseRecord(parse(e));
      if (r) pending.push(r);
      setHeard(Date.now() / 1000);
    });
    es.addEventListener("status", (e) => {
      const f = parse(e) as Feed | null;
      if (f) setFeed(f);
      setHeard(Date.now() / 1000);
    });
    es.onerror = () => setFeed({ status: "down", last_message_age_s: null });
    const tick = setInterval(() => {
      setNow(Date.now() / 1000);
      if (!pending.length) return;
      const batch = pending.splice(0);
      setLive((m) => batch.reduce(merge, m));
      setHeadings((h) => {
        const next = new Map(h);
        for (const r of batch) next.set(r.id, r.heading);
        return next;
      });
    }, 1000);
    return () => {
      es.close();
      clearInterval(tick);
    };
  }, [mode]);

  const liveVessels = useMemo(() => [...live.values()], [live]);
  const vessels = mode === "live" ? liveVessels : data.vessels;
  const at = mode === "live" ? now : t;
  const lists = useMemo(() => listsFor(vessels, config), [vessels, config]);
  // The filter picks what the map and charts show; entries and alerts still use every vessel.
  const shown = useMemo(() => filterVessels(vessels, filter), [vessels, filter]);

  // A chosen end shows the whole window at once; otherwise charts follow the clock, recomputed
  // once per interval, not per tick.
  const box = useMemo(() => extent(vessels), [vessels]);
  const heatRows = Math.max(
    1,
    Math.round(
      (HEAT_COLS * (box.north - box.south)) /
        ((box.east - box.west) * Math.cos((((box.north + box.south) / 2) * Math.PI) / 180)),
    ),
  );
  const firstFix =
    mode === "live" ? Math.min(at, ...liveVessels.map((v) => v.track[0]?.[0] ?? at)) : start;
  const lastFix = mode === "live" ? at : end;
  const plotFrom = filter.start ?? firstFix;
  const plotTo = Math.max(plotFrom, filter.end ?? lastFix);
  const step = stepFor(plotTo - plotFrom);
  const cut =
    filter.end !== null
      ? plotTo
      : Math.max(plotFrom, Math.min(plotTo, plotFrom + Math.ceil((at - plotFrom) / step) * step));
  // Computed only while the drawer is open: nothing else shows them, and they cost a frame.
  const plots = useMemo(
    () =>
      menuOpen
        ? {
            series: countsOverTime(shown, plotFrom, cut, step, data.boundary.ring),
            pie: byCategory(shown, plotFrom, cut),
            heat: heatmap(shown, plotFrom, cut, box, HEAT_COLS, heatRows),
          }
        : null,
    [menuOpen, shown, plotFrom, cut, step, box, heatRows, data.boundary.ring],
  );
  const types =
    filter.categories.size === CATEGORIES.length
      ? "All types"
      : CATEGORIES.filter(([c]) => filter.categories.has(c))
          .map(([, label]) => label)
          .join(", ") || "No types";
  const plotSummary = `${types}: ${shown.length} vessels. ${clock.format(plotFrom * 1000)} to ${clock.format(cut * 1000)}.`;

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
    // minutes from the newest fix; appendEntries drops the repeats.
    const found =
      mode === "live"
        ? newEntries(vessels, data.boundary.ring, ...liveWindow(vessels, 600), lists)
        : newEntries(vessels, data.boundary.ring, from, at, lists);
    if (!found.length) return;
    setEntries((e) => appendEntries(e, found));
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
  // The synthetic demo vessel's source stays in data.json but isn't listed on screen.
  const sources = data.sources.filter((s) => s.id !== "demo");
  const retrieved = [...new Set(sources.map((s) => s.retrieved))];
  // Rebuilt only when something that changes a path changes, not on every tick.
  const paths = useMemo<Path[]>(
    () =>
      showPaths
        ? shown.map((v) => ({
            id: v.id,
            status: shownStatus(v, lists, suspicious),
            latLngs: v.track.map(([, lon = 0, lat = 0]) => [lat, lon]),
          }))
        : [],
    [showPaths, shown, lists, suspicious],
  );
  const picked = vessels.find((v) => v.id === selected);
  const pickedPos = picked ? positionAt(picked.track, at) : null;
  const ships: Ship[] = shown.flatMap((v) => {
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
            heading: (mode === "live" ? headings.get(v.id) : null) ?? directionAt(v.track, at),
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
          heard === null ? "" : `, last message ${Math.max(0, Math.round(now - heard))} s ago`
        }`
      : undefined;

  const water = (
    <div className="space-y-3 text-sm">
      <p className="text-xs text-muted-foreground">
        {mode === "live"
          ? "Live AIS from AISStream. Only vessels transmitting AIS and heard by this feed appear; a vessel can be there without being heard."
          : `Recorded AIS, ${dayPacific.format(start * 1000)} to ${dayPacific.format(end * 1000)}, ${yearPacific.format(end * 1000)} (Pacific).`}{" "}
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
              <TableCell className="whitespace-normal break-words">
                {r.label}
                <span className="block text-xs text-muted-foreground">{r.names.join(", ")}</span>
              </TableCell>
              <TableCell className="text-right">{r.count}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );

  const footer = (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">{CAVEAT}</p>
      <p className="text-xs text-muted-foreground">
        {retrieved.length === 1 ? (
          <>
            Data, retrieved <time dateTime={retrieved[0]}>{dayLong(retrieved[0] ?? "")}</time>:{" "}
            {sources.map((s, i) => (
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
            {sources.map((s) => (
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
    <div className="fixed inset-0 overflow-hidden">
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
        clockShort={clockShort.format(at * 1000)}
        feedText={feedText}
        feedLive={mode === "live" && feed?.status === "live"}
        showPaths={showPaths}
        onShowPaths={setShowPaths}
        showRadar={radarOn}
        onShowRadar={setRadarOn}
        menuOpen={menuOpen}
        onMenu={() => setMenuOpen((o) => !o)}
        overlayShown={overlay}
        onToggleOverlay={() => setOverlay((o) => !o)}
        banner={BANNER}
      />
      <SidePanel
        className="absolute top-[var(--chrome-h,76px)] bottom-0 left-0 z-20"
        shown={overlay}
        panes={{ water, lists: listsPane, alerts: <AlertPanel entries={entries} />, vessel }}
        counts={{ water: inWater, alerts: entries.length }}
        collapsed={collapsed}
        onCollapse={setCollapsed}
        onWidth={setPanelWidth}
        footer={footer}
      />
      {/* Slides over the column, a little wider so the pie legend fits on one line; invisible when closed keeps it out of the tab order. */}
      <aside
        aria-label="Filters and charts"
        // At least 384 px so the pie legend stays on one line.
        style={{ width: Math.max(panelWidth, 384) }}
        className={`absolute top-[var(--chrome-h,76px)] bottom-0 left-0 z-30 max-w-full space-y-4 overflow-y-auto overscroll-contain border-r bg-background p-3 shadow-xl transition-all duration-300 ease-out motion-reduce:transition-none ${menuOpen ? "" : "invisible -translate-x-full"}${overlay ? "" : " hidden"}`}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Filters and charts</h2>
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label="Close"
            onClick={() => setMenuOpen(false)}
          >
            <X />
          </Button>
        </div>
        <FilterPanel filter={filter} onFilter={setFilter} start={firstFix} end={lastFix} />
        {plots && (
          <Plots
            summary={plotSummary}
            from={plotFrom}
            to={plotTo}
            cut={cut}
            step={step}
            box={box}
            ring={data.boundary.ring}
            {...plots}
          />
        )}
        <div className="flex items-center gap-3 border-t pt-3">
          <SignOutButton />
          <Link href="/settings" className="text-sm underline">
            All settings
          </Link>
        </div>
      </aside>
    </div>
  );
}
