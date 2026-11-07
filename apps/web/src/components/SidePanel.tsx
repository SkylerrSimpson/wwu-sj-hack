"use client";

import type { ReactNode } from "react";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { cn } from "cn";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

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
        className={cn("w-80 gap-0 border-r bg-background", collapsed ? "hidden" : "", className)}
      >
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
