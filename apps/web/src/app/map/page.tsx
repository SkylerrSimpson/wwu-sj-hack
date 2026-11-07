import Replay from "@/components/Replay";
import { data } from "@/lib/data";

export default function Home() {
  return (
    <>
      <main className="mx-auto w-full max-w-5xl flex-1 p-4">
        <h1 className="text-2xl font-semibold">Lummi Vessel Tracker</h1>
        <Replay />
      </main>
      <footer className="mx-auto w-full max-w-5xl px-4 pb-4 text-sm text-neutral-600">
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
