import type { Metadata } from "next";
import Replay from "@/components/Replay";

export const metadata: Metadata = { title: "Map, Lummi Vessel Tracker" };

export default function MapPage() {
  return <Replay />;
}
