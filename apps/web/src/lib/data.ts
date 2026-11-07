import raw from "../../public/data.json";

export type Source = { id: string; name: string; url: string; retrieved: string };
export type Vessel = {
  id: string;
  source: string;
  name: string;
  type: string;
  length_m: number | null;
  callsign: string;
  // "Whatcom County ferry" or "Law enforcement, listed" for the explicit list; else null
  fleet: string | null;
  priority: boolean;
  // [unix seconds, lon, lat], one per 5 minutes, in time order
  track: number[][];
};
export type Data = {
  sources: Source[];
  window: { start: string; end: string };
  // ring is [lon, lat] points, first equals last
  boundary: { source: string; ring: number[][] };
  vessels: Vessel[];
};

export const data: Data = raw;
