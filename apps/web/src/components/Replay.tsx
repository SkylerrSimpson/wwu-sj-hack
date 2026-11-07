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
import type { Path, Ship } from "@/components/ShipMap";
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

  const [t, setT] = useState(start);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(600);
  const [config, setConfig] = useState<Config>(DEFAULT_CONFIG);
  const [selected, setSelected] = useState<string | null>(null);
  const [showPaths, setShowPaths] = useState(false);
  const [entries, setEntries] = useState<Entry[]>([]);
  const prevT = useRef(start);
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

  const lists = useMemo(() => listsFor(data.vessels, config), [data.vessels, config]);

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
    const from = prevT.current;
    prevT.current = t;
    if (t <= from) return;
    const found = newEntries(data.vessels, data.boundary.ring, from, t, lists);
    if (found.length) setEntries((e) => [...e, ...found]);
  }, [t, data, lists]);

  const suspicious = new Set(
    entries.filter((e) => e.status === "suspicious").map((e) => e.vesselId),
  );
  const statusOf = (v: Vessel): ShipStatus => {
    const s = vesselStatus(v, lists);
    return s === "unlisted" && suspicious.has(v.id) ? "suspicious" : s;
  };
  const rows = summary(inLummiWaters(data.vessels, data.boundary.ring, t, lists), (v) =>
    labelOf(v, config),
  );
  const paths: Path[] = showPaths
    ? data.vessels.map((v) => ({
        id: v.id,
        status: statusOf(v),
        latLngs: v.track.map(([, lon = 0, lat = 0]) => [lat, lon]),
      }))
    : [];
  const picked = data.vessels.find((v) => v.id === selected);
  const pickedPos = picked ? positionAt(picked.track, t) : null;
  const ships: Ship[] = data.vessels.flatMap((v) => {
    const p = positionAt(v.track, t);
    return p
      ? [{ id: v.id, name: v.name, type: v.type, status: statusOf(v), lon: p[0], lat: p[1] }]
      : [];
  });

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <div className="lg:col-span-2">
        <div className="my-2 flex flex-wrap items-center gap-2 text-sm">
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
            {SPEEDS.map((s) => (
              <option key={s} value={s}>
                {s}x
              </option>
            ))}
          </select>
          {demoStart !== undefined && (
            <Button size="sm" variant="outline" onClick={() => setT(demoStart - 300)}>
              Skip to the demo vessel
            </Button>
          )}
          <span className="font-mono" aria-live="polite">
            {clock.format(t * 1000)}
          </span>
          <label className="ml-auto flex items-center gap-1">
            <input
              type="checkbox"
              checked={showPaths}
              onChange={(e) => setShowPaths(e.target.checked)}
            />
            Show paths
          </label>
        </div>
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
        <ShipMap
          ring={data.boundary.ring}
          ships={ships}
          paths={paths}
          selectedId={selected}
          onSelect={setSelected}
        />
        <p className="mt-1 text-xs text-neutral-600">
          Recorded AIS, {data.window.start.slice(0, 10)} to {data.window.end.slice(0, 10)} (UTC);{" "}
          {ships.length} vessels transmitting now. Blue: {STATUS_WORD.priority}. Red:{" "}
          {STATUS_WORD.watch}. Orange: {STATUS_WORD.suspicious}. Grey: {STATUS_WORD.unlisted}. Hover
          a dot for its name and status.
        </p>
      </div>
      <div className="space-y-4">
        {picked && (
          <Card>
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
        <section
          aria-labelledby="inwater-heading"
          className="rounded border border-neutral-300 p-3"
        >
          <h2 id="inwater-heading" className="font-semibold">
            In Lummi waters now ({rows.reduce((n, r) => n + r.count, 0)})
          </h2>
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
                <TableRow key={`${r.status}:${r.label}`}>
                  <TableCell>{STATUS_WORD[r.status]}</TableCell>
                  <TableCell>
                    {r.label}
                    <span className="block text-xs text-neutral-600">{r.names.join(", ")}</span>
                  </TableCell>
                  <TableCell className="text-right">{r.count}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </section>
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
