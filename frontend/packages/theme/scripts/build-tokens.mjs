/**
 * Theme build: generates tokens.css from the vendored canonical preset
 * (presets/caliber-light.tokens.json, a snapshot of the acuity-dev canonical
 * source at docs/design/system/tokens/presets/caliber-light.tokens.json).
 *
 * tokens.css is a DERIVED file - never hand-edit it. To change a value, edit
 * the canonical preset in acuity-dev, refresh the snapshot here, and rerun
 * `pnpm generate`. verify-tokens.mjs gates drift (committed output must match
 * a fresh build byte-for-byte).
 *
 * Emission contract:
 *   - every caliber primitive is emitted as --caliber-<canonical-name> with the
 *     verbatim JSON value (canonical names: sky-blue, eucalyptus, ...);
 *   - semantic color roles are emitted as var() references to their aliased
 *     primitive - never restated literals - so the alias graph is auditable in
 *     the CSS itself;
 *   - the interaction/link/loading roles are additionally emitted under the
 *     --color-* names the @component-core/ui components consume;
 *   - the .dark block is a static mirror of the design-kit neutral dark tokens
 *     (semantic.dark.tokens.json): Caliber is light-only for Phase 1, so a
 *     .dark toggle degrades to the shared neutral dark palette coherently.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const preset = JSON.parse(
  await readFile(resolve(root, 'presets/caliber-light.tokens.json'), 'utf8'),
);

const caliber = preset.primitive.color.caliber;
const semantic = preset.semantic.color;

// Non-brand facsimile palette (separate token layer, not part of the caliber
// brand snapshot). Reproduces the insurer's printed paper form.
const facsimileTokens = JSON.parse(
  await readFile(resolve(root, 'facsimile.tokens.json'), 'utf8'),
).facsimile;

/** {color.caliber.x} -> var(--caliber-x); throws on a dangling alias. */
function semanticRef(role) {
  const value = semantic[role]?.$value;
  const m = typeof value === 'string' && value.match(/^\{color\.caliber\.([a-z-]+)\}$/);
  if (!m) throw new Error(`semantic role "${role}" missing or not a caliber alias: ${value}`);
  if (!caliber[m[1]]) throw new Error(`semantic role "${role}" aliases undefined primitive "${m[1]}"`);
  return `var(--caliber-${m[1]})`;
}

/** Font-family array -> CSS list (names with spaces quoted). */
function fontList(path) {
  return path.$value
    .map((f) => (f.includes(' ') ? `"${f}"` : f))
    .join(', ');
}

/** DTCG shadow object (or layered array) -> CSS box-shadow. */
function shadow(name) {
  const v = preset.primitive.shadow[name].$value;
  const layers = Array.isArray(v) ? v : [v];
  return layers
    .map((s) => `${s.offsetX} ${s.offsetY} ${s.blur} ${s.spread} ${s.color}`)
    .join(', ');
}

const duration = (name) => preset.primitive.duration[name].$value;
const dim = (path) =>
  path.split('.').reduce((n, k) => n[k], preset.primitive.dimension).$value;

const lines = [];
const emit = (s = '') => lines.push(s);

emit('/*');
emit(' * Acuity caliber-light theme overlay. GENERATED - do not hand-edit.');
emit(' *');
emit(' * Built by scripts/build-tokens.mjs from presets/caliber-light.tokens.json');
emit(' * (a snapshot of the canonical acuity-dev preset). Redefines the semantic-');
emit(' * tier CSS custom properties that @component-core/ui components consume;');
emit(' * import order is load-bearing: base tokens.css first, then this file.');
emit(' *');
emit(' * This is the source of the private @component-core/acuity package. The');
emit(' * monorepo consumes it via workspace:*; a split-out repo installs the');
emit(' * published package at a pinned semver.');
emit(' */');
emit();
emit(':root {');
emit('  /* --- Caliber primitive palette (canonical names, verbatim values) --- */');
for (const [name, tok] of Object.entries(caliber)) {
  if (name.startsWith('$')) continue;
  emit(`  --caliber-${name}: ${tok.$value};`);
}
emit();
emit('  /* --- Semantic color roles (override @component-core/ui base) --- */');
const SHADCN_ROLES = [
  'background', 'foreground', 'card', 'card-foreground', 'popover',
  'popover-foreground', 'primary', 'primary-foreground', 'secondary',
  'secondary-foreground', 'muted', 'muted-foreground', 'accent',
  'accent-foreground', 'destructive', 'destructive-foreground', 'success',
  'success-foreground', 'warning', 'warning-foreground', 'info',
  'info-foreground', 'border', 'input', 'ring',
];
for (const role of SHADCN_ROLES) emit(`  --${role}: ${semanticRef(role)};`);
emit();
emit('  /* sidebar / nav */');
for (const role of Object.keys(semantic).filter((r) => r.startsWith('sidebar'))) {
  emit(`  --${role}: ${semanticRef(role)};`);
}
emit();
emit('  /* charts */');
for (const role of Object.keys(semantic).filter((r) => r.startsWith('chart-'))) {
  emit(`  --${role}: ${semanticRef(role)};`);
}
emit();
emit('  /* interaction / hover + link + loading (@component-core/ui --color-* names) */');
const INTERACTION_ROLES = [
  'action-bg-hover', 'destructive-bg-hover', 'secondary-bg-hover',
  'link-text', 'link-text-hover', 'loading-placeholder',
  'loading-placeholder-shimmer',
];
for (const role of INTERACTION_ROLES) emit(`  --color-${role}: ${semanticRef(role)};`);
emit('  --link-text: var(--color-link-text);');
emit('  --link-text-hover: var(--color-link-text-hover);');
emit();
emit('  /* Acuity delta: doctor-app four-status field-state model */');
for (const role of Object.keys(semantic).filter((r) => r.startsWith('state-'))) {
  emit(`  --${role}: ${semanticRef(role)};`);
}
emit();
emit('  /* Acuity delta: operator-console status-tone set (badge tints + glyphs) */');
for (const role of Object.keys(semantic).filter((r) => r.startsWith('tone-'))) {
  emit(`  --${role}: ${semanticRef(role)};`);
  emit(`  --color-${role}: var(--${role});`);
}
emit();
emit('  /* Surface + border aliases (utility-layer names apps consume via var()) */');
emit('  --color-surface: var(--caliber-cream);');
emit('  --color-surface-contrast: var(--caliber-cream-contrast);');
emit('  --color-border-strong: var(--caliber-border-strong);');
emit();
emit('  /* --- Insurer-form facsimile palette (NON-BRAND): reproduces the printed');
emit('     insurer paper form (sheet, print ink, pen ink). A reusable token layer');
emit('     deliberately outside the Caliber brand scale. --- */');
for (const [name, tok] of Object.entries(facsimileTokens)) {
  if (name.startsWith('$')) continue;
  emit(`  --facsimile-${name}: ${tok.$value};`);
}
emit();
emit('  /* --- Radius: Caliber boxed-canvas scale (8 / 10 / 16) --- */');
emit(`  --dimension-radius-base: ${dim('radius.base')};`);
emit(`  --radius-sm: ${dim('radius.sm')};`);
emit(`  --radius-md: ${dim('radius.md')};`);
emit(`  --radius-lg: ${dim('radius.lg')};`);
emit();
emit('  /* --- Elevation tiers: FLAT (border only) / CONTROL (sm) / RAISED');
emit('     (base, md emphasis) / OVERLAY (lg). Navy-tinted soft shadows. --- */');
for (const name of ['sm', 'base', 'md', 'lg']) emit(`  --shadow-${name}: ${shadow(name)};`);
for (const name of ['sm', 'base', 'md', 'lg']) emit(`  --elevation-${name}: ${shadow(name)};`);
emit('  /* Named tier aliases (consume by role, not size) */');
emit('  --elevation-control: var(--shadow-sm);');
emit('  --elevation-raised: var(--shadow-base);');
emit('  --elevation-raised-emphasis: var(--shadow-md);');
emit('  --elevation-overlay: var(--shadow-lg);');
emit();
emit('  /* --- Motion: Caliber timing --- */');
for (const name of ['fast', 'base', 'slow']) emit(`  --duration-${name}: ${duration(name)};`);
for (const name of ['fast', 'base', 'slow']) emit(`  --motion-${name}: ${duration(name)};`);
emit('  --motion: var(--duration-fast); /* bare alias some call sites consume */');
emit();
emit('  /* --- Typography: Fraunces titles, system sans body, IBM Plex Mono --- */');
const families = preset.primitive.font.family;
for (const name of ['sans', 'mono', 'title', 'title-tc', 'body-tc']) {
  emit(`  --font-family-${name}: ${fontList(families[name])};`);
}
for (const name of ['sans', 'mono', 'title']) {
  emit(`  --typography-font-${name}: ${fontList(families[name])};`);
}
emit();
emit('  /* --- Layout sizes (Caliber container + rail) --- */');
emit(`  --container-max: ${dim('container.max')};`);
emit(`  --container-wide: ${dim('container.wide')};`);
emit(`  --dimension-container-max: ${dim('container.max')};`);
emit(`  --dimension-container-wide: ${dim('container.wide')};`);
emit(`  --sidebar-width: ${dim('size.sidebar')};`);
emit(`  --dimension-size-sidebar: ${dim('size.sidebar')};`);
emit('}');
emit();
emit('/*');
emit(' * Dark mode: Caliber is light-only for Phase 1. This mirrors the shared');
emit(' * neutral dark tokens (design-kit semantic.dark.tokens.json, resolved from');
emit(' * the OKLCH neutral ramp) so a .dark toggle degrades coherently rather than');
emit(' * showing a broken palette.');
emit(' */');
emit('.dark {');
const DARK = {
  background: 'oklch(0.145 0 0)', foreground: 'oklch(0.985 0 0)',
  card: 'oklch(0.205 0 0)', 'card-foreground': 'oklch(0.985 0 0)',
  popover: 'oklch(0.205 0 0)', 'popover-foreground': 'oklch(0.985 0 0)',
  primary: 'oklch(0.922 0 0)', 'primary-foreground': 'oklch(0.205 0 0)',
  secondary: 'oklch(0.269 0 0)', 'secondary-foreground': 'oklch(0.985 0 0)',
  muted: 'oklch(0.269 0 0)', 'muted-foreground': 'oklch(0.708 0 0)',
  accent: 'oklch(0.269 0 0)', 'accent-foreground': 'oklch(0.985 0 0)',
  destructive: 'oklch(0.704 0.191 22.216)', 'destructive-foreground': 'oklch(0.985 0 0)',
  success: 'oklch(0.723 0.219 149.579)', 'success-foreground': 'oklch(0.145 0 0)',
  warning: 'oklch(0.769 0.188 70.08)', 'warning-foreground': 'oklch(0.145 0 0)',
  info: 'oklch(0.623 0.214 259.815)', 'info-foreground': 'oklch(0.145 0 0)',
  border: 'oklch(0.269 0 0)', input: 'oklch(0.269 0 0)', ring: 'oklch(0.556 0 0)',
  sidebar: 'oklch(0.205 0 0)', 'sidebar-foreground': 'oklch(0.985 0 0)',
  'sidebar-primary': 'oklch(0.922 0 0)', 'sidebar-primary-foreground': 'oklch(0.205 0 0)',
  'sidebar-accent': 'oklch(0.269 0 0)', 'sidebar-accent-foreground': 'oklch(0.985 0 0)',
  'sidebar-border': 'oklch(0.269 0 0)', 'sidebar-ring': 'oklch(0.556 0 0)',
  'chart-1': 'oklch(0.87 0 0)', 'chart-2': 'oklch(0.556 0 0)',
  'chart-3': 'oklch(0.439 0 0)', 'chart-4': 'oklch(0.371 0 0)',
  'chart-5': 'oklch(0.269 0 0)',
};
for (const [role, value] of Object.entries(DARK)) emit(`  --${role}: ${value};`);
emit('}');
emit();

await writeFile(resolve(root, 'tokens.css'), lines.join('\n'), 'utf8');
console.log(`tokens.css written (${lines.length} lines)`);
