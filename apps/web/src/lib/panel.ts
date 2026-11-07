// The side panel's width in pixels, as the user drags it.
export const PANEL_DEFAULT = 320;
export const PANEL_MIN = 256;
export const PANEL_MAX = 640;
// The panel sits over the map, so some map always stays in view.
const MAP_LEFT = 120;

export function clampPanelWidth(width: number, viewport: number): number {
  if (Number.isNaN(width)) return PANEL_DEFAULT;
  return Math.round(Math.max(PANEL_MIN, Math.min(width, PANEL_MAX, viewport - MAP_LEFT)));
}
