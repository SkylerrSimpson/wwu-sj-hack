"use client";

import dynamic from "next/dynamic";
import type { Data } from "@/lib/data";

const ShipMap = dynamic(() => import("./ShipMap"), { ssr: false });

// Holds everything that happens in the browser: today each vessel at its last recorded position;
// next the clock, which asks lib/vessel for positions and entries and hands entries to the alerts.
export default function Replay({ data }: { data: Data }) {
  const ships = data.vessels.flatMap((v) => {
    const [, lon, lat] = v.track.at(-1) ?? [];
    if (lon === undefined || lat === undefined) return [];
    return [{ id: v.id, name: v.name, type: v.type, priority: v.priority, lon, lat }];
  });
  return (
    <>
      <p className="my-2 text-sm text-neutral-600">
        Recorded AIS, {data.window.start.slice(0, 10)} to {data.window.end.slice(0, 10)} (UTC).{" "}
        {ships.length} vessels at their last recorded position. Blue dots are on the priority list.
      </p>
      <ShipMap ring={data.boundary.ring} ships={ships} />
    </>
  );
}
