"use client";

import { useEffect, useRef } from "react";
import { Eye, EyeOff, Moon, Pause, Play, SlidersHorizontal, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useTheme } from "@/components/useTheme";
import type { Day } from "@/lib/history";

export type Mode = "replay" | "live" | "history";
const MODE_LABEL: Record<Mode, string> = {
  replay: "Recorded days",
  live: "Live",
  history: "History",
};

export type TopBarProps = {
  mode: Mode;
  onMode: (m: Mode) => void;
  // The archive's days, shown in History mode; null while they load.
  days?: Day[] | null;
  day?: Day | null;
  onDay?: (d: Day | null) => void;
  playing: boolean;
  onPlay: () => void;
  speed: number;
  speeds: number[];
  onSpeed: (s: number) => void;
  // Unix seconds; the slider steps 300, the dataset's fix interval.
  t: number;
  start: number;
  end: number;
  onSeek: (t: number) => void;
  onSkip?: () => void;
  clockText: string;
  // The same time, shorter, for a phone
  clockShort?: string;
  feedText?: string;
  feedLive?: boolean;
  showPaths: boolean;
  onShowPaths: (b: boolean) => void;
  showRadar: boolean;
  onShowRadar: (b: boolean) => void;
  menuOpen: boolean;
  onMenu: () => void;
  overlayShown: boolean;
  onToggleOverlay: () => void;
  banner: string;
};

// Leaflet's own controls sit at z-index 1000, so the chrome goes one above.
const Z = "z-10";

const selectClass =
  "h-7 rounded-lg border border-input bg-transparent px-2 text-[0.8rem] outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

function ThemeToggle() {
  const [theme, toggle] = useTheme();
  const label = theme === "dark" ? "Switch to light mode" : "Switch to dark mode";
  return (
    <Tooltip>
      <TooltipTrigger
        render={<Button size="icon-sm" variant="ghost" aria-label={label} onClick={toggle} />}
      >
        {theme === "dark" ? <Sun /> : <Moon />}
      </TooltipTrigger>
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  );
}

export default function TopBar(p: TopBarProps) {
  const header = useRef<HTMLElement>(null);
  // The bar wraps onto more lines on a narrow screen; the column and drawer start below it.
  useEffect(() => {
    const el = header.current;
    if (!el) return;
    const set = () =>
      document.documentElement.style.setProperty("--chrome-h", `${el.offsetHeight}px`);
    set();
    const ro = new ResizeObserver(set);
    ro.observe(el);
    return () => ro.disconnect();
  }, [p.overlayShown]);
  if (!p.overlayShown)
    return (
      <>
        <p
          className={`fixed inset-x-0 top-0 ${Z} bg-amber-100 px-3 py-1 text-xs text-amber-900 dark:bg-amber-950 dark:text-amber-100`}
        >
          {p.banner}
        </p>
        <Button
          size="sm"
          variant="outline"
          className={`fixed top-8 right-3 ${Z}`}
          onClick={p.onToggleOverlay}
        >
          <Eye /> Show controls
        </Button>
      </>
    );
  const live = p.mode === "live";
  return (
    <header
      ref={header}
      className={`fixed inset-x-0 top-0 ${Z} animate-in fade-in slide-in-from-top-2 duration-200 motion-reduce:animate-none`}
    >
      <div className="flex min-h-12 flex-wrap items-center gap-x-3 gap-y-2 border-b bg-background px-3 py-2">
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                size="icon-sm"
                variant={p.menuOpen ? "secondary" : "ghost"}
                aria-label="Filters and charts"
                aria-expanded={p.menuOpen}
                onClick={p.onMenu}
              />
            }
          >
            <SlidersHorizontal />
          </TooltipTrigger>
          <TooltipContent side="bottom">Filters and charts</TooltipContent>
        </Tooltip>
        <span className="text-sm whitespace-nowrap">
          <span className="font-bold">LVT</span>{" "}
          <span className="hidden text-muted-foreground md:inline">Lummi Vessel Tracker</span>
        </span>

        {/* Below xl, the playback controls drop to their own row under the logo and switches. */}
        <div className="order-last flex min-w-0 flex-1 basis-full flex-wrap items-center gap-2 xl:order-none xl:basis-0">
          <div role="group" aria-label="Mode" className="flex gap-1">
            {(Object.keys(MODE_LABEL) as Mode[]).map((m) => (
              <Button
                key={m}
                size="sm"
                variant={p.mode === m ? "default" : "outline"}
                aria-pressed={p.mode === m}
                onClick={() => p.onMode(m)}
              >
                {MODE_LABEL[m]}
              </Button>
            ))}
          </div>
          {live ? (
            <span className="flex flex-1 items-center gap-2 truncate text-sm text-muted-foreground">
              <span
                aria-hidden
                className={`size-2 shrink-0 rounded-full ${p.feedLive ? `bg-green-600 animate-pulse motion-reduce:animate-none` : "bg-muted-foreground"}`}
              />
              {p.feedText}
            </span>
          ) : (
            <>
              {p.mode === "history" && (
                <select
                  aria-label="Day"
                  className={selectClass}
                  value={p.day?.from ?? ""}
                  onChange={(e) =>
                    p.onDay?.(p.days?.find((d) => d.from === Number(e.target.value)) ?? null)
                  }
                >
                  <option value="">{p.days ? "Choose a day" : "Loading days"}</option>
                  {p.days?.map((d) => (
                    <option key={d.from} value={d.from}>
                      {d.label}
                    </option>
                  ))}
                </select>
              )}
              <Button size="sm" variant="outline" onClick={p.onPlay}>
                {p.playing ? <Pause /> : <Play />}
                {p.playing ? "Pause" : "Play"}
              </Button>
              <Label htmlFor="speed" className="sr-only">
                Speed
              </Label>
              <select
                id="speed"
                className={selectClass}
                value={p.speed}
                onChange={(e) => p.onSpeed(Number(e.target.value))}
              >
                {p.speeds.map((s) => (
                  <option key={s} value={s}>
                    {s}x
                  </option>
                ))}
              </select>
              <Label htmlFor="time" className="sr-only">
                Replay time
              </Label>
              <input
                id="time"
                type="range"
                className="min-w-16 flex-1 accent-primary"
                min={p.start}
                max={p.end}
                step={300}
                value={p.t}
                onChange={(e) => p.onSeek(Number(e.target.value))}
              />
              {p.onSkip && (
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <Button
                        size="sm"
                        variant="default"
                        aria-label="Skip to the demo vessel"
                        onClick={p.onSkip}
                      />
                    }
                  >
                    Demo
                  </TooltipTrigger>
                  <TooltipContent>Skip to the demo vessel</TooltipContent>
                </Tooltip>
              )}
            </>
          )}
          <span className="font-mono text-sm tabular-nums whitespace-nowrap">
            <span className={p.clockShort ? "max-sm:hidden" : ""}>{p.clockText}</span>
            {p.clockShort && <span className="sm:hidden">{p.clockShort}</span>}
          </span>
        </div>

        <div className="ml-auto flex items-center gap-3">
          <Switch id="paths" size="sm" checked={p.showPaths} onCheckedChange={p.onShowPaths} />
          <Label htmlFor="paths">Paths</Label>
          <Switch id="radar" size="sm" checked={p.showRadar} onCheckedChange={p.onShowRadar} />
          <Label htmlFor="radar">Radar</Label>
          <ThemeToggle />
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  size="icon-sm"
                  variant="ghost"
                  aria-label="Hide controls"
                  onClick={p.onToggleOverlay}
                />
              }
            >
              <EyeOff />
            </TooltipTrigger>
            <TooltipContent side="bottom">Hide controls</TooltipContent>
          </Tooltip>
        </div>
      </div>
      <p className="flex h-7 items-center bg-amber-100 px-3 text-xs text-amber-900 dark:bg-amber-950 dark:text-amber-100">
        {p.banner}
      </p>
    </header>
  );
}
