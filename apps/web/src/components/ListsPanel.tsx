"use client";

import { Button } from "@/components/ui/button";
import type { Lists } from "@/lib/vessel";

type Named = { id: string; name: string };

export default function ListsPanel({
  vessels,
  lists,
  selected,
  onSelect,
  onChange,
}: {
  vessels: Named[];
  lists: Lists;
  selected: string | null;
  onSelect: (id: string | null) => void;
  onChange: (lists: Lists) => void;
}) {
  const nameOf = (id: string) => vessels.find((v) => v.id === id)?.name ?? id;
  // Adding to one list removes from the other, so a vessel is never on both.
  const add = (to: keyof Lists, id: string) => {
    const next = { priority: new Set(lists.priority), watch: new Set(lists.watch) };
    next.priority.delete(id);
    next.watch.delete(id);
    next[to].add(id);
    onChange(next);
  };
  const remove = (from: keyof Lists, id: string) => {
    const next = { priority: new Set(lists.priority), watch: new Set(lists.watch) };
    next[from].delete(id);
    onChange(next);
  };
  const list = (title: string, from: keyof Lists) => (
    <div>
      <h3 className="mt-3 text-sm font-semibold">
        {title} ({lists[from].size})
      </h3>
      <ul role="list" className="text-sm">
        {[...lists[from]].map((id) => (
          <li key={id} className="flex items-center justify-between gap-2 py-1">
            <span>{nameOf(id)}</span>
            <Button variant="outline" size="sm" onClick={() => remove(from, id)}>
              Remove
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );

  return (
    <section aria-labelledby="lists-heading" className="rounded border border-neutral-300 p-3">
      <h2 id="lists-heading" className="font-semibold">
        The officer&apos;s lists
      </h2>
      <label htmlFor="vessel-select" className="mt-2 block text-sm">
        Vessel (or click a dot on the map)
      </label>
      <select
        id="vessel-select"
        className="mt-1 w-full rounded border border-neutral-300 p-1 text-sm"
        value={selected ?? ""}
        onChange={(e) => onSelect(e.target.value || null)}
      >
        <option value="">Choose a vessel</option>
        {vessels.map((v) => (
          <option key={v.id} value={v.id}>
            {v.name}
          </option>
        ))}
      </select>
      <div className="mt-2 flex gap-2">
        <Button
          size="sm"
          disabled={!selected}
          onClick={() => selected && add("priority", selected)}
        >
          Add to priority
        </Button>
        <Button
          size="sm"
          variant="destructive"
          disabled={!selected}
          onClick={() => selected && add("watch", selected)}
        >
          Add to watch list
        </Button>
      </div>
      {list("Priority, added by the officer", "priority")}
      {list("Watch list", "watch")}
    </section>
  );
}
