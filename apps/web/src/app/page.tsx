import type { Metadata } from "next";
import SignIn from "@/components/SignIn";

export const metadata: Metadata = { title: "Sign in, Lummi Vessel Tracker" };

export default function Page() {
  return (
    <main className="flex flex-1 items-center justify-center bg-muted p-4">
      <SignIn />
    </main>
  );
}
