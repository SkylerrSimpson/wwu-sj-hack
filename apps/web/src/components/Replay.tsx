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
import {
  corroboration,
  echoCounts,
  interpolateAt,
  matchAis,
  radarEntries,
  wedge,
} from "@/lib/fusion";
import type { SensorData } from "@/lib/sensors";
import { STATUS_WORD, type ShipStatus } from "@/lib/status";
import {
  inLummiWaters,
  isInside,
  newEntries,
  positionAt,
  summary,
  vesselStatus,
  type Entry,
} from "@/lib/vessel";

const ShipMap = dynamic(() => import("./ShipMap"), { ssr: false });

const SPEEDS = [60, 600, 3600];
const SENSOR_LABEL = { radar: "Radar", camera: "Thermal camera", lidar: "LIDAR" };
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

  // Few vessels have a fix in the first minutes, so the map opens half an hour in.
  const [t, setT] = useState(start + 1800);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(600);
  const [config, setConfig] = useState<Config>(DEFAULT_CONFIG);
  const [selected, setSelected] = useState<string | null>(null);
  const [showPaths, setShowPaths] = useState(false);
  const [entries, setEntries] = useState<Entry[]>([]);
  const prevT = useRef(start + 1800);
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

  // The synthetic radar, camera and LIDAR load only when switched on, so the AIS replay never
  // depends on them.
  const [sensorsOn, setSensorsOn] = useState(false);
  const [sensors, setSensors] = useState<SensorData | null>(null);
  const [sensorsFailed, setSensorsFailed] = useState(false);
  useEffect(() => {
    if (!sensorsOn || sensors) return;
    fetch("/sensors.json")
      .then((r) =>
        r.ok ? (r.json() as Promise<SensorData>) : Promise.reject(new Error(r.statusText)),
      )
      .then(setSensors)
      .catch(() => setSensorsFailed(true));
  }, [sensorsOn, sensors]);

  // Matching runs once per load: a radar track is identified when an AIS vessel sits on it.
  const radar = useMemo(() => {
    if (!sensors) return null;
    const matched = new Map(sensors.vessels.map((v) => [v.id, matchAis(v, data.vessels)]));
    const unknown = sensors.vessels.filter((v) => matched.get(v.id) === null);
    const coverage: Coverage[] = sensors.sensors.map((s) => ({
      id: s.id,
      name: s.name,
      label: SENSOR_LABEL[s.kind],
      lon: s.lon,
      lat: s.lat,
      range_m: s.range_m,
      ring: s.fov_deg === undefined ? undefined : wedge(s),
    }));
    const firstEntry = radarEntries(unknown, data.boundary.ring, 0, Infinity)[0]?.t;
    return { sensors, matched, unknown, coverage, firstEntry };
  }, [sensors, data.vessels, data.boundary.ring]);
  const shown = sensorsOn ? radar : null;
  const unknown = useMemo(() => shown?.unknown ?? [], [shown]);

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
    const found = [
      ...newEntries(data.vessels, data.boundary.ring, from, t, lists),
      ...radarEntries(unknown, data.boundary.ring, from, t),
    ].sort((a, b) => a.t - b.t);
    if (!found.length) return;
    // Scrubbing back and playing again crosses the same fixes; the alert log must not repeat them.
    setEntries((e) => {
      const seen = new Set(e.map((x) => `${x.vesselId}:${x.t}`));
      return [...e, ...found.filter((x) => !seen.has(`${x.vesselId}:${x.t}`))];
    });
  }, [t, data, lists, unknown]);

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
  const contacts: Ship[] = unknown.flatMap((v) => {
    const p = positionAt(v.track, t);
    const type = `about ${v.length_m} m by radar, no AIS`;
    return p
      ? [
          {
            id: v.id,
            name: v.name,
            type,
            lengthM: v.length_m,
            callsign: "",
            status: "unidentified",
            lon: p[0],
            lat: p[1],
          },
        ]
      : [];
  });
  const contactsInside = contacts.filter((c) => isInside(c.lon, c.lat, data.boundary.ring));
  const radarNow = shown?.sensors.vessels.filter((v) => positionAt(v.track, t)) ?? [];
  const echoes = shown ? echoCounts(shown.sensors.detections, t) : null;
  const contact = unknown.find((v) => v.id === selected);
  const radarStart = shown?.firstEntry;

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
          <label className="flex items-center gap-1">
            <input
              type="checkbox"
              checked={sensorsOn}
              onChange={(e) => setSensorsOn(e.target.checked)}
            />
            Synthetic radar, camera and LIDAR
          </label>
          {radarStart !== undefined && (
            <Button size="sm" variant="outline" onClick={() => setT(radarStart - 600)}>
              Skip to the radar contact
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
          ships={[...ships, ...contacts]}
          paths={paths}
          coverage={shown?.coverage}
          selectedId={selected}
          onSelect={setSelected}
        />
        <p className="mt-1 text-xs text-neutral-600">
          Recorded AIS, {data.window.start.slice(0, 10)} to {data.window.end.slice(0, 10)} (UTC);{" "}
          {ships.length} vessels transmitting now. Green: {STATUS_WORD.priority}. Red:{" "}
          {STATUS_WORD.watch}. Orange: {STATUS_WORD.suspicious}. Grey: {STATUS_WORD.unlisted}. Hover
          a dot for its name and status.
        </p>
        {sensorsOn && !shown && (
          <p className="mt-1 text-xs" role={sensorsFailed ? "alert" : undefined} aria-live="polite">
            {sensorsFailed
              ? "The synthetic sensor data could not be loaded."
              : "Loading the synthetic sensor data..."}
          </p>
        )}
        {shown && echoes && (
          <p className="mt-1 text-xs text-purple-900">
            Synthetic sensors, invented for this demo and placed by eye; the AIS is recorded. Dashed
            purple: what each sensor covers. Large hollow ring: {STATUS_WORD.unidentified}, a boat
            radar sees that no AIS vessel matches. Radar now: {radarNow.length} boats,{" "}
            {radarNow.length - contacts.length} matched to AIS, {contacts.length} unidentified.
            Echoes so far: {echoes.echoes}, of which {echoes.dropped} judged birds, debris or sea
            clutter and dropped.{" "}
            {shown.sensors.sources.map((s) => (
              <a key={s.id} className="underline" href={s.url}>
                {s.name}, {s.retrieved}
              </a>
            ))}
          </p>
        )}
      </div>
      <div className="space-y-4">
        {contact && shown && (
          <RadarContact
            contact={contact}
            sensors={shown.sensors}
            t={t}
            onClose={() => setSelected(null)}
          />
        )}
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
            <CardTitle>
              In Lummi waters now ({rows.reduce((n, r) => n + r.count, 0) + contactsInside.length})
            </CardTitle>
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
                {contactsInside.length > 0 && (
                  <TableRow className="animate-in fade-in slide-in-from-bottom-1 duration-300 motion-reduce:animate-none">
                    <TableCell>
                      <Badge variant="destructive">{STATUS_WORD.unidentified}</Badge>
                    </TableCell>
                    <TableCell>
                      Boat with no AIS (synthetic)
                      <span className="block text-xs text-neutral-600">
                        {contactsInside.map((c) => c.name).join(", ")}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">{contactsInside.length}</TableCell>
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
          selected={contact ? null : selected}
          onSelect={setSelected}
          onChange={setConfig}
        />
        <AlertPanel entries={entries} />
      </div>
    </div>
  );
}

const percent = (x: number) => `${Math.round(x * 100)}%`;

// What the tool knows about a boat radar sees and AIS doesn't: its size, where it is, and what
// the camera and LIDAR made of that spot. Never who it is.
function RadarContact({
  contact,
  sensors,
  t,
  onClose,
}: {
  contact: Vessel;
  sensors: SensorData;
  t: number;
  onClose: () => void;
}) {
  const p = interpolateAt(contact.track, t);
  const sightings = p ? corroboration(sensors.detections, p[0], p[1], t) : [];
  const sensorName = (id: string) => sensors.sensors.find((s) => s.id === id)?.name ?? id;
  return (
    <Card
      key={contact.id}
      className="animate-in fade-in slide-in-from-bottom-1 text-sm duration-300 motion-reduce:animate-none"
    >
      <CardHeader className="flex items-start justify-between gap-2">
        <CardTitle>{contact.name}</CardTitle>
        <Button size="sm" variant="outline" onClick={onClose}>
          Close
        </Button>
      </CardHeader>
      <CardContent>
        <p>
          About {contact.length_m} m long by radar. No AIS signal matches this contact, so the tool
          can&apos;t say whose boat it is.
        </p>
        {!p ? (
          <p className="mt-1">Radar doesn&apos;t see it at this time.</p>
        ) : sightings.length === 0 ? (
          <p className="mt-1">No camera or LIDAR sees this spot right now.</p>
        ) : (
          <ul className="mt-1 list-disc pl-5">
            {sightings.map((s) => (
              <li key={s.sensor}>
                {sensorName(s.sensor)}: {s.boat ? "a boat" : "not a boat"} ({s.label}),{" "}
                {percent(s.confidence)} sure
              </li>
            ))}
          </ul>
        )}
        <p className="mt-1 text-xs text-neutral-600">
          Synthetic sensor data. Radar can&apos;t identify a boat or its operator: corroborate
          before acting.
        </p>
      </CardContent>
    </Card>
  );
}
