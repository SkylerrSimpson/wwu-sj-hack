"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import AlertPanel from "@/components/AlertPanel";
import ListsPanel from "@/components/ListsPanel";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { Ship } from "@/components/ShipMap";
import { STATUS_WORD, type ShipStatus } from "@/lib/status";
import type { Data, Vessel } from "@/lib/data";
import {
  inLummiWaters,
  newEntries,
  positionAt,
  summary,
  vesselStatus,
  type Entry,
  type Lists,
} from "@/lib/vessel";

const ShipMap = dynamic(() => import("./ShipMap"), { ssr: false });

const SPEEDS = [60, 600, 3600];
const TICK_MS = 250;
const STORAGE_KEY = "officerLists";

const clock = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Los_Angeles",
  weekday: "short",
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZoneName: "short",
});

function loadLists(): Lists | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return null;
    const { priority, watch } = parsed as { priority?: unknown; watch?: unknown };
    const ids = (x: unknown) =>
      new Set(Array.isArray(x) ? x.filter((v) => typeof v === "string") : []);
    return { priority: ids(priority), watch: ids(watch) };
  } catch {
    return null;
  }
}

function saveLists(lists: Lists) {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ priority: [...lists.priority], watch: [...lists.watch] }),
    );
  } catch {
    // Storage can be unavailable; the lists then live for the session only.
  }
}

// Owns the clock, the officer's lists, the selection and the entries. Every tick asks lib/vessel
// where each vessel is and which non-priority vessels crossed in since the last tick.
export default function Replay({ data }: { data: Data }) {
  const start = Date.parse(data.window.start) / 1000;
  const end = Date.parse(data.window.end) / 1000;
  const demoStart = data.vessels.find((v) => v.id === "demo")?.track[0]?.[0];

  const [t, setT] = useState(start);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(600);
  const [lists, setLists] = useState<Lists>({ priority: new Set(), watch: new Set() });
  const [selected, setSelected] = useState<string | null>(null);
  const [entries, setEntries] = useState<Entry[]>([]);
  const prevT = useRef(start);
  const loaded = useRef(false);

  useEffect(() => {
    const saved = loadLists();
    if (saved) setLists(saved);
    loaded.current = true;
  }, []);
  useEffect(() => {
    if (loaded.current) saveLists(lists);
  }, [lists]);

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
  const rows = summary(inLummiWaters(data.vessels, data.boundary.ring, t, lists), (v) => v.type);
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
        <ShipMap ring={data.boundary.ring} ships={ships} onSelect={setSelected} />
        <p className="mt-1 text-xs text-neutral-600">
          Recorded AIS, {data.window.start.slice(0, 10)} to {data.window.end.slice(0, 10)} (UTC);{" "}
          {ships.length} vessels transmitting now. Blue: {STATUS_WORD.priority}. Red:{" "}
          {STATUS_WORD.watch}. Orange: {STATUS_WORD.suspicious}. Grey: {STATUS_WORD.unlisted}. Hover
          a dot for its name and status.
        </p>
      </div>
      <div className="space-y-4">
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
        <ListsPanel
          vessels={data.vessels.map((v) => ({ id: v.id, name: v.name }))}
          lists={lists}
          selected={selected}
          onSelect={setSelected}
          onChange={setLists}
        />
        <AlertPanel entries={entries} />
      </div>
    </div>
  );
}
