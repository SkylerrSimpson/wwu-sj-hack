import { data, sourceOf } from "@/lib/data";

export default function Home() {
  return (
    <>
      <main className="mx-auto w-full max-w-2xl flex-1 p-6">
        <h1 className="text-2xl font-semibold">Walking skeleton</h1>
        <p className="mt-2 text-sm text-neutral-600">
          {data.records.length} records from {data.sources.length} source
          {data.sources.length === 1 ? "" : "s"}.
        </p>
        <ul role="list" className="mt-6 space-y-2">
          {data.records.map((item) => {
            const source = sourceOf(item);
            return (
              <li key={item.id} className="rounded border border-neutral-300 p-3">
                {item.name}
                <span className="block text-xs text-neutral-600">
                  {source?.name}, retrieved{" "}
                  <time dateTime={source?.retrieved}>{source?.retrieved}</time>
                </span>
              </li>
            );
          })}
        </ul>
      </main>
      <footer className="mx-auto w-full max-w-2xl px-6 pb-6 text-sm text-neutral-600">
        Data:{" "}
        {data.sources.map((s) => (
          <span key={s.id}>
            <a className="underline" href={s.url}>
              {s.name}
            </a>
            , retrieved <time dateTime={s.retrieved}>{s.retrieved}</time>.{" "}
          </span>
        ))}
      </footer>
    </>
  );
}
