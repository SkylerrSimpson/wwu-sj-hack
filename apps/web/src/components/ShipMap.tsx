"use client";

import * as L from "leaflet";
import { useEffect, useRef } from "react";

export type Ship = {
  id: string;
  name: string;
  type: string;
  priority: boolean;
  lon: number;
  lat: number;
};

// The only module that knows Leaflet. Loaded with ssr: false, because Leaflet touches window on import.
export default function ShipMap({ ring, ships }: { ring: number[][]; ships: Ship[] }) {
  const div = useRef<HTMLDivElement>(null);
  const dots = useRef<L.LayerGroup | null>(null);

  useEffect(() => {
    if (!div.current) return;
    const map = L.map(div.current);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(map);
    const latLngs: [number, number][] = ring.map(([lon = 0, lat = 0]) => [lat, lon]);
    L.polygon(latLngs, { color: "#b91c1c", weight: 2, fill: false }).addTo(map);
    map.fitBounds(latLngs);
    dots.current = L.layerGroup().addTo(map);
    return () => {
      map.remove();
      dots.current = null;
    };
  }, [ring]);

  useEffect(() => {
    const group = dots.current;
    if (!group) return;
    group.clearLayers();
    for (const s of ships) {
      L.circleMarker([s.lat, s.lon], {
        radius: s.priority ? 6 : 4,
        color: s.priority ? "#1d4ed8" : "#171717",
        fillOpacity: 0.8,
      })
        .bindTooltip(`${s.name} (${s.type})${s.priority ? ", priority" : ""}`)
        .addTo(group);
    }
  }, [ships]);

  return (
    <div
      ref={div}
      role="img"
      aria-label={`Map of Lummi waters showing ${ships.length} vessels`}
      className="h-[70vh] w-full rounded border border-neutral-300"
    />
  );
}
