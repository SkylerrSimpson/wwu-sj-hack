import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Lummi Vessel Tracker",
  description:
    "Vessels in Lummi waters from recorded AIS, with an alert when one not on the approved list enters.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <p role="status" className="bg-amber-100 px-4 py-2 text-sm text-amber-900">
          Approved list invented for this demo; no vessel shown is suspected of anything.
        </p>
        {children}
        <p className="mx-auto w-full max-w-5xl px-4 pb-4 text-sm text-neutral-600">
          Approximate boundary, not a legal boundary. Most fishing and recreational boats under 65
          ft don&apos;t carry AIS; no alert does not mean no unapproved boat was there.
        </p>
      </body>
    </html>
  );
}
