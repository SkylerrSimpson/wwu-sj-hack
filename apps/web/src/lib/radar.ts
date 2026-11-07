// Proposed shore radar sites along the Lummi coast. Hypothetical: placed by eye on public
// shoreline, not surveyed, and not agreed with the Nation.
export type RadarSite = { id: string; name: string; lon: number; lat: number };

// An assumed range for spotting a small boat from a shore mast; large ships show up further out.
export const RADAR_RANGE_M = 6_000;

export const RADAR_SITES: RadarSite[] = [
  { id: "sandy-point", name: "Sandy Point", lon: -122.712, lat: 48.796 },
  { id: "gooseberry-point", name: "Gooseberry Point", lon: -122.669, lat: 48.736 },
  { id: "portage-island", name: "Portage Island", lon: -122.622, lat: 48.703 },
  { id: "lummi-shore", name: "Lummi Shore Road", lon: -122.607, lat: 48.757 },
];
