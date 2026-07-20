// Shared Acuity webfont wiring - the single next/font setup every surface
// applies in its root [locale] layout (import from "@acuity/ui/fonts").
//
// Faces (FINAL.md typography): Fraunces (Latin titles, 400/500/600 + italic),
// IBM Plex Mono (eyebrows / section numbers / code), Noto Serif TC (zh-Hant
// titles) and Noto Sans TC (zh-Hant body). The loaders expose CSS variables the
// theme's font stacks resolve first (--font-title / --font-sans / --font-mono
// in @acuity/ui/styles.css), so a surface that applies `acuityFontVariables`
// on <html> renders the designed faces in both scripts.
//
// The Noto TC faces load with `preload: false` and no `subsets` filter: Google
// serves CJK families as ~100 unicode-range slices and next/font has no
// chinese-traditional preload subset, so declaring latin-only subsets would
// merely preload-hint Latin while zh glyphs stream on demand. Omitting the
// filter keeps every slice declared and lets the browser fetch exactly the
// ranges a page uses.

import {
  Fraunces,
  IBM_Plex_Mono,
  Noto_Sans_TC,
  Noto_Serif_TC,
} from "next/font/google";

export const fraunces = Fraunces({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  style: ["normal", "italic"],
  variable: "--font-fraunces",
  display: "swap",
});

export const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-plex-mono",
  display: "swap",
});

export const notoSerifTC = Noto_Serif_TC({
  weight: ["500", "600"],
  variable: "--font-noto-serif-tc",
  display: "swap",
  preload: false,
});

export const notoSansTC = Noto_Sans_TC({
  weight: ["400", "500"],
  variable: "--font-noto-sans-tc",
  display: "swap",
  preload: false,
});

/** Apply on the root <html> element: `<html className={acuityFontVariables}>`. */
export const acuityFontVariables = [
  fraunces.variable,
  plexMono.variable,
  notoSerifTC.variable,
  notoSansTC.variable,
].join(" ");
