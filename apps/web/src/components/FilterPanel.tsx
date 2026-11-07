"use client";

import { Label } from "@/components/ui/label";
import { CATEGORIES, type Filter } from "@/lib/stats";

export type FilterPanelProps = {
  filter: Filter;
  onFilter: (f: Filter) => void;
  // Unix seconds the time dropdowns may choose from.
  start: number;
  end: number;
};

const selectClass =
  "h-7 w-full rounded-lg border border-input bg-transparent px-2 text-[0.8rem] outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

const hour = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Los_Angeles",
  weekday: "short",
  month: "short",
  day: "numeric",
  hour: "numeric",
});

export default function FilterPanel({ filter, onFilter, start, end }: FilterPanelProps) {
  const hours: number[] = [];
  for (let t = Math.ceil(start / 3600) * 3600; t <= end; t += 3600) hours.push(t);
  const timeSelect = (id: "start" | "end", label: string, empty: string) => (
    <div className="space-y-1">
      <Label htmlFor={`filter-${id}`}>{label}</Label>
      <select
        id={`filter-${id}`}
        className={selectClass}
        value={filter[id] ?? ""}
        onChange={(e) =>
          onFilter({ ...filter, [id]: e.target.value === "" ? null : Number(e.target.value) })
        }
      >
        <option value="">{empty}</option>
        {hours.map((t) => (
          <option key={t} value={t}>
            {hour.format(t * 1000)}
          </option>
        ))}
      </select>
    </div>
  );
  return (
    <div className="space-y-3 text-sm">
      <fieldset className="space-y-1.5">
        <legend className="font-medium">Type</legend>
        {CATEGORIES.map(([c, label]) => (
          <label key={c} className="flex items-center gap-2">
            <input
              type="checkbox"
              className="accent-primary"
              checked={filter.categories.has(c)}
              onChange={(e) => {
                const categories = new Set(filter.categories);
                if (e.target.checked) categories.add(c);
                else categories.delete(c);
                onFilter({ ...filter, categories });
              }}
            />
            {label}
          </label>
        ))}
      </fieldset>
      <fieldset className="grid grid-cols-2 gap-2">
        <legend className="mb-1.5 font-medium">Time (Pacific)</legend>
        {timeSelect("start", "From", "Start of recording")}
        {timeSelect("end", "To", "Replay time")}
      </fieldset>
    </div>
  );
}
