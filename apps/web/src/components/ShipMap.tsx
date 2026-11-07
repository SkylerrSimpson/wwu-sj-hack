"use client";

import * as L from "leaflet";
import { useEffect, useRef } from "react";
import { STATUS_WORD, type ShipStatus } from "@/lib/status";

export type Ship = {
  id: string;
  name: string;
  type: string;
  status: ShipStatus;
  lon: number;
  lat: number;
};

const STATUS_COLOR: Record<ShipStatus, string> = {
  priority: "#1d4ed8",
  watch: "#b91c1c",
  suspicious: "#d97706",
  unlisted: "#525252",
};

// The only module that knows Leaflet. Loaded with ssr: false, because Leaflet touches window on import.
export default function ShipMap({
  ring,
  ships,
  onSelect,
}: {
  ring: number[][];
  ships: Ship[];
  onSelect?: (id: string) => void;
}) {
  const div = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const markers = useRef(new Map<string, L.CircleMarker>());
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
    const latLngs: [number, number][] = ring.map(([lon = 0, lat = 0]) => [lat, lon]);
    L.polygon(latLngs, { color: "#b91c1c", weight: 2, fill: false }).addTo(m);
    m.fitBounds(latLngs);
    map.current = m;
    const created = markers.current;
    return () => {
      m.remove();
      created.clear();
      map.current = null;
    };
  }, [ring]);

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
        markers.current.set(s.id, marker);
      }
      marker.setLatLng([s.lat, s.lon]);
      marker.setStyle({ color: STATUS_COLOR[s.status], fillColor: STATUS_COLOR[s.status] });
      marker.setTooltipContent(`${s.name} (${s.type}), ${STATUS_WORD[s.status]}`);
    }
    for (const [id, marker] of markers.current) {
      if (seen.has(id)) continue;
      marker.remove();
      markers.current.delete(id);
    }
  }, [ships]);

  return (
    <div
      ref={div}
      role="img"
      aria-label={`Map of Lummi waters showing ${ships.length} vessels`}
      className="h-[60vh] w-full rounded border border-neutral-300"
    />
  );
}
