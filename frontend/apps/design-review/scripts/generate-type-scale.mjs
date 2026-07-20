/**
 * Generates src/app/_lib/type-scale.generated.json from the acuity-dev canonical
 * design-system tokens (the single source of truth for the type scale, which is
 * NOT carried in the frontend's caliber preset — it is house-general and lives
 * only in docs/design/system/tokens/{primitive,semantic}.tokens.json).
 *
 * The type scale is not exposed as runtime CSS vars by the frontend, so the
 * design-review cannot live-read it. Instead this generate step resolves the
 * semantic typography roles → primitive font values and commits the snapshot,
 * matching how packages/theme vendors the caliber preset. Refresh with
 * `pnpm generate`; the committed JSON is what the app imports (no
 * runtime cross-repo dependency).
 *
 * Source dir override: ACUITY_DEV_TOKENS_DIR (defaults to the sibling checkout).
 */
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const tokensDir =
  process.env.ACUITY_DEV_TOKENS_DIR ??
  resolve(scriptDir, "../../../../../acuity-dev/docs/design/system/tokens");

let primitive, semantic;
try {
  primitive = JSON.parse(await readFile(resolve(tokensDir, "primitive.tokens.json"), "utf8"));
  semantic = JSON.parse(await readFile(resolve(tokensDir, "semantic.tokens.json"), "utf8"));
} catch (err) {
  // Source not reachable (e.g. CI without the acuity-dev checkout). Keep the
  // committed snapshot rather than failing the build.
  console.warn(`[generate-type-scale] canonical tokens not found at ${tokensDir} — keeping committed snapshot. (${err.code ?? err.message})`);
  process.exit(0);
}

/** Resolve a DTCG alias like "{font.size.6xl}" against the primitive tier. */
function deref(ref) {
  const path = ref.replace(/[{}]/g, "").split(".");
  let node = primitive;
  for (const k of path) node = node?.[k];
  return node?.$value;
}

// Map a family alias ({font.family.title|sans|mono}) to the editor's slot.
const FAMILY_SLOT = { title: "title", sans: "body", mono: "mono", "title-tc": "title", "body-tc": "body" };

// The nine named roles, in display order.
const ROLES = ["display", "h1", "h2", "h3", "body-lg", "body", "small", "caption", "eyebrow"];

const out = ROLES.map((id) => {
  const role = semantic.type[id];
  if (!role) throw new Error(`semantic.type.${id} missing`);
  const rem = deref(role.size.$value); // e.g. "3.815rem"
  const lh = deref(role["line-height"].$value); // e.g. 1.05
  const weight = deref(role.weight.$value); // e.g. 600
  const ls = deref(role["letter-spacing"].$value); // e.g. -0.015 (em)
  const famAlias = role.family.$value.replace(/[{}]/g, "").split(".").pop(); // title|sans|mono
  return {
    id,
    family: FAMILY_SLOT[famAlias] ?? "body",
    rem,
    sizePx: Math.round(parseFloat(rem) * 16),
    lineHeight: String(lh),
    weight,
    letterSpacing: Number(ls) === 0 ? "0" : `${ls}em`,
  };
});

const dest = resolve(scriptDir, "../src/app/_lib/type-scale.generated.json");
const payload =
  JSON.stringify(
    {
      $generated: "by scripts/generate-type-scale.mjs from acuity-dev canonical tokens — do not hand-edit",
      $source: "docs/design/system/tokens/{primitive,semantic}.tokens.json",
      roles: out,
    },
    null,
    2,
  ) + "\n";
await writeFile(dest, payload, "utf8");
console.log(`Wrote ${out.length} type roles → ${dest}`);
for (const r of out) console.log(`  ${r.id}: ${r.sizePx}px (${r.rem}) / ${r.weight} / ${r.lineHeight} / ${r.letterSpacing} [${r.family}]`);
