// Seed data model for the design-review editor. Every editable thing (colour,
// elevation tier, type role, font family) is described here with its default
// value, the LIVE CSS variable it drives (so edits re-render the real
// stylesheet in place), and the canonical token path in
// docs/design/system/tokens/*.json (so an export can be fed straight back to
// update the source of truth). Values are verbatim from
// packages/theme/presets/caliber-light.tokens.json and FINAL.md §Typography.
//
// Nothing here reads the live stylesheet: the defaults ARE the ratified values,
// and the ReviewState provider re-applies overrides as inline custom
// properties, so `var(--caliber-*)` swatches/demos follow every edit.
//
// The type scale is the exception — it is not exposed as runtime CSS vars by the
// frontend, so it is generated from the acuity-dev canonical token source at
// build time (scripts/generate-type-scale.mjs → type-scale.generated.json).

import GENERATED_TYPE from "./type-scale.generated.json";
import TOKEN_COLORS from "./token-colors.generated.json";

// ─── Colours ────────────────────────────────────────────────────────────────

export type ColorEntry = {
  id: string;
  /** Live custom property this drives (hidden from the roster display). */
  cssVar: string;
  /** Canonical token path in primitive.color.caliber.* (for hand-back export). */
  tokenPath: string;
  name: string;
  hex: string;
  /** Usage classification — the sortable "category" column. */
  category: string;
  /** Longer note on where the colour is actually used (second-class). */
  usage: string;
  /**
   * For token/code colours that alias another token (`--border: var(--caliber-border)`):
   * the single css var they reference. The editor resolves this chain so an
   * aliased row reflects edits to its source. Undefined for raw-value colours.
   */
  ref?: string;
};

export type ColorTier = {
  id: string;
  title: string;
  note?: string;
  /**
   * "brand" tiers are the curated palette (friendly names, hidden token names);
   * "token" tiers are the frontend/code colours (the css var IS the subject, its
   * definition/alias is shown). Defaults to "brand" when unset.
   */
  kind?: "brand" | "token";
  entries: ColorEntry[];
};

const c = (
  id: string,
  name: string,
  hex: string,
  category: string,
  usage: string,
): ColorEntry => ({
  id,
  cssVar: `--caliber-${id}`,
  tokenPath: `primitive.color.caliber.${id}`,
  name,
  hex,
  category,
  usage,
});

// Facsimile colour: a non-brand token (paper-emulation), defined in the theme's
// facsimile token layer and emitted as a --facsimile-* var (read live).
const f = (
  id: string,
  name: string,
  hex: string,
  category: string,
  usage: string,
): ColorEntry => ({
  id,
  cssVar: `--${id}`,
  tokenPath: `packages/theme/facsimile.tokens.json → --${id}`,
  name,
  hex,
  category,
  usage,
});

const BRAND_TIERS: ColorTier[] = [
  {
    id: "main",
    title: "Main accent",
    note: "The core brand colour and the supporting surface/ink neutrals it sits on. Raised surfaces reuse the default surface (light cream).",
    entries: [
      c("navy", "navy blue", "#072052", "core brand", "Primary actions, hero/footer grounds, wordmark, active text — the single defining brand colour."),
      c("cream", "light cream", "#FFFEFD", "supporting · default surface", "Page canvas + card fill + raised surfaces (the warm ground everything sits on)."),
      c("cream-contrast", "cream", "#FCFBF9", "supporting · contrast surface", "Recessed resting fills (near-invisible by design; never hover feedback)."),
      c("ink", "ink black", "#0A122A", "supporting · ink", "Body text on cream; the darkest brand neutral."),
    ],
  },
  {
    id: "secondary",
    title: "Secondary accent",
    note: "UI colours directly beneath the main accent. Buttons, links, interactive states, highlights, selected states, badges, navigation, secondary CTAs, and major interface accents.",
    entries: [
      c("sky-blue", "sky blue", "#C7D9E6", "blue", "The active-state wash (nav/tab boxes), the on-navy CTA pill, hero title emphasis."),
      c("glaucous", "glaucous", "#6082B6", "blue", "Info tone, proof-panel ground, count chips, loading tints; secondary button."),
      c("venice-blue", "venice blue", "#16587B", "blue", "Links, count-chip text, secondary-action hover."),
      c("slate-blue", "slate blue", "#629BB5", "blue", "Info semantic role."),
      c("dust-blue", "dust blue", "#8AA8C0", "blue", "Reserved chart/accent step."),
      c("muted-iris", "muted iris", "#8F89B7", "iris", "Accent tone (console badge set), chart step."),
    ],
  },
  {
    id: "tertiary",
    title: "Tertiary accent",
    note: "Supporting visual language. Decorative elements, section accents, callouts, non-essential UI, charts, illustrations, diagrams, empty states, onboarding graphics, and marketing visuals.",
    entries: [
      c("dusty-rose", "dusty rose", "#DEBEC8", "extended accent", "Chart step; decorative accent."),
      c("lavender-grey", "lavender grey", "#C4C7DB", "extended accent", "Reserved decorative."),
      c("dusty-lilac", "dusty lilac", "#C5BDD5", "extended accent", "Reserved decorative."),
      c("soft-plum", "soft plum", "#867A98", "extended accent", "Reserved decorative."),
      c("champagne", "champagne", "#E5DBCF", "extended accent", "Reserved warm accent."),
      c("mist-lavender", "mist lavender", "#D0CCE1", "extended accent", "Reserved decorative."),
      c("wisteria", "wisteria", "#BEB7D5", "extended accent", "Reserved decorative."),
      c("blush-stone", "blush stone", "#E7D4D4", "extended accent", "Reserved decorative."),
      c("mauve-taupe", "mauve taupe", "#D4BCC8", "extended accent", "Reserved decorative."),
      c("rose-quartz", "rose quartz", "#F0E0E1", "extended accent", "Reserved decorative."),
    ],
  },
  {
    id: "quaternary",
    title: "Quaternary accent",
    note: "System colours used when colour itself conveys meaning: statuses, tags, alerts, categorical charts, data-viz, progress, warnings/errors/successes, priorities, and categorisation. Several reuse a secondary/tertiary primitive under a semantic label — editing the hex here edits that shared primitive.",
    entries: [
      c("cranberry", "muted cranberry", "#C86F84", "status · red", "Danger / error / needs-input tone."),
      c("soft-coral", "soft coral", "#D9958B", "status · orange", "Orange categorical / warning-adjacent tone."),
      c("pale-gold", "pale gold", "#E1D2A7", "status · amber", "Warning tone (tint grounds)."),
      c("champagne-ochre", "champagne ochre", "#DCCF9B", "status · yellow", "Yellow categorical tone."),
      c("sage", "sage", "#7EB1B2", "status · green", "Success / confirmed tone."),
      c("eucalyptus", "eucalyptus", "#518F94", "status · deep green", "Success text on light grounds (AA step)."),
      c("slate-blue", "slate blue", "#629BB5", "status · teal", "Teal categorical tone (shared with Secondary)."),
      c("glaucous", "glaucous", "#6082B6", "status · blue", "Blue categorical / info tone (shared with Secondary)."),
      c("venice-blue", "venice blue", "#16587B", "status · deep blue", "Deep-blue categorical tone (shared with Secondary)."),
      c("muted-iris", "muted iris", "#8F89B7", "status · indigo", "Indigo categorical tone (shared with Secondary)."),
      c("plum", "soft plum", "#8A7EA0", "status · purple", "Purple categorical tone."),
      c("dusty-rose", "dusty rose", "#DEBEC8", "status · pink", "Pink categorical tone (shared with Tertiary)."),
      c("steel-grey", "steel grey", "#98A1B1", "status · neutral", "Neutral / optional tone; unchecked borders; eyebrow text."),
    ],
  },
];

// ─── Frontend / code token colours ────────────────────────────────────────────
// Every colour-bearing custom property the theme ships, generated from
// packages/theme/tokens.css so the roster stays exact (see
// scripts/generate-token-colors.mjs). Grouped by role. Unlike the brand tiers
// above, the css var IS the subject here (shown, editable) and its definition /
// alias is displayed. Brand primitives are excluded — they are already editable
// in the four tiers above, and editing one there cascades to every token that
// references it.

type GenTokenColor = { cssVar: string; category: string; ref: string | null; raw: string; hex: string };

const TOKEN_CATEGORY_META: Record<string, { title: string; note: string }> = {
  "extended-primitive": {
    title: "Extended primitives",
    note: "Palette primitives beyond the four brand tiers — neutrals, hover / border greys, the darker '-deep' and brighter '-bright' interaction shades, and the loading tints. The brand primitives themselves are edited in the tiers above.",
  },
  semantic: {
    title: "Semantic roles",
    note: "The role tokens @component-core/ui components consume (background, foreground, card, primary, border, ring, …). Each aliases a primitive — edit the primitive to move every role that references it, or pin a role to its own colour here.",
  },
  sidebar: {
    title: "Sidebar & nav",
    note: "Sidebar / nav surface, text, accent, and ring roles.",
  },
  chart: {
    title: "Charts / data-viz",
    note: "The categorical chart ramp (chart-1…5).",
  },
  interaction: {
    title: "Interaction & links",
    note: "Hover backgrounds, link text, and loading-placeholder colours.",
  },
  state: {
    title: "Field states",
    note: "The doctor-app four-status field-state model (optional / needs-input / drafted / confirmed).",
  },
  tone: {
    title: "Status tones",
    note: "The operator-console status-tone set — badge tints and their glyph shades.",
  },
  "surface-alias": {
    title: "Surface & border aliases",
    note: "Utility-layer surface / border aliases apps consume via var().",
  },
};

// Category id → the generated categories it draws from (extended-primitive folds
// the raw-value primitives and the back-compat aliases into one tier).
const TOKEN_TIER_SOURCES: Record<string, string[]> = {
  "extended-primitive": ["primitive", "primitive-alias"],
  semantic: ["semantic"],
  sidebar: ["sidebar"],
  chart: ["chart"],
  interaction: ["interaction"],
  state: ["state"],
  tone: ["tone"],
  "surface-alias": ["surface-alias"],
};
const TOKEN_TIER_ORDER = ["extended-primitive", "semantic", "sidebar", "chart", "interaction", "state", "tone", "surface-alias"];

// Brand primitives are already editable in the four tiers above; exclude them so
// the token section is purely the additional frontend/code colours.
const BRAND_CSSVARS = new Set<string>();
for (const t of BRAND_TIERS) for (const e of t.entries) BRAND_CSSVARS.add(e.cssVar);

const tokenEntry = (g: GenTokenColor): ColorEntry => ({
  id: g.cssVar.replace(/^--/, ""),
  cssVar: g.cssVar,
  tokenPath: `packages/theme/tokens.css → ${g.cssVar}`,
  name: g.cssVar,
  hex: g.hex,
  category: g.category,
  usage: g.raw,
  ref: g.ref ?? undefined,
});

const TOKEN_TIERS: ColorTier[] = TOKEN_TIER_ORDER.map((catId) => {
  const sources = TOKEN_TIER_SOURCES[catId] ?? [catId];
  const entries = (TOKEN_COLORS.entries as GenTokenColor[])
    .filter((g) => sources.includes(g.category) && !BRAND_CSSVARS.has(g.cssVar))
    .map(tokenEntry);
  const meta = TOKEN_CATEGORY_META[catId] ?? { title: catId, note: "" };
  return { id: `token-${catId}`, title: meta.title, note: meta.note, kind: "token" as const, entries };
}).filter((t) => t.entries.length > 0);

const FACSIMILE_TIER: ColorTier = {
  id: "facsimile",
  title: "Facsimile (non-brand)",
    note: "The insurer-form facsimile palette — the printed paper's own colours (sheet, print ink, pen ink) used by the doctor-app review/produce facsimile. Now proper reusable tokens (@acuity/theme facsimile.tokens.json → --facsimile-*, emitted at :root), read live like every other token. Deliberately kept OUTSIDE the Caliber brand scale because they reproduce a third-party paper document, not brand identity.",
    entries: [
      f("facsimile-paper", "paper white", "#FFFFFF", "facsimile · sheet", "The insurer form's paper sheet (pure white, distinct from brand cream)."),
      f("facsimile-value", "pen ink", "#15306A", "facsimile · pen ink", "Filled-in field values (the doctor's/pen's blue ink)."),
      f("facsimile-ink", "print ink", "#1A1A1A", "facsimile · print", "The form's printed body text."),
      f("facsimile-muted", "muted print", "#555555", "facsimile · print", "Secondary printed text on the form."),
      f("facsimile-line", "rule line", "#888888", "facsimile · rules", "Printed rule / underlines on the form."),
      f("facsimile-faint", "faint print", "#999999", "facsimile · print", "Faint printed hints / fine print."),
      f("facsimile-blank", "blank field", "#BBBBBB", "facsimile · placeholder", "Empty-field placeholder marks."),
      f("facsimile-section", "section band", "#F0F0EC", "facsimile · fill", "Section-header band fill on the form."),
    ],
};

// Brand palette (curated) → frontend/code token colours (generated) → facsimile.
export const COLOR_TIERS: ColorTier[] = [...BRAND_TIERS, ...TOKEN_TIERS, FACSIMILE_TIER];

// ─── Elevation ──────────────────────────────────────────────────────────────

export type ShadowLayer = {
  offsetX: string;
  offsetY: string;
  blur: string;
  spread: string;
  color: string;
};

export type ElevationTier = {
  id: string;
  name: string;
  title: string;
  usage: string;
  /** Named tier alias (hidden from display) + the sized token it resolves to. */
  cssVar: string | null;
  tokenPath: string | null;
  layers: ShadowLayer[];
};

const L = (
  offsetY: string,
  blur: string,
  color: string,
  offsetX = "0rem",
  spread = "0rem",
): ShadowLayer => ({ offsetX, offsetY, blur, spread, color });

export const ELEVATION_TIERS: ElevationTier[] = [
  {
    id: "flat",
    name: "flat",
    title: "Flat",
    usage:
      "Border-only, no shadow. Resting dashboard cards, table containers, wells, outline status pills — content that sits IN the surface rather than on it.",
    cssVar: null,
    tokenPath: null,
    layers: [],
  },
  {
    id: "control",
    name: "control",
    title: "Control",
    usage:
      "Buttons, inputs, chips, selects — a crisp 1px drop that separates a control from its ground without floating it.",
    cssVar: "--elevation-control",
    tokenPath: "primitive.shadow.sm",
    layers: [L("0.0625rem", "0.125rem", "rgba(10, 18, 42, 0.06)")],
  },
  {
    id: "raised",
    name: "raised",
    title: "Raised",
    usage:
      "Cards that float on the canvas: the sidebar card, the console work-area card, the mobile top capsule — a soft close shadow plus a faint ambient one.",
    cssVar: "--elevation-raised",
    tokenPath: "primitive.shadow.base",
    layers: [
      L("0.0625rem", "0.125rem", "rgba(10, 18, 42, 0.04)"),
      L("0.25rem", "0.75rem", "rgba(10, 18, 42, 0.05)"),
    ],
  },
  {
    id: "raised-emphasis",
    name: "raised-emphasis",
    title: "Raised emphasis",
    usage:
      "The compact floating header when scrolled, hovered/prominent cards, toasts — one step more present than raised.",
    cssVar: "--elevation-raised-emphasis",
    tokenPath: "primitive.shadow.md",
    layers: [
      L("0.125rem", "0.25rem", "rgba(10, 18, 42, 0.05)"),
      L("0.5rem", "1rem", "rgba(10, 18, 42, 0.07)"),
    ],
  },
  {
    id: "overlay",
    name: "overlay",
    title: "Overlay",
    usage:
      "Dialogs, popovers, dropdown menus, the floating bottom tab bar, the hero figure — content layered OVER the page.",
    cssVar: "--elevation-overlay",
    tokenPath: "primitive.shadow.lg",
    layers: [
      L("0.125rem", "0.5rem", "rgba(10, 18, 42, 0.06)"),
      L("0.5rem", "1.875rem", "rgba(10, 18, 42, 0.14)"),
    ],
  },
];

/** Max shadow layers an elevation edit panel exposes (used filled, rest blank). */
export const MAX_SHADOW_LAYERS = 4;

export const EMPTY_LAYER: ShadowLayer = {
  offsetX: "",
  offsetY: "",
  blur: "",
  spread: "",
  color: "",
};

/** Compose a box-shadow string from layers (blank layers are skipped). */
export function layersToBoxShadow(layers: ShadowLayer[]): string {
  const parts = layers
    .filter((l) => l.color && (l.offsetY || l.blur || l.spread || l.offsetX))
    .map(
      (l) =>
        `${l.offsetX || "0"} ${l.offsetY || "0"} ${l.blur || "0"} ${l.spread || "0"} ${l.color}`,
    );
  return parts.join(", ");
}

// ─── Typography ─────────────────────────────────────────────────────────────

export type FontFamilyDef = {
  id: string;
  cssVar: string;
  tokenPath: string;
  label: string;
  /** The ordered font stack (first entry is the primary face). */
  stack: string[];
  script: "latin" | "cjk" | "mono";
  role: string;
};

export const FONT_FAMILIES: FontFamilyDef[] = [
  {
    id: "title",
    cssVar: "--font-family-title",
    tokenPath: "primitive.font.family.title",
    label: "Title (Latin)",
    stack: ["Fraunces", "Georgia", "Times New Roman", "serif"],
    script: "latin",
    role: "Titles / headings, the wordmark. Weight 600. Optional italic on the largest display headings.",
  },
  {
    id: "body",
    cssVar: "--font-family-sans",
    tokenPath: "primitive.font.family.sans",
    label: "Body (Latin)",
    stack: ["-apple-system", "BlinkMacSystemFont", "Segoe UI", "Roboto", "Helvetica Neue", "Arial", "sans-serif"],
    script: "latin",
    role: "Body text, UI labels, buttons.",
  },
  {
    id: "mono",
    cssVar: "--font-family-mono",
    tokenPath: "primitive.font.family.mono",
    label: "Mono",
    stack: ["IBM Plex Mono", "ui-monospace", "monospace"],
    script: "mono",
    role: "Only section numbers, uppercase tags/statuses, and DO/DON'T eyebrows — never body.",
  },
  {
    id: "title-tc",
    cssVar: "--font-family-title-tc",
    tokenPath: "primitive.font.family.title-tc",
    label: "Title (Chinese)",
    stack: ["Noto Serif TC", "serif"],
    script: "cjk",
    role: "Chinese titles / headings, equal weight to the Latin title.",
  },
  {
    id: "body-tc",
    cssVar: "--font-family-body-tc",
    tokenPath: "primitive.font.family.body-tc",
    label: "Body (Chinese)",
    stack: ["Noto Sans TC", "PingFang TC", "system-ui", "sans-serif"],
    script: "cjk",
    role: "Chinese body text.",
  },
];

export const FONT_WEIGHTS = [
  { id: "regular", value: 400, label: "Regular (400)", usage: "Body copy, captions." },
  { id: "medium", value: 500, label: "Medium (500)", usage: "UI labels, buttons, emphasised body, eyebrows." },
  { id: "semibold", value: 600, label: "Semibold (600)", usage: "All titles / headings." },
];

export type TypeRole = {
  id: string;
  label: string;
  /** Which family this role is set in. */
  family: "title" | "body" | "mono";
  sizePx: number;
  rem: string;
  lineHeight: string;
  weight: number;
  letterSpacing: string;
  wordSpacing: string;
  textTransform: "none" | "uppercase";
  fontStyle: "normal" | "italic";
  /** Variable-font axis settings (Fraunces exposes opsz/wght/SOFT/WONK). */
  variationSettings: string;
  /** OpenType features (ligatures, tabular numerals, …). */
  featureSettings: string;
  role: string;
  sample: string;
  tokenName: string;
};

const SAMPLE = "Acuity — clarity in clinical practice";
const SAMPLE_EYEBROW = "01 · MISSING · LINKED";

// Non-token editor metadata per role: labels, samples, and the editable
// defaults that are NOT design tokens (transform, style, features). The
// token-derived values (size / line-height / weight / tracking / family) come
// from the generated snapshot below.
const TYPE_META: Record<string, { label: string; role: string; sample: string; tokenName: string; textTransform: TypeRole["textTransform"] }> = {
  display: { label: "Display", role: "Hero display headline; optional italic.", sample: SAMPLE, tokenName: "--type-display", textTransform: "none" },
  h1: { label: "Heading 1", role: "Page H1.", sample: SAMPLE, tokenName: "--type-h1", textTransform: "none" },
  h2: { label: "Heading 2", role: "Section H2.", sample: SAMPLE, tokenName: "--type-h2", textTransform: "none" },
  h3: { label: "Heading 3", role: "Subsection H3.", sample: SAMPLE, tokenName: "--type-h3", textTransform: "none" },
  "body-lg": { label: "Body large", role: "Lead paragraph, intro copy.", sample: SAMPLE, tokenName: "--type-body-lg", textTransform: "none" },
  body: { label: "Body", role: "Default body copy.", sample: SAMPLE, tokenName: "--type-body", textTransform: "none" },
  small: { label: "Small", role: "Secondary text, helper copy.", sample: SAMPLE, tokenName: "--type-small", textTransform: "none" },
  caption: { label: "Caption", role: "Captions, fine print, metadata.", sample: SAMPLE, tokenName: "--type-caption", textTransform: "none" },
  eyebrow: { label: "Eyebrow", role: "Uppercase mono eyebrows / tags / section numbers.", sample: SAMPLE_EYEBROW, tokenName: "--type-eyebrow", textTransform: "uppercase" },
};

// Built from the generated token snapshot (size / line-height / weight /
// tracking / family are token-derived; refresh with `pnpm generate`)
// merged with the static editor metadata above.
export const TYPE_ROLES: TypeRole[] = GENERATED_TYPE.roles.map((g) => {
  const meta = TYPE_META[g.id] ?? { label: g.id, role: "", sample: SAMPLE, tokenName: `--type-${g.id}`, textTransform: "none" as const };
  return {
    id: g.id,
    label: meta.label,
    family: g.family as TypeRole["family"],
    sizePx: g.sizePx,
    rem: g.rem,
    lineHeight: g.lineHeight,
    weight: g.weight,
    letterSpacing: g.letterSpacing,
    wordSpacing: "normal",
    textTransform: meta.textTransform,
    fontStyle: "normal",
    variationSettings: "normal",
    featureSettings: "normal",
    role: meta.role,
    sample: meta.sample,
    tokenName: meta.tokenName,
  };
});

// A curated set of free/open Google Fonts for the family picker, grouped so the
// picker can preview each in its own face. "Any Google Font" load-by-name is
// also supported by the Fonts page. Chosen to span the brand's register
// (editorial serifs, humanist/grotesque sans, monospace, CJK).
export type FontOption = { family: string; category: "serif" | "sans" | "mono" | "display" | "cjk"; variable?: boolean };

export const FONT_LIBRARY: FontOption[] = [
  // Serif (title candidates)
  { family: "Fraunces", category: "serif", variable: true },
  { family: "Newsreader", category: "serif", variable: true },
  { family: "Source Serif 4", category: "serif", variable: true },
  { family: "Lora", category: "serif", variable: true },
  { family: "Spectral", category: "serif" },
  { family: "Libre Baskerville", category: "serif" },
  { family: "Playfair Display", category: "serif", variable: true },
  { family: "Cormorant", category: "serif", variable: true },
  { family: "EB Garamond", category: "serif", variable: true },
  { family: "Bitter", category: "serif", variable: true },
  { family: "Crimson Pro", category: "serif", variable: true },
  { family: "Zilla Slab", category: "serif" },
  // Sans (body candidates)
  { family: "Inter", category: "sans", variable: true },
  { family: "Work Sans", category: "sans", variable: true },
  { family: "Source Sans 3", category: "sans", variable: true },
  { family: "IBM Plex Sans", category: "sans" },
  { family: "Manrope", category: "sans", variable: true },
  { family: "DM Sans", category: "sans", variable: true },
  { family: "Public Sans", category: "sans", variable: true },
  { family: "Figtree", category: "sans", variable: true },
  { family: "Plus Jakarta Sans", category: "sans", variable: true },
  { family: "Nunito Sans", category: "sans", variable: true },
  { family: "Karla", category: "sans", variable: true },
  { family: "Albert Sans", category: "sans", variable: true },
  { family: "Instrument Sans", category: "sans", variable: true },
  // Display
  { family: "Bricolage Grotesque", category: "display", variable: true },
  { family: "Unbounded", category: "display", variable: true },
  // Mono
  { family: "IBM Plex Mono", category: "mono" },
  { family: "JetBrains Mono", category: "mono", variable: true },
  { family: "Space Mono", category: "mono" },
  { family: "Fragment Mono", category: "mono" },
  { family: "Geist Mono", category: "mono", variable: true },
  { family: "Martian Mono", category: "mono", variable: true },
  // CJK
  { family: "Noto Serif TC", category: "cjk" },
  { family: "Noto Sans TC", category: "cjk" },
  { family: "LXGW WenKai TC", category: "cjk" },
];

// Variable-font axis presets so the "compression / spacing" panel offers real
// axes for the faces that expose them (used to hint font-variation-settings).
export const VARIABLE_AXES: Record<string, { tag: string; label: string; min: number; max: number; default: number }[]> = {
  Fraunces: [
    { tag: "opsz", label: "Optical size", min: 9, max: 144, default: 144 },
    { tag: "wght", label: "Weight", min: 100, max: 900, default: 600 },
    { tag: "SOFT", label: "Softness", min: 0, max: 100, default: 0 },
    { tag: "WONK", label: "Wonk", min: 0, max: 1, default: 0 },
  ],
};

// ─── Radius foundations ──────────────────────────────────────────────────────
// The shared radius scale. Editing one propagates to every surface that
// references it (via var(--radius-*)), read live from the stylesheet.

export type RadiusToken = {
  id: string;
  cssVar: string;
  tokenPath: string;
  name: string;
  value: string;
  usage: string;
};

// Values are the component-core token values verbatim (rem — the standardised
// unit; 1rem = 16px). The live read shows exactly what the deployed stylesheet
// resolves, unconverted. px equivalents are noted in usage for reference only.
export const RADIUS_TOKENS: RadiusToken[] = [
  { id: "sm", cssVar: "--radius-sm", tokenPath: "semantic.radius.sm", name: "sm", value: "0.5rem", usage: "Dense controls — chips, tags, inline fields (8px)." },
  { id: "md", cssVar: "--radius-md", tokenPath: "semantic.radius.md", name: "md", value: "0.625rem", usage: "Buttons, inputs, small cards, wells, badges (10px)." },
  { id: "lg", cssVar: "--radius-lg", tokenPath: "semantic.radius.lg", name: "lg", value: "1rem", usage: "Cards, panels, sidebar, dialogs, popovers (16px)." },
];

// ─── Surface / element display styles ────────────────────────────────────────
// Each archetype is a composite bundle of tokenised style properties. Demos
// render the bundle inline (referencing var(--…) tokens, so foundation edits
// propagate live), and every property is editable. Values audited from the real
// @component-core/ui + acuity components; a property left blank is not set.

export type SurfaceProp =
  | "background"
  | "color"
  | "borderWidth"
  | "borderColor"
  | "borderStyle"
  | "radius"
  | "shadow"
  | "padding";

export type Surface = {
  id: string;
  name: string;
  /** How the live demo renders. */
  demo: "card" | "sidebar" | "nav" | "button" | "input" | "chip" | "badge" | "pill" | "dot" | "row" | "banner" | "overlay";
  usage: string;
  /** Resting style bundle — CSS value strings (token refs where they use a token). */
  style: Partial<Record<SurfaceProp, string>>;
  /** Human note on interactive states (display only). */
  states?: string;
};

export type SurfaceGroup = { id: string; title: string; note?: string; surfaces: Surface[] };

// Ordered property list for the edit panel (used filled, unset blank).
export const SURFACE_PROPS: { key: SurfaceProp; label: string; desc: string; accepts: string; kind: "color" | "combo"; options: string[] }[] = [
  { key: "background", label: "Background", desc: "Surface fill.", accepts: "a colour token or any CSS colour; 'transparent'", kind: "color", options: ["transparent", "var(--caliber-cream)", "var(--caliber-cream-contrast)", "var(--caliber-navy)", "var(--caliber-glaucous)", "var(--caliber-cranberry)", "var(--caliber-sage)"] },
  { key: "color", label: "Text colour", desc: "Foreground / label colour (buttons, banners).", accepts: "a colour token or any CSS colour", kind: "color", options: ["var(--caliber-ink)", "var(--caliber-cream)", "var(--caliber-navy)", "var(--caliber-ink-muted)"] },
  { key: "borderWidth", label: "Border width", desc: "Hairline thickness; 0 for none.", accepts: "a CSS length, e.g. 0 / 1px / 2px", kind: "combo", options: ["0", "1px", "2px"] },
  { key: "borderColor", label: "Border colour", desc: "Hairline colour.", accepts: "a colour token or any CSS colour", kind: "color", options: ["var(--caliber-border)", "var(--caliber-border-strong)", "transparent", "color-mix(in srgb, var(--caliber-ink) 10%, transparent)"] },
  { key: "borderStyle", label: "Border style", desc: "Line style of the border.", accepts: "none / solid / dashed / dotted", kind: "combo", options: ["none", "solid", "dashed", "dotted"] },
  { key: "radius", label: "Corner radius", desc: "Border-radius. A --radius-* token tracks the shared scale; a literal pins this surface only.", accepts: "a --radius-* token or any CSS length (rem is the house unit); 999px = pill", kind: "combo", options: ["0", "var(--radius-sm)", "var(--radius-md)", "var(--radius-lg)", "0.375rem", "0.75rem", "999px"] },
  { key: "shadow", label: "Shadow / elevation", desc: "Box-shadow, usually an --elevation-* tier; 'none' = flat.", accepts: "an --elevation-* token, 'none', or any CSS box-shadow", kind: "combo", options: ["none", "var(--elevation-control)", "var(--elevation-raised)", "var(--elevation-raised-emphasis)", "var(--elevation-overlay)"] },
  { key: "padding", label: "Padding", desc: "Internal padding of the surface.", accepts: "any CSS padding shorthand", kind: "combo", options: ["0", "0.25rem 0.625rem", "0.5rem 0.75rem", "1rem", "1.5rem", "3rem"] },
];

const NAVY = "var(--caliber-navy)";
const CREAM = "var(--caliber-cream)";
const CONTRAST = "var(--caliber-cream-contrast)";
const BORDER = "var(--caliber-border)";
const INK = "var(--caliber-ink)";

export const SURFACE_GROUPS: SurfaceGroup[] = [
  {
    id: "cards",
    title: "Cards & surfaces",
    note: "Every distinct surface treatment. Soft elevation is selective — most surfaces are flat (hairline + spacing define them); only discrete top-level objects and overlays lift.",
    surfaces: [
      { id: "page-canvas", name: "Page canvas", demo: "card", usage: "The work-area / page ground the whole shell sits on. Flat, no border.", style: { background: CREAM, color: INK, borderWidth: "0", borderStyle: "none", radius: "0", shadow: "none", padding: "1.5rem" } },
      { id: "sidebar", name: "Sidebar", demo: "sidebar", usage: "The nav rail — raised and BORDERLESS; the soft shadow alone defines its edge (a hairline read as a stray divider).", style: { background: CREAM, borderWidth: "0", borderStyle: "none", radius: "var(--radius-lg)", shadow: "var(--elevation-raised)", padding: "0.75rem" }, states: "Cream ground, never a darker contrast tone." },
      { id: "flat-card", name: "Flat card", demo: "card", usage: "Resting dashboard cards, table containers, dense tiles — content IN the surface. Hairline, no shadow.", style: { background: CREAM, borderWidth: "1px", borderColor: BORDER, borderStyle: "solid", radius: "var(--radius-lg)", shadow: "none", padding: "1.5rem" } },
      { id: "raised-card", name: "Raised (soft) card", demo: "card", usage: "A top-level content card alone on the canvas, the auth card, a small set (2–4) of summary/metric cards. One soft lift.", style: { background: CREAM, borderWidth: "1px", borderColor: BORDER, borderStyle: "solid", radius: "var(--radius-lg)", shadow: "var(--elevation-raised)", padding: "1.5rem" } },
      { id: "raised-emphasis-card", name: "Raised emphasis", demo: "card", usage: "The compact floating header when scrolled, toasts, a hovered/prominent card — one step more present.", style: { background: CREAM, borderWidth: "1px", borderColor: BORDER, borderStyle: "solid", radius: "var(--radius-md)", shadow: "var(--elevation-raised-emphasis)", padding: "1rem" } },
      { id: "overlay-popover", name: "Popover / dropdown", demo: "overlay", usage: "Popovers, dropdown menus — layered over the page.", style: { background: CREAM, borderWidth: "1px", borderColor: "color-mix(in srgb, var(--caliber-ink) 10%, transparent)", borderStyle: "solid", radius: "var(--radius-lg)", shadow: "var(--elevation-raised-emphasis)", padding: "0.5rem" } },
      { id: "overlay-modal", name: "Dialog / modal", demo: "overlay", usage: "Modal dialogs — a dimmed+blurred backdrop carries the lift, so the panel itself has no shadow.", style: { background: CREAM, borderWidth: "1px", borderColor: "color-mix(in srgb, var(--caliber-ink) 10%, transparent)", borderStyle: "solid", radius: "var(--radius-lg)", shadow: "none", padding: "1.5rem" } },
      { id: "overlay-sheet", name: "Sheet / submenu", demo: "overlay", usage: "Side sheets and nested submenus — the most present overlay tier.", style: { background: CREAM, borderWidth: "1px", borderColor: BORDER, borderStyle: "solid", radius: "var(--radius-lg)", shadow: "var(--elevation-overlay)", padding: "1rem" } },
      { id: "well", name: "Well / inset", demo: "card", usage: "Recessed wells and insets WITHIN content (inline data blocks). Contrast ground, hairline, flat.", style: { background: CONTRAST, borderWidth: "1px", borderColor: BORDER, borderStyle: "solid", radius: "var(--radius-md)", shadow: "none", padding: "1rem" } },
      { id: "navy-banner", name: "Navy banner / inset", demo: "banner", usage: "Coloured emphasis banner rendered as a contained wide inset card — navy ground, cream text.", style: { background: NAVY, color: CREAM, borderWidth: "0", borderStyle: "none", radius: "var(--radius-md)", shadow: "none", padding: "1.5rem" } },
    ],
  },
  {
    id: "buttons",
    title: "Buttons",
    note: "Shared: --radius-lg corners, a 1px transparent border, h-8 / px-2.5, medium weight, NO shadow (buttons never lift), navy focus ring. Hover changes background colour only (no geometry change).",
    surfaces: [
      { id: "btn-primary", name: "Primary", demo: "button", usage: "The primary action.", style: { background: NAVY, color: CREAM, borderWidth: "1px", borderColor: "transparent", borderStyle: "solid", radius: "var(--radius-lg)", shadow: "none", padding: "0.375rem 0.625rem" }, states: "Hover → var(--caliber-navy-bright)." },
      { id: "btn-secondary", name: "Secondary", demo: "button", usage: "Secondary CTA.", style: { background: "var(--caliber-glaucous)", color: INK, borderWidth: "1px", borderColor: "transparent", borderStyle: "solid", radius: "var(--radius-lg)", shadow: "none", padding: "0.375rem 0.625rem" }, states: "Hover → var(--caliber-venice-blue)." },
      { id: "btn-destructive", name: "Destructive", demo: "button", usage: "Destructive action.", style: { background: "var(--caliber-cranberry)", color: CREAM, borderWidth: "1px", borderColor: "transparent", borderStyle: "solid", radius: "var(--radius-lg)", shadow: "none", padding: "0.375rem 0.625rem" }, states: "Hover → var(--caliber-cranberry-deep)." },
      { id: "btn-outline", name: "Outline", demo: "button", usage: "Low-emphasis bordered action.", style: { background: CREAM, color: INK, borderWidth: "1px", borderColor: BORDER, borderStyle: "solid", radius: "var(--radius-lg)", shadow: "none", padding: "0.375rem 0.625rem" }, states: "Hover → var(--caliber-cream-contrast)." },
      { id: "btn-ghost", name: "Ghost", demo: "button", usage: "Chromeless action (toolbar, row action).", style: { background: "transparent", color: INK, borderWidth: "1px", borderColor: "transparent", borderStyle: "solid", radius: "var(--radius-lg)", shadow: "none", padding: "0.375rem 0.625rem" }, states: "Hover → var(--caliber-cream-contrast)." },
      { id: "btn-link", name: "Link", demo: "button", usage: "Inline text action.", style: { background: "transparent", color: NAVY, borderWidth: "0", borderStyle: "none", radius: "var(--radius-lg)", shadow: "none", padding: "0.375rem 0.25rem" }, states: "Hover → underline." },
      { id: "btn-success", name: "Success", demo: "button", usage: "The success-loading state a primary action transitions into on a successful submit.", style: { background: "var(--caliber-sage)", color: INK, borderWidth: "1px", borderColor: "transparent", borderStyle: "solid", radius: "var(--radius-lg)", shadow: "none", padding: "0.375rem 0.625rem" } },
    ],
  },
  {
    id: "controls",
    title: "Controls & elements",
    note: "Small interactive elements. All flat — defined by hairline, tint, and shape.",
    surfaces: [
      { id: "input", name: "Input / select / textarea", demo: "input", usage: "Text fields, selects, textareas. Transparent fill, hairline, --radius-lg, flat; navy focus ring.", style: { background: "transparent", color: INK, borderWidth: "1px", borderColor: BORDER, borderStyle: "solid", radius: "var(--radius-lg)", shadow: "none", padding: "0.25rem 0.625rem" }, states: "Focus → border var(--caliber-navy) + navy ring." },
      { id: "chip", name: "Chip / tag", demo: "chip", usage: "Removable filter chips / tags.", style: { background: CONTRAST, color: INK, borderWidth: "1px", borderColor: BORDER, borderStyle: "solid", radius: "var(--radius-sm)", shadow: "none", padding: "0.125rem 0.5rem" } },
      { id: "badge-tint", name: "Status badge (tint)", demo: "badge", usage: "Status badge — a tone-tinted ground + ink label. Colour never carries meaning alone (paired with a glyph/label).", style: { background: "color-mix(in srgb, var(--caliber-sage) 22%, transparent)", color: INK, borderWidth: "0", borderStyle: "none", radius: "var(--radius-md)", shadow: "none", padding: "0.125rem 0.5rem" } },
      { id: "badge-pill", name: "Status pill (outline)", demo: "pill", usage: "Outline status pill — cream ground, hairline, leading tone dot, ink label.", style: { background: CREAM, color: INK, borderWidth: "1px", borderColor: BORDER, borderStyle: "solid", radius: "999px", shadow: "none", padding: "0.125rem 0.5rem" } },
      { id: "status-dot", name: "Status dot", demo: "dot", usage: "Field-state dot paired with an ink label (confirmed / drafted / needs-input / optional).", style: { background: "var(--caliber-sage)", borderWidth: "0", borderStyle: "none", radius: "999px" } },
      { id: "nav-item", name: "Sidebar nav item", demo: "nav", usage: "A rail nav row. Transparent at rest; hover wash; active = sky-blue tint + navy text. No shadow, no geometry change.", style: { background: "transparent", color: INK, borderWidth: "0", borderStyle: "none", radius: "0.375rem", shadow: "none", padding: "0.5rem 0.75rem" }, states: "Hover → var(--caliber-hover); active → color-mix(sky-blue 50%) + navy text." },
      { id: "table-row", name: "Table / list row", demo: "row", usage: "A data row. Flat, hairline bottom rule, no resting wash; selected = contrast fill.", style: { background: "transparent", color: INK, borderWidth: "0 0 1px 0", borderColor: BORDER, borderStyle: "solid", radius: "0", shadow: "none", padding: "0.625rem 0.75rem" }, states: "Selected → var(--caliber-cream-contrast); interactive rows → hover var(--caliber-hover)." },
    ],
  },
];
