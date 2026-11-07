"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CATEGORIES, tilesFor, type Box, type Category, type Heat } from "@/lib/stats";

export type PlotsProps = {
  // One line saying which vessels and which window the plots cover.
  summary: string;
  // The plots cover [from, cut); the time axis runs to `to`.
  from: number;
  to: number;
  cut: number;
  // Seconds per bar.
  step: number;
  series: { t: number; count: number }[];
  pie: Record<Category, number>;
  heat: Heat;
  box: Box;
  ring: number[][];
};

const W = 288;
// Okabe-Ito colours, told apart with colour blindness too; in CATEGORIES order, gray for Other.
const SLICE = ["#E69F00", "#56B4E9", "#0072B2", "#009E73", "#999999"];

const short = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Los_Angeles",
  month: "short",
  day: "numeric",
  hour: "numeric",
});

export default function Plots(p: PlotsProps) {
  return (
    <section aria-label="Plots" className="space-y-3 text-sm">
      <p className="text-xs text-muted-foreground">{p.summary}</p>
      <Card size="sm">
        <CardHeader>
          <CardTitle>Vessels in Lummi waters</CardTitle>
          <CardDescription>
            Vessels with a position inside the boundary in each interval
          </CardDescription>
        </CardHeader>
        <CardContent>
          <LineChart {...p} />
        </CardContent>
      </Card>
      <Card size="sm">
        <CardHeader>
          <CardTitle>Vessels by type</CardTitle>
          <CardDescription>Each vessel seen in the window, once</CardDescription>
        </CardHeader>
        <CardContent>
          <PieChart pie={p.pie} />
        </CardContent>
      </Card>
      <Card size="sm">
        <CardHeader>
          <CardTitle>Where they spend time</CardTitle>
          <CardDescription>
            Darker cells hold more 5-minute positions. Red outline: Lummi waters.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Heatmap heat={p.heat} box={p.box} ring={p.ring} />
        </CardContent>
      </Card>
    </section>
  );
}

function LineChart({ series, from, to, cut, step }: PlotsProps) {
  const H = 120;
  const [L, B, T] = [24, 16, 6];
  const shown = series.filter((s) => s.t < cut);
  const max = Math.max(1, ...shown.map((s) => s.count));
  const x = (t: number) => L + ((t - from) / (to - from || 1)) * (W - L - 2);
  const y = (c: number) => H - B - (c / max) * (H - B - T);
  if (!shown.length)
    return <p className="text-xs text-muted-foreground">No vessel in this window yet.</p>;
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="w-full text-foreground"
      role="img"
      aria-label={`Vessels per interval, from 0 to a peak of ${max}`}
    >
      <line x1={L} y1={H - B} x2={W} y2={H - B} className="stroke-border" />
      <text x={L - 4} y={T + 4} textAnchor="end" className="fill-muted-foreground text-[9px]">
        {max}
      </text>
      <text x={L - 4} y={H - B} textAnchor="end" className="fill-muted-foreground text-[9px]">
        0
      </text>
      <text x={L} y={H - 3} className="fill-muted-foreground text-[9px]">
        {short.format(from * 1000)}
      </text>
      <text x={W} y={H - 3} textAnchor="end" className="fill-muted-foreground text-[9px]">
        {short.format(to * 1000)}
      </text>
      <polyline
        fill="none"
        className="stroke-primary"
        strokeWidth={1.5}
        strokeLinejoin="round"
        points={shown.map((s) => `${x(s.t + step / 2)},${y(s.count)}`).join(" ")}
      />
      {/* Dots too: the first interval of a replay is a single point, which a line cannot draw. */}
      {shown.map((s) => (
        <circle key={s.t} cx={x(s.t + step / 2)} cy={y(s.count)} r={2} className="fill-primary">
          <title>{`${short.format(s.t * 1000)}: ${s.count} vessels`}</title>
        </circle>
      ))}
      {cut < to && (
        <line
          x1={x(cut)}
          y1={T}
          x2={x(cut)}
          y2={H - B}
          className="stroke-muted-foreground"
          strokeDasharray="2 2"
        />
      )}
    </svg>
  );
}

function PieChart({ pie }: { pie: Record<Category, number> }) {
  const total = CATEGORIES.reduce((n, [c]) => n + pie[c], 0);
  if (!total) return <p className="text-xs text-muted-foreground">No vessel in this window yet.</p>;
  const R = 52;
  let angle = -Math.PI / 2;
  const slices = CATEGORIES.map(([c, label], i) => {
    const share = pie[c] / total;
    const a0 = angle;
    angle += share * 2 * Math.PI;
    return { c, label, share, a0, a1: angle, fill: SLICE[i] };
  });
  const at = (a: number) => `${R + R * Math.cos(a)},${R + R * Math.sin(a)}`;
  return (
    <div className="flex items-center gap-3">
      <svg viewBox={`0 0 ${2 * R} ${2 * R}`} className="size-26 shrink-0" aria-hidden>
        {slices.map((s) =>
          s.share === 1 ? (
            <circle key={s.c} cx={R} cy={R} r={R} fill={s.fill} />
          ) : s.share > 0 ? (
            <path
              key={s.c}
              d={`M${R},${R} L${at(s.a0)} A${R},${R} 0 ${s.share > 0.5 ? 1 : 0} 1 ${at(s.a1)} Z`}
              fill={s.fill}
              className="stroke-background"
            />
          ) : null,
        )}
      </svg>
      <ul className="space-y-0.5 text-xs">
        {slices.map((s) => (
          <li key={s.c} className="flex items-center gap-1.5">
            <span className="size-2.5 shrink-0 rounded-sm border" style={{ background: s.fill }} />
            {s.label}
            <span className="text-muted-foreground">
              {pie[s.c]} ({Math.round(s.share * 100)}%)
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Heatmap({ heat, box, ring }: { heat: Heat; box: Box; ring: number[][] }) {
  if (!heat.max)
    return <p className="text-xs text-muted-foreground">No positions in this window yet.</p>;
  const H = (heat.rows / heat.cols) * W;
  const x = (lon: number) => ((lon - box.west) / (box.east - box.west)) * W;
  const y = (lat: number) => ((box.north - lat) / (box.north - box.south)) * H;
  const [cw, ch] = [W / heat.cols, H / heat.rows];
  // Parked boats pile thousands of positions into a few cells; a log scale keeps the rest visible.
  const shade = (n: number) => Math.log1p(n) / Math.log1p(heat.max);
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="w-full overflow-hidden rounded-sm border text-foreground"
      role="img"
      aria-label={`Grid of where the vessels were, busiest cell ${heat.max} positions`}
    >
      {/* shortcut: Mercator tiles stretched linearly, fine at this zoom; reproject if the box grows past a few degrees. */}
      <g className="opacity-40 grayscale dark:opacity-60 dark:invert">
        {tilesFor(box, 11).map((tile) => (
          <image
            key={`${tile.x}/${tile.y}`}
            href={`https://tile.openstreetmap.org/${tile.z}/${tile.x}/${tile.y}.png`}
            x={x(tile.west)}
            y={y(tile.north)}
            width={x(tile.east) - x(tile.west)}
            height={y(tile.south) - y(tile.north)}
            preserveAspectRatio="none"
          />
        ))}
      </g>
      {heat.counts.map((n, i) =>
        n ? (
          <rect
            key={i}
            x={(i % heat.cols) * cw}
            y={Math.floor(i / heat.cols) * ch}
            width={cw}
            height={ch}
            className="fill-blue-600 dark:fill-sky-300"
            opacity={0.25 + 0.75 * shade(n)}
          />
        ) : null,
      )}
      <polyline
        fill="none"
        className="stroke-destructive"
        strokeWidth={1.5}
        points={ring.map(([lon = 0, lat = 0]) => `${x(lon)},${y(lat)}`).join(" ")}
      />
      <text x={W - 2} y={H - 2} textAnchor="end" className="fill-muted-foreground text-[7px]">
        � OpenStreetMap
      </text>
    </svg>
  );
}
