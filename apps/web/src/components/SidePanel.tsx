"use client";

import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
} from "react";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { cn } from "cn";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { PANEL_DEFAULT, PANEL_MAX, PANEL_MIN, clampPanelWidth } from "@/lib/panel";
import { readPanelWidth, writePanelWidth } from "@/lib/storage";

export type SidePanelTab = "water" | "lists" | "alerts" | "vessel";

export type SidePanelProps = {
  panes: Record<SidePanelTab, ReactNode>;
  counts?: Partial<Record<SidePanelTab, number>>;
  // Leave both out and the panel keeps the open tab itself.
  tab?: SidePanelTab;
  onTab?: (t: SidePanelTab) => void;
  collapsed: boolean;
  footer?: ReactNode;
  onCollapse: (b: boolean) => void;
  className?: string;
};

const TABS: [SidePanelTab, string][] = [
  ["water", "In the water"],
  ["lists", "Lists"],
  ["alerts", "Alerts"],
  ["vessel", "Vessel"],
];

export default function SidePanel({
  panes,
  counts,
  tab,
  onTab,
  collapsed,
  onCollapse,
  footer,
  className,
}: SidePanelProps) {
  const [width, setWidth] = useState(PANEL_DEFAULT);
  const drag = useRef<{ x: number; width: number } | null>(null);
  // Loaded after mount, so the server and first client render agree.
  useEffect(() => {
    setWidth(clampPanelWidth(readPanelWidth(localStorage) ?? PANEL_DEFAULT, window.innerWidth));
    const fit = () => setWidth((w) => clampPanelWidth(w, window.innerWidth));
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);
  const resize = (w: number, save: boolean) => {
    const next = clampPanelWidth(w, window.innerWidth);
    setWidth(next);
    if (save) writePanelWidth(localStorage, next);
  };
  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, width };
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (drag.current) resize(drag.current.width + e.clientX - drag.current.x, false);
  };
  const onPointerUp = () => {
    if (!drag.current) return;
    drag.current = null;
    writePanelWidth(localStorage, width);
  };
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const to = {
      ArrowLeft: width - 16,
      ArrowRight: width + 16,
      Home: PANEL_MIN,
      End: PANEL_MAX,
    }[e.key];
    if (to === undefined) return;
    e.preventDefault();
    resize(to, true);
  };

  // The strip and the column are both always mounted: the alert pane remembers what it has sent.
  const strip = (
    <div
      className={cn(
        "flex w-10 flex-col items-center border-r bg-background py-2",
        collapsed ? "" : "hidden",
        className,
      )}
    >
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label="Show panel"
              onClick={() => onCollapse(false)}
            />
          }
        >
          <PanelLeftOpen />
        </TooltipTrigger>
        <TooltipContent side="right">Show panel</TooltipContent>
      </Tooltip>
    </div>
  );
  return (
    <>
      {strip}
      <Tabs
        defaultValue="water"
        value={tab}
        onValueChange={(v) => onTab?.(v as SidePanelTab)}
        style={{ width }}
        className={cn("gap-0 border-r bg-background", collapsed ? "hidden" : "", className)}
      >
        {/* Drag to resize, or focus and use the arrow keys; double-click resets. */}
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize panel"
          aria-valuemin={PANEL_MIN}
          aria-valuemax={PANEL_MAX}
          aria-valuenow={width}
          tabIndex={0}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onKeyDown={onKeyDown}
          onDoubleClick={() => resize(PANEL_DEFAULT, true)}
          className="group/handle absolute inset-y-0 -right-1.5 z-10 w-3 cursor-col-resize touch-none outline-none"
        >
          <div className="mx-auto h-full w-0.5 group-hover/handle:bg-ring group-focus-visible/handle:bg-ring" />
        </div>
        <div className="flex items-center gap-1 border-b p-2">
          <TabsList className="w-full">
            {TABS.map(([key, label]) => (
              <TabsTrigger key={key} value={key} className="px-1 text-xs">
                {label}
                {counts?.[key] !== undefined && (
                  <Badge variant="secondary" className="px-1.5">
                    {counts[key]}
                  </Badge>
                )}
              </TabsTrigger>
            ))}
          </TabsList>
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  size="icon-sm"
                  variant="ghost"
                  aria-label="Hide panel"
                  onClick={() => onCollapse(true)}
                />
              }
            >
              <PanelLeftClose />
            </TooltipTrigger>
            <TooltipContent side="bottom">Hide panel</TooltipContent>
          </Tooltip>
        </div>
        {TABS.map(([key]) => (
          <TabsContent
            key={key}
            value={key}
            keepMounted
            className="min-h-0 flex-1 overflow-y-auto p-3"
          >
            {panes[key]}
          </TabsContent>
        ))}
        {footer && <div className="border-t p-3">{footer}</div>}
      </Tabs>
    </>
  );
}
