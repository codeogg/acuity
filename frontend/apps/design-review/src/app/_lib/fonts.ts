// Client helpers for the Fonts page: load an arbitrary Google Font on demand so
// the family picker can preview every option in its own face, and turn a font
// stack into a valid CSS font-family string. The v1 CSS API is used because it
// silently drops weights a family doesn't have (css2 400s the whole request),
// which keeps arbitrary-family previews robust.

const loaded = new Set<string>();

// Faces already available from the system or the layout's CDN load — never
// fetched from Google Fonts here (they have no web-font URL, are local, or are
// loaded by layout.tsx with their FULL variable axes, which a v1 static reload
// would shadow — breaking font-variation-settings previews).
const SYSTEM_FACES = new Set([
  "-apple-system",
  "BlinkMacSystemFont",
  "Segoe UI",
  "Helvetica Neue",
  "Arial",
  "Georgia",
  "Times New Roman",
  "system-ui",
  "ui-monospace",
  "ui-sans-serif",
  "ui-serif",
  "serif",
  "sans-serif",
  "monospace",
  "PingFang TC",
  // Loaded variable by layout.tsx — do not re-fetch a static instance.
  "Fraunces",
  "IBM Plex Mono",
]);

export function ensureFont(family: string) {
  if (typeof document === "undefined") return;
  const name = family.trim().replace(/^["']|["']$/g, "");
  if (!name || loaded.has(name) || SYSTEM_FACES.has(name)) return;
  loaded.add(name);
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.dataset.dynamicFont = name;
  link.href = `https://fonts.googleapis.com/css?family=${name.replace(/ /g, "+")}:400,400italic,500,600,600italic,700&display=swap`;
  document.head.appendChild(link);
}

const GENERIC = new Set(["serif", "sans-serif", "monospace", "system-ui", "ui-monospace", "ui-serif", "ui-sans-serif", "cursive", "fantasy"]);

/** Quote family names that need it; leave generics and hyphen-keywords bare. */
export function stackToCss(stack: string[]): string {
  return stack
    .map((t) => t.trim())
    .filter(Boolean)
    .map((t) => {
      const bare = t.replace(/^["']|["']$/g, "");
      if (GENERIC.has(bare)) return bare;
      if (bare.startsWith("-")) return bare; // -apple-system, etc.
      return /\s/.test(bare) ? `"${bare}"` : bare;
    })
    .join(", ");
}

/** Category → generic fallback, for previewing a single family cleanly. */
export function categoryFallback(category: string): string {
  if (category === "serif") return "serif";
  if (category === "mono") return "monospace";
  if (category === "cjk") return "serif";
  return "sans-serif";
}
