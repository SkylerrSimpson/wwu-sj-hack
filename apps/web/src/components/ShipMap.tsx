"use client";

import * as L from "leaflet";
import { useEffect, useRef } from "react";
import { callsignText } from "@/lib/privacy";
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
// A sensor site and the circle it covers
export type Coverage = { id: string; name: string; lon: number; lat: number; rangeM: number };

// Vessel names come from AIS and, in Live mode, from strangers; they never reach HTML unescaped.
const escape = (text: string) =>
  text.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c,
  );

const STATUS_COLOR: Record<ShipStatus, string> = {
  priority: "#15803d",
  watch: "#b91c1c",
  suspicious: "#d97706",
  unlisted: "#737373",
};

// The only module that knows Leaflet. Loaded with ssr: false, because Leaflet touches window on import.
export default function ShipMap({
  ring,
  ships,
  paths = [],
  coverage = [],
  selectedId = null,
  onSelect,
  className = "h-[60vh] w-full rounded border border-neutral-300",
}: {
  ring: number[][];
  ships: Ship[];
  paths?: Path[];
  coverage?: Coverage[];
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  className?: string;
}) {
  const div = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const markers = useRef(new Map<string, L.CircleMarker>());
  const pathLayer = useRef<L.LayerGroup | null>(null);
  const coverageLayer = useRef<L.LayerGroup | null>(null);
  const select = useRef(onSelect);

  useEffect(() => {
    select.current = onSelect;
  }, [onSelect]);

  useEffect(() => {
    if (!div.current) return;
    // Zoom sits bottom right, away from the top bar and the side column.
    const m = L.map(div.current, { preferCanvas: true, zoomControl: false });
    L.control.zoom({ position: "bottomright" }).addTo(m);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(m);
    // Paths sit on their own pane under the overlay pane (z 400), so dots always draw on top.
    m.createPane("paths").style.zIndex = "350";
    pathLayer.current = L.layerGroup().addTo(m);
    coverageLayer.current = L.layerGroup().addTo(m);
    const latLngs: [number, number][] = ring.map(([lon = 0, lat = 0]) => [lat, lon]);
    L.polygon(latLngs, { color: "#b91c1c", weight: 2, fill: false }).addTo(m);
    m.fitBounds(latLngs);
    map.current = m;
    const created = markers.current;
    return () => {
      m.remove();
      created.clear();
      pathLayer.current = null;
      coverageLayer.current = null;
      map.current = null;
    };
  }, [ring]);

  useEffect(() => {
    const layer = coverageLayer.current;
    if (!layer) return;
    layer.clearLayers();
    for (const c of coverage) {
      L.circle([c.lat, c.lon], {
        radius: c.rangeM,
        color: "#7e22ce",
        weight: 1,
        dashArray: "4 4",
        fillOpacity: 0.06,
        interactive: false,
      }).addTo(layer);
      // A text tag, not a dot, so a radar site is never mistaken for a boat.
      const tag = L.divIcon({
        className: "",
        html: `<span class="inline-block -translate-x-1/2 -translate-y-1/2 rounded bg-purple-800 px-1 text-[10px] leading-4 whitespace-nowrap text-white">Proposed radar: ${escape(c.name)}</span>`,
        iconSize: [0, 0],
      });
      L.marker([c.lat, c.lon], { icon: tag, keyboard: false, interactive: false }).addTo(layer);
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
      marker.setStyle({
        color: STATUS_COLOR[s.status],
        fillColor: STATUS_COLOR[s.status],
        radius: s.id === selectedId ? 8 : 5,
      });
      marker.setTooltipContent(`${escape(s.name)} (${escape(s.type)}), ${STATUS_WORD[s.status]}`);
      marker.setPopupContent(
        [
          `<strong>${escape(s.name)}</strong>`,
          `${escape(s.type)}${s.lengthM ? `, ${s.lengthM} m` : ""}`,
          `Status: ${STATUS_WORD[s.status]}`,
          `Call sign: ${escape(callsignText(s.type, s.callsign))}`,
          `AIS id: ${escape(s.id)}`,
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
      className={className}
    />
  );
}
