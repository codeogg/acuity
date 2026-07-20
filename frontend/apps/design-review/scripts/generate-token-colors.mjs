/**
 * Generates src/app/_lib/token-colors.generated.json from the deployed theme
 * overlay (packages/theme/tokens.css, the source of @component-core/acuity).
 *
 * The Colour page must reflect EVERY colour-bearing custom property the app
 * actually ships — not just the hand-curated brand tiers. That full roster
 * (extended primitives, semantic roles, sidebar, charts, interaction/link,
 * field states, status tones, surface aliases, facsimile) lives in tokens.css.
 * Parsing it here keeps the review surface exact and drift-free, exactly as
 * generate-type-scale.mjs vendors the acuity-dev type scale.
 *
 * Only the light-mode :root block is read (the app is light-only). Each entry
 * carries: the css var, its category (from the section comment), the single
 * `var(--ref)` it aliases (if any, so the editor can resolve alias chains), the
 * raw declaration, and a best-effort resolved hex fallback. VALUES shown in the
 * app are live-read from the stylesheet at runtime; this snapshot is the roster
 * + alias graph + structural fallback.
 *
 * Source override: ACUITY_THEME_TOKENS_CSS (defaults to packages/theme/tokens.css).
 */
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const cssPath =
  process.env.ACUITY_THEME_TOKENS_CSS ??
  resolve(scriptDir, "../../../packages/theme/tokens.css");

let css;
try {
  css = await readFile(cssPath, "utf8");
} catch (err) {
  // Source not reachable (e.g. CI without the theme package). Keep the committed
  // snapshot rather than failing the build — same policy as generate-type-scale.
  console.warn(
    `[generate-token-colors] theme tokens not found at ${cssPath} — keeping committed snapshot. (${err.code ?? err.message})`,
  );
  process.exit(0);
}

// Isolate the first :root { ... } block (light mode; .dark is ignored).
const rootMatch = css.match(/:root\s*\{([\s\S]*?)\n\}/);
if (!rootMatch) {
  console.warn("[generate-token-colors] no :root block found — keeping committed snapshot.");
  process.exit(0);
}
const body = rootMatch[1];

// Map a section comment to a colour category id, or null when the section is a
// non-colour foundation (radius / elevation / motion / typography / layout) —
// which also terminates colour parsing for everything below it.
function sectionCategory(comment) {
  const c = comment.toLowerCase();
  if (/(radius|elevation|shadow|motion|typography|font|layout|size|container)/.test(c)) return "__stop__";
  if (c.includes("primitive palette")) return "primitive";
  if (c.includes("back-compat aliases")) return "primitive-alias";
  if (c.includes("semantic color")) return "semantic";
  if (c.includes("sidebar")) return "sidebar";
  if (c.includes("chart")) return "chart";
  if (c.includes("interaction")) return "interaction";
  if (c.includes("field-state")) return "state";
  if (c.includes("status-tone")) return "tone";
  if (c.includes("surface + border") || c.includes("surface aliases")) return "surface-alias";
  if (c.includes("facsimile")) return "facsimile";
  return null; // unrecognised comment — leave the current category unchanged
}

const COLOUR_CATEGORIES = new Set([
  "primitive",
  "primitive-alias",
  "semantic",
  "sidebar",
  "chart",
  "interaction",
  "state",
  "tone",
  "surface-alias",
  "facsimile",
]);

// A declaration value is a colour if it is a hex / rgb(a) / hsl(a) / oklch(...)
// literal, or a single var(--x) alias. Within a colour section every value
// qualifies, but we guard so a stray non-colour line is skipped rather than
// mis-emitted.
const isColourValue = (v) =>
  /^#[0-9a-fA-F]{3,8}$/.test(v) ||
  /^(rgb|rgba|hsl|hsla|oklch|oklab|color-mix)\(/i.test(v) ||
  /^var\(--[\w-]+\)$/.test(v);

// Build ordered section breakpoints from every comment (single- OR multi-line)
// by its position in the body, so a declaration inherits the category of the
// last section comment before it. Once a non-colour foundation section starts,
// everything after it is excluded.
const breakpoints = []; // [{ index, category }]
for (const m of body.matchAll(/\/\*([\s\S]*?)\*\//g)) {
  const cat = sectionCategory(m[1]);
  if (cat) breakpoints.push({ index: m.index, category: cat });
}
function categoryAt(index) {
  let cat = null;
  for (const bp of breakpoints) {
    if (bp.index > index) break;
    cat = bp.category;
  }
  return cat;
}

const raw = new Map(); // cssVar -> raw value (colour decls only)
const order = []; // [{ cssVar, category, ref, raw }]

for (const m of body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
  const category = categoryAt(m.index);
  if (category === "__stop__" || !COLOUR_CATEGORIES.has(category ?? "")) continue;
  const cssVar = m[1];
  // Strip any inline comment from the value.
  const value = m[2].replace(/\/\*[\s\S]*?\*\//g, "").trim();
  if (!isColourValue(value)) continue;

  const refMatch = value.match(/^var\((--[\w-]+)\)$/);
  raw.set(cssVar, value);
  order.push({ cssVar, category, ref: refMatch ? refMatch[1] : null, raw: value });
}

// ── Resolve a css colour string to #RRGGBB (best effort; alpha dropped). ──────
function clamp255(n) {
  return Math.max(0, Math.min(255, Math.round(n)));
}
function toHex(color) {
  const v = color.trim();
  const hex = v.match(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/);
  if (hex) {
    let h = hex[1];
    if (h.length === 3) h = h.split("").map((c) => c + c).join("");
    return `#${h.toUpperCase()}`;
  }
  const rgb = v.match(/^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/i);
  if (rgb) {
    return (
      "#" +
      [rgb[1], rgb[2], rgb[3]].map((n) => clamp255(Number(n)).toString(16).padStart(2, "0")).join("").toUpperCase()
    );
  }
  return null; // hsl/oklch/color-mix — leave to the runtime live-read
}

// Follow a var(--ref) chain (within the parsed map) to a concrete colour.
function resolveHex(cssVar, seen = new Set()) {
  if (seen.has(cssVar)) return null;
  seen.add(cssVar);
  const value = raw.get(cssVar);
  if (value === undefined) return null;
  const refMatch = value.match(/^var\((--[\w-]+)\)$/);
  if (refMatch) return resolveHex(refMatch[1], seen);
  return toHex(value);
}

const entries = order.map((e) => ({
  cssVar: e.cssVar,
  category: e.category,
  ref: e.ref,
  raw: e.raw,
  hex: resolveHex(e.cssVar) ?? "#000000",
}));

const dest = resolve(scriptDir, "../src/app/_lib/token-colors.generated.json");
const payload =
  JSON.stringify(
    {
      $generated: "by scripts/generate-token-colors.mjs from packages/theme/tokens.css :root — do not hand-edit",
      $source: "packages/theme/tokens.css (@component-core/acuity overlay)",
      entries,
    },
    null,
    2,
  ) + "\n";
await writeFile(dest, payload, "utf8");

const byCat = entries.reduce((m, e) => ((m[e.category] = (m[e.category] ?? 0) + 1), m), {});
console.log(`Wrote ${entries.length} colour tokens → ${dest}`);
for (const [cat, n] of Object.entries(byCat)) console.log(`  ${cat}: ${n}`);
