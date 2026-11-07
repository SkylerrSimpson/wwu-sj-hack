"use client";

import { useState, type FormEvent } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { Config } from "@/lib/config";

type Named = { id: string; name: string };
type ListKey = "priority" | "watch";

const selectClass =
  "h-8 w-full rounded-lg border border-input bg-transparent px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

export default function ConfigPanel({
  vessels,
  config,
  selected,
  onSelect,
  onChange,
}: {
  vessels: Named[];
  config: Config;
  selected: string | null;
  onSelect: (id: string | null) => void;
  onChange: (config: Config) => void;
}) {
  const [text, setText] = useState("");
  const [label, setLabel] = useState("");
  const [patternError, setPatternError] = useState("");
  const [typedId, setTypedId] = useState("");

  const nameOf = (id: string) => vessels.find((v) => v.id === id)?.name;
  const copy = (): Config => ({
    patterns: [...config.patterns],
    priority: new Set(config.priority),
    watch: new Set(config.watch),
  });

  const addPattern = (e: FormEvent) => {
    e.preventDefault();
    const t = text.trim();
    if (!t) return setPatternError("Type the text to match before adding.");
    if (config.patterns.some((p) => p.text.toLowerCase() === t.toLowerCase()))
      return setPatternError(`"${t}" is already a pattern.`);
    const next = copy();
    next.patterns.push({ text: t, label: label.trim() || t });
    onChange(next);
    setText("");
    setLabel("");
    setPatternError("");
  };
  const removePattern = (text: string) => {
    const next = copy();
    next.patterns = next.patterns.filter((p) => p.text !== text);
    onChange(next);
  };
  // Adding to one list removes from the other, so a vessel is never on both.
  const addId = (to: ListKey, id: string) => {
    const next = copy();
    next.priority.delete(id);
    next.watch.delete(id);
    next[to].add(id);
    onChange(next);
  };
  const removeId = (from: ListKey, id: string) => {
    const next = copy();
    next[from].delete(id);
    onChange(next);
  };
  const typed = typedId.trim();

  const idTable = (from: ListKey, empty: string) =>
    config[from].size === 0 ? (
      <p className="text-sm text-muted-foreground">{empty}</p>
    ) : (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Vessel</TableHead>
            <TableHead className="w-0" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {[...config[from]].map((id) => (
            <TableRow key={id}>
              <TableCell>
                {nameOf(id) ?? id}
                <span className="block text-xs text-muted-foreground">
                  {nameOf(id) ? `AIS id ${id}` : "Not in this recording"}
                </span>
              </TableCell>
              <TableCell className="text-right">
                <Button variant="outline" size="sm" onClick={() => removeId(from, id)}>
                  Remove
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    );

  return (
    <div className="space-y-4">
      <Card size="sm">
        <CardHeader>
          <CardTitle>Approved name patterns</CardTitle>
          <CardAction>
            <Badge variant="secondary">{config.patterns.length}</Badge>
          </CardAction>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            A vessel whose AIS name or call sign has one of these as a word is approved and never
            alerts.
          </p>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Text</TableHead>
                <TableHead>Label</TableHead>
                <TableHead className="w-0" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {config.patterns.map((p) => (
                <TableRow key={p.text}>
                  <TableCell className="font-mono">{p.text}</TableCell>
                  <TableCell>{p.label}</TableCell>
                  <TableCell className="text-right">
                    <Button variant="outline" size="sm" onClick={() => removePattern(p.text)}>
                      Remove
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <form onSubmit={addPattern} className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label htmlFor="pattern-text">Text to match</Label>
              <Input
                id="pattern-text"
                value={text}
                onChange={(e) => setText(e.target.value)}
                aria-invalid={patternError !== ""}
                aria-describedby="pattern-error"
                placeholder="XWL"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="pattern-label">Label</Label>
              <Input
                id="pattern-label"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="Lummi Nation"
              />
            </div>
            <p id="pattern-error" role="alert" className="col-span-2 text-sm text-destructive">
              {patternError}
            </p>
            <Button type="submit" size="sm" className="col-span-2 justify-self-start">
              Add pattern
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card size="sm">
        <CardHeader>
          <CardTitle>Approved vessels</CardTitle>
          <CardAction>
            <Badge variant="secondary">{config.priority.size}</Badge>
          </CardAction>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="vessel-select">Vessel (or click a dot on the map)</Label>
            <select
              id="vessel-select"
              className={selectClass}
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
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              disabled={!selected}
              onClick={() => selected && addId("priority", selected)}
            >
              Approve
            </Button>
            <Button
              size="sm"
              variant="destructive"
              disabled={!selected}
              onClick={() => selected && addId("watch", selected)}
            >
              Add to watch list
            </Button>
          </div>
          <div className="space-y-1">
            <Label htmlFor="typed-id">Or type an AIS id</Label>
            <div className="flex gap-2">
              <Input
                id="typed-id"
                value={typedId}
                onChange={(e) => setTypedId(e.target.value)}
                placeholder="366709770"
              />
              <Button
                size="sm"
                variant="outline"
                disabled={!typed}
                onClick={() => {
                  addId("priority", typed);
                  setTypedId("");
                }}
              >
                Approve
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={!typed}
                onClick={() => {
                  addId("watch", typed);
                  setTypedId("");
                }}
              >
                Watch
              </Button>
            </div>
          </div>
          {idTable("priority", "No vessels approved by id yet.")}
        </CardContent>
      </Card>

      <Card size="sm">
        <CardHeader>
          <CardTitle>Watch list</CardTitle>
          <CardAction>
            <Badge variant="destructive">{config.watch.size}</Badge>
          </CardAction>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            You are alerted each time one of these enters Lummi waters.
          </p>
          {idTable("watch", "The watch list is empty.")}
        </CardContent>
      </Card>
    </div>
  );
}
