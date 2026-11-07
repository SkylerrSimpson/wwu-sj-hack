// Which way a vessel is pointing, for the arrow on its dot. Degrees clockwise from north.

const M_PER_DEG_LAT = 111_320;
const MAX_GAP = 1800; // as positionAt: past 30 minutes without a fix, the position is unknown
const MIN_KNOTS = 1; // below this, GPS drift at a dock would spin the arrow

export function bearing(lon1: number, lat1: number, lon2: number, lat2: number): number {
  const east = (lon2 - lon1) * M_PER_DEG_LAT * Math.cos((lat1 * Math.PI) / 180);
  const north = (lat2 - lat1) * M_PER_DEG_LAT;
  return ((Math.atan2(east, north) * 180) / Math.PI + 360) % 360;
}

// The recorded tracks carry no heading, so the replay points along the last move: from the
// previous fix to the one positionAt shows. Null when stopped, stale or with nothing to compare.
export function directionAt(track: number[][], t: number): number | null {
  let i = track.length - 1;
  while (i >= 0 && (track[i]?.[0] ?? Infinity) > t) i--;
  const [tb, lonb, latb] = track[i] ?? [];
  const [ta, lona, lata] = track[i - 1] ?? [];
  if (tb === undefined || lonb === undefined || latb === undefined) return null;
  if (ta === undefined || lona === undefined || lata === undefined) return null;
  if (t - tb > MAX_GAP || tb - ta > MAX_GAP || tb <= ta) return null;
  const east = (lonb - lona) * M_PER_DEG_LAT * Math.cos((lata * Math.PI) / 180);
  const north = (latb - lata) * M_PER_DEG_LAT;
  const knots = (Math.hypot(east, north) / (tb - ta)) * 1.944;
  return knots < MIN_KNOTS ? null : bearing(lona, lata, lonb, latb);
}

// An arrow in screen pixels (y grows downward): a shaft from `from` to `to` pixels out from the
// dot's centre, and a head of `head` pixels at the tip. Returns [shaft, head] as point lists.
export function arrowShape(
  x: number,
  y: number,
  deg: number,
  from: number,
  to: number,
  head: number,
): [number[][], number[][]] {
  const r = (deg * Math.PI) / 180;
  const ux = Math.sin(r);
  const uy = -Math.cos(r);
  const tip = [x + ux * to, y + uy * to];
  const barb = (a: number) => {
    const c = Math.cos(a);
    const s = Math.sin(a);
    // The reversed direction, turned by a.
    return [(tip[0] ?? 0) + head * (-ux * c + uy * s), (tip[1] ?? 0) + head * (-ux * s - uy * c)];
  };
  return [
    [[x + ux * from, y + uy * from], tip],
    [barb(Math.PI / 6), tip, barb(-Math.PI / 6)],
  ];
}
