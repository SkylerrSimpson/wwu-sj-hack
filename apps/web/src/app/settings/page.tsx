import type { Metadata } from "next";
import SettingsView from "@/components/SettingsView";
import { data } from "@/lib/data";

export const metadata: Metadata = { title: "Settings, Lummi Vessel Tracker" };

export default function Settings() {
  return <SettingsView vessels={data.vessels.map((v) => ({ id: v.id, name: v.name }))} />;
}
