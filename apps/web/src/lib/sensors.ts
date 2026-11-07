import type { Source, Vessel } from "@/lib/data";

// The shape of public/sensors.json, written by nonais/generate.py. Everything in it is synthetic.

export type Sensor = {
  id: string;
  kind: "radar" | "lidar";
  name: string;
  lon: number;
  lat: number;
  range_m: number;
};
export type Detection = {
  t: number;
  sensor: string;
  kind: Sensor["kind"];
  lon: number;
  lat: number;
  size_m: number;
  // The sensor's own judgement, not the truth
  boat: boolean;
  label: string;
  confidence: number;
};
export type SensorData = {
  sources: Source[];
  sensors: Sensor[];
  // Radar tracks, ids radar-n, in data.json's vessel shape; radar can't tell who a boat is
  vessels: Vessel[];
  detections: Detection[];
};
