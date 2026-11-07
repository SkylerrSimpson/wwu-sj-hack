"use client";

import Link from "next/link";
import { Eye, EyeOff, Menu, Pause, Play } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export type TopBarProps = {
  mode: "replay" | "live";
  onMode: (m: "replay" | "live") => void;
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
  feedText?: string;
  showPaths: boolean;
  onShowPaths: (b: boolean) => void;
  showRadar: boolean;
  onShowRadar: (b: boolean) => void;
  overlayShown: boolean;
  onToggleOverlay: () => void;
  banner: string;
};

// Leaflet's own controls sit at z-index 1000, so the chrome goes one above.
const Z = "z-10";

const selectClass =
  "h-7 rounded-lg border border-input bg-transparent px-2 text-[0.8rem] outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

export default function TopBar(p: TopBarProps) {
  if (!p.overlayShown)
    return (
      <>
        <p className={`fixed inset-x-0 top-0 ${Z} bg-amber-100 px-3 py-1 text-xs text-amber-900`}>
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
  const replay = p.mode === "replay";
  return (
    <header className={`fixed inset-x-0 top-0 ${Z}`}>
      <div className="flex h-12 items-center gap-3 border-b bg-background px-3">
        <Tooltip>
          <TooltipTrigger
            render={
              <Link
                href="/settings"
                aria-label="Settings"
                className={buttonVariants({ variant: "ghost", size: "icon-sm" })}
              />
            }
          >
            <Menu />
          </TooltipTrigger>
          <TooltipContent side="bottom">Settings</TooltipContent>
        </Tooltip>
        <span className="text-sm whitespace-nowrap">
          <span className="font-bold">LVT</span>{" "}
          <span className="hidden text-muted-foreground md:inline">Lummi Vessel Tracker</span>
        </span>

        <div className="flex min-w-0 flex-1 items-center gap-2">
          <div role="group" aria-label="Mode" className="flex gap-1">
            <Button
              size="sm"
              variant={replay ? "default" : "outline"}
              aria-pressed={replay}
              onClick={() => p.onMode("replay")}
            >
              Recorded days
            </Button>
            <Button
              size="sm"
              variant={replay ? "outline" : "default"}
              aria-pressed={!replay}
              onClick={() => p.onMode("live")}
            >
              Live
            </Button>
          </div>
          {replay ? (
            <>
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
                <Button size="sm" variant="ghost" onClick={p.onSkip}>
                  Skip to the demo vessel
                </Button>
              )}
            </>
          ) : (
            <span className="flex-1 truncate text-sm text-muted-foreground">{p.feedText}</span>
          )}
          <span className="font-mono text-sm tabular-nums whitespace-nowrap">{p.clockText}</span>
        </div>

        <div className="flex items-center gap-3">
          <Switch id="paths" size="sm" checked={p.showPaths} onCheckedChange={p.onShowPaths} />
          <Label htmlFor="paths">Paths</Label>
          <Switch id="radar" size="sm" checked={p.showRadar} onCheckedChange={p.onShowRadar} />
          <Label htmlFor="radar">Radar</Label>
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
      <p className="flex h-7 items-center bg-amber-100 px-3 text-xs text-amber-900">{p.banner}</p>
    </header>
  );
}
