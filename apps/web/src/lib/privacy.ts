// The same types data/build.py and the streamer hide by: a private boat's name, call sign and
// MMSI identify its owner. "Unknown" stays private on the live feed until a type arrives.
const PRIVATE_TYPES = new Set(["Fishing", "Sailing", "Pleasure craft", "Unknown"]);

export function callsignText(type: string, callsign: string): string {
  if (callsign) return callsign;
  return PRIVATE_TYPES.has(type) ? "hidden (private boat)" : "not broadcast";
}
