import Link from "next/link";

// Placeholder until the sign-in screen lands; the map lives at /map.
export default function Landing() {
  return (
    <main className="mx-auto w-full max-w-5xl flex-1 p-4">
      <h1 className="text-2xl font-semibold">Lummi Vessel Tracker</h1>
      <Link className="underline" href="/map">
        Open the map
      </Link>
    </main>
  );
}
