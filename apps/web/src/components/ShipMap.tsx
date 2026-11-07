"use client";

import * as L from "leaflet";
import { useEffect, useRef } from "react";
import { STATUS_WORD, type ShipStatus } from "@/lib/status";

export type Ship = {
  id: string;
  name: string;
  type: string;
  lengthM: number | null;
  callsign: string;
  status: ShipStatus;
  lon: number;
  lat: number;
};
export type Path = { id: string; status: ShipStatus; latLngs: [number, number][] };
// A sensor's field of view: a circle of range_m around it.
export type Coverage = {
  id: string;
  name: string;
  // Short, shown on the map at the sensor's site
  label: string;
  lon: number;
  lat: number;
  range_m: number;
};

const STATUS_COLOR: Record<ShipStatus, string> = {
  priority: "#15803d",
  watch: "#b91c1c",
  suspicious: "#d97706",
  unlisted: "#737373",
  unidentified: "#7e22ce",
};

// An unidentified radar contact is a larger hollow ring, so it never relies on colour alone.
const markerStyle = (status: ShipStatus, selected: boolean): L.CircleMarkerOptions =>
  status === "unidentified"
    ? {
        radius: selected ? 10 : 8,
        weight: 3,
        color: STATUS_COLOR[status],
        fillColor: "#fff",
        fillOpacity: 0.6,
      }
    : {
        radius: selected ? 8 : 5,
        weight: 1,
        color: STATUS_COLOR[status],
        fillColor: STATUS_COLOR[status],
        fillOpacity: 0.85,
      };

// The only module that knows Leaflet. Loaded with ssr: false, because Leaflet touches window on import.
export default function ShipMap({
  ring,
  ships,
  paths = [],
  coverage = [],
  selectedId = null,
  onSelect,
}: {
  ring: number[][];
  ships: Ship[];
  paths?: Path[];
  coverage?: Coverage[];
  selectedId?: string | null;
  onSelect?: (id: string) => void;
}) {
  const div = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const markers = useRef(new Map<string, L.CircleMarker>());
  const pathLayer = useRef<L.LayerGroup | null>(null);
  const sensorLayer = useRef<L.LayerGroup | null>(null);
  const select = useRef(onSelect);

  useEffect(() => {
    select.current = onSelect;
  }, [onSelect]);

  useEffect(() => {
    if (!div.current) return;
    const m = L.map(div.current, { preferCanvas: true });
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(m);
    // Paths sit on their own pane under the overlay pane (z 400), so dots always draw on top.
    m.createPane("paths").style.zIndex = "350";
    pathLayer.current = L.layerGroup().addTo(m);
    sensorLayer.current = L.layerGroup().addTo(m);
    const latLngs: [number, number][] = ring.map(([lon = 0, lat = 0]) => [lat, lon]);
    L.polygon(latLngs, { color: "#b91c1c", weight: 2, fill: false }).addTo(m);
    m.fitBounds(latLngs);
    map.current = m;
    const created = markers.current;
    return () => {
      m.remove();
      created.clear();
      pathLayer.current = null;
      sensorLayer.current = null;
      map.current = null;
    };
  }, [ring]);

  useEffect(() => {
    const layer = sensorLayer.current;
    if (!layer) return;
    layer.clearLayers();
    const style = { color: "#7e22ce", weight: 1, dashArray: "4 4", fillOpacity: 0.04 };
    for (const c of coverage) {
      L.circle([c.lat, c.lon], { ...style, radius: c.range_m })
        .bindTooltip(c.name)
        .addTo(layer);
      // A text tag, not a dot, so a sensor site is never mistaken for a boat.
      const tag = L.divIcon({
        className: "rounded bg-purple-800 px-1 text-[10px] leading-4 whitespace-nowrap text-white",
        html: c.label,
        iconSize: undefined,
      });
      L.marker([c.lat, c.lon], { icon: tag, keyboard: false }).bindTooltip(c.name).addTo(layer);
    }
  }, [coverage]);

  useEffect(() => {
    const layer = pathLayer.current;
    if (!layer) return;
    layer.clearLayers();
    for (const p of paths) {
      const selected = p.id === selectedId;
      L.polyline(p.latLngs, {
        pane: "paths",
        color: STATUS_COLOR[p.status],
        weight: selected ? 3 : 1,
        opacity: selected ? 0.9 : 0.5,
      }).addTo(layer);
    }
  }, [paths, selectedId]);

  // Markers are moved in place each tick; a vessel with no position is removed.
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    const seen = new Set<string>();
    for (const s of ships) {
      seen.add(s.id);
      let marker = markers.current.get(s.id);
      if (!marker) {
        marker = L.circleMarker([s.lat, s.lon], { radius: 5, weight: 1, fillOpacity: 0.85 }).addTo(
          m,
        );
        marker.on("click", () => select.current?.(s.id));
        marker.bindTooltip("");
        marker.bindPopup("");
        markers.current.set(s.id, marker);
      }
      marker.setLatLng([s.lat, s.lon]);
      const style = markerStyle(s.status, s.id === selectedId);
      marker.setStyle(style);
      marker.setRadius(style.radius ?? 5);
      if (s.status === "unidentified") marker.bringToFront();
      marker.setTooltipContent(`${s.name} (${s.type}), ${STATUS_WORD[s.status]}`);
      marker.setPopupContent(
        s.status === "unidentified"
          ? [
              `<strong>${s.name}</strong>`,
              `${s.type[0]?.toUpperCase()}${s.type.slice(1)} (synthetic sensor data)`,
              `Status: ${STATUS_WORD[s.status]}`,
              "No AIS id or call sign: radar can't say whose boat it is",
            ].join("<br>")
          : [
              `<strong>${s.name}</strong>`,
              `${s.type}${s.lengthM ? `, ${s.lengthM} m` : ""}`,
              `Status: ${STATUS_WORD[s.status]}`,
              `Call sign: ${s.callsign || "not broadcast"}`,
              `AIS id: ${s.id}`,
            ].join("<br>"),
      );
    }
    for (const [id, marker] of markers.current) {
      if (seen.has(id)) continue;
      marker.remove();
      markers.current.delete(id);
    }
  }, [ships, selectedId]);

  return (
    <div
      ref={div}
      role="img"
      aria-label={`Map of Lummi waters showing ${ships.length} vessels`}
      className="h-[60vh] w-full rounded border border-neutral-300"
    />
  );
}
