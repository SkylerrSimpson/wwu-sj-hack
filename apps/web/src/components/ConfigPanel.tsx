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
import { isOneWord, moveTo, type Config, type PatternField } from "@/lib/config";

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
  const [field, setField] = useState<PatternField>("callsign");
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
    if (!isOneWord(t))
      return setPatternError("A pattern is one word: no spaces, hyphens or slashes.");
    if (config.patterns.some((p) => p.text.toLowerCase() === t.toLowerCase()))
      return setPatternError(`"${t}" is already a pattern.`);
    const next = copy();
    next.patterns.push({ text: t, label: label.trim() || t, field });
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
  const addId = (to: ListKey, id: string) => onChange(moveTo(config, to, id));
  const removeId = (_from: ListKey, id: string) => onChange(moveTo(config, null, id));
  const typed = typedId.trim();

  const idTable = (from: ListKey, empty: string) =>
    config[from].size === 0 ? (
      <p className="text-sm text-muted-foreground">{empty}</p>
    ) : (
      <Table className="table-fixed">
        <TableHeader>
          <TableRow>
            <TableHead>Vessel</TableHead>
            <TableHead className="w-24" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {[...config[from]].map((id) => (
            <TableRow key={id}>
              <TableCell className="whitespace-normal [overflow-wrap:anywhere]">
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
          <CardTitle>Approved patterns</CardTitle>
          <CardAction>
            <Badge variant="secondary">{config.patterns.length}</Badge>
          </CardAction>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            A vessel whose call sign or name has one of these as a whole word is approved and never
            alerts.
          </p>
          <Table className="table-fixed">
            <TableHeader>
              <TableRow>
                <TableHead className="w-1/4">Text</TableHead>
                <TableHead>Label</TableHead>
                <TableHead className="max-sm:hidden">Matches</TableHead>
                <TableHead className="w-24" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {config.patterns.map((p) => (
                <TableRow key={p.text}>
                  <TableCell className="font-mono whitespace-normal [overflow-wrap:anywhere]">
                    {p.text}
                  </TableCell>
                  {/* On a phone the Matches column folds under the label, so Remove stays in view. */}
                  <TableCell className="whitespace-normal [overflow-wrap:anywhere]">
                    {p.label}
                    <span className="block text-xs text-muted-foreground sm:hidden">
                      Matches {p.field === "callsign" ? "call sign" : "name"}
                    </span>
                  </TableCell>
                  <TableCell className="whitespace-normal max-sm:hidden">
                    {p.field === "callsign" ? "Call sign" : "Name"}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="outline" size="sm" onClick={() => removePattern(p.text)}>
                      Remove
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <form onSubmit={addPattern} className="grid grid-cols-2 gap-2 sm:grid-cols-3">
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
            <div className="space-y-1">
              <Label htmlFor="pattern-field">Matches</Label>
              <select
                id="pattern-field"
                className="h-8 w-full rounded-md border border-input bg-background px-2 text-sm"
                value={field}
                onChange={(e) => setField(e.target.value === "name" ? "name" : "callsign")}
              >
                <option value="callsign">Call sign</option>
                <option value="name">Name</option>
              </select>
            </div>
            <p id="pattern-error" role="alert" className="col-span-2 text-sm text-destructive">
              {patternError}
            </p>
            <Button type="submit" size="sm" className="col-span-2 justify-self-start sm:col-span-3">
              Add pattern
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card size="sm">
        <CardHeader>
          <CardTitle>Add a vessel</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="vessel-select">Vessel</Label>
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
        </CardContent>
      </Card>

      <Card size="sm">
        <CardHeader>
          <CardTitle>Approved vessels</CardTitle>
          <CardAction>
            <Badge variant="secondary">{config.priority.size}</Badge>
          </CardAction>
        </CardHeader>
        <CardContent>{idTable("priority", "No vessels added yet.")}</CardContent>
      </Card>

      <Card size="sm">
        <CardHeader>
          <CardTitle>Watch list</CardTitle>
          <CardAction>
            <Badge variant="secondary">{config.watch.size}</Badge>
          </CardAction>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            You are alerted each time one of these enters Lummi waters.
          </p>
          {idTable("watch", 'No vessels added yet. Use "Add to watch list" above.')}
        </CardContent>
      </Card>
    </div>
  );
}
