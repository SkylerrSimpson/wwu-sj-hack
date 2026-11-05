import raw from "../../public/data.json";

export type Source = { id: string; name: string; url: string; retrieved: string };
export type Item = { id: string; source: string; name: string };
export type Data = { sources: Source[]; records: Item[] };

export const data: Data = raw;

export const sourceOf = (item: Item): Source | undefined =>
  data.sources.find((s) => s.id === item.source);
