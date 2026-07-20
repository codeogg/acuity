import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { ReviewProvider } from "./review-state";
import { ReviewNav } from "./review-nav";

export const metadata: Metadata = {
  title: "Acuity design review",
  robots: { index: false, follow: false },
};

// Internal harness chrome: a floating switcher capsule (the house floating-bar
// grammar) over the cream canvas, with the review page below. The brand faces
// (Fraunces titles, IBM Plex Mono accents) load from the Google Fonts CDN so
// the harness renders on-brand; the Fonts page loads additional families on
// demand for previews. Everything is wrapped in ReviewProvider so edits persist
// across section switches.
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* Fraunces loaded with its FULL variable axes (opsz/wght + SOFT + WONK,
            roman + italic) so the Fonts page can preview font-variation-settings
            (the "compression"/optical-size axes) live. This is the App Router
            root layout, so the stylesheet applies to every page; the rule below
            targets pages/_document and misfires here. */}
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link
          href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght,SOFT,WONK@0,9..144,100..900,0..100,0..1;1,9..144,100..900,0..100,0..1&family=IBM+Plex+Mono:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-screen bg-background font-sans text-foreground antialiased">
        <ReviewProvider>
          <div className="no-print sticky top-0 z-40 px-3 pt-3">
            <ReviewNav />
          </div>
          <main className="mx-auto w-full max-w-6xl px-6 py-10">{children}</main>
        </ReviewProvider>
      </body>
    </html>
  );
}
