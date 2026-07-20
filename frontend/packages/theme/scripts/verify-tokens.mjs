/**
 * Theme determinism gate (mirrors design-kit's verify-tokens pattern).
 *
 * Asserts the invariants the theme's tokens-as-source contract depends on:
 *   1. Every semantic role in the preset aliases a caliber primitive that
 *      exists (no dangling references, no restated literals in tier 2).
 *   2. Every caliber primitive is emitted in tokens.css under its canonical
 *      --caliber-<name> with the verbatim JSON value.
 *   3. The committed tokens.css is byte-identical to a fresh build (no hand
 *      edits, no drift against the vendored preset).
 *   4. The build is deterministic (two runs produce identical output).
 *
 * Exits non-zero on any violation so it can gate CI / auto-commit.
 */
import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const errors = [];

const preset = JSON.parse(
  await readFile(resolve(root, 'presets/caliber-light.tokens.json'), 'utf8'),
);
const caliber = preset.primitive.color.caliber;
const semantic = preset.semantic.color;

// 1. Alias graph: every semantic role aliases an existing caliber primitive.
for (const [role, tok] of Object.entries(semantic)) {
  if (role.startsWith('$')) continue;
  const value = tok.$value;
  const m = typeof value === 'string' && value.match(/^\{color\.caliber\.([a-z-]+)\}$/);
  if (!m) {
    errors.push(`restated literal / non-caliber alias in semantic tier: ${role} = ${JSON.stringify(value)}`);
    continue;
  }
  if (!caliber[m[1]]) errors.push(`dangling alias: ${role} -> {color.caliber.${m[1]}} (primitive not found)`);
}

// 2. Emission: every primitive present in tokens.css, canonical name, verbatim value.
const css = await readFile(resolve(root, 'tokens.css'), 'utf8');
const primitives = Object.keys(caliber).filter((k) => !k.startsWith('$'));
for (const name of primitives) {
  const line = `--caliber-${name}: ${caliber[name].$value};`;
  if (!css.includes(line)) errors.push(`tokens.css missing canonical primitive emission: ${line}`);
}
// Utility-layer aliases that call sites consume via var().
for (const alias of ['--color-border-strong:', '--color-surface:', '--color-surface-contrast:', '--motion:']) {
  if (!css.includes(alias)) errors.push(`tokens.css missing utility alias: ${alias}`);
}
// Retired back-compat aliases must never re-appear (canonical names only).
for (const alias of ['--caliber-sky:', '--caliber-sage-deep:', '--state-needs:']) {
  if (css.includes(alias)) errors.push(`tokens.css re-introduces retired alias: ${alias}`);
}

if (errors.length) {
  console.error(`Theme token graph FAILED ${errors.length} check(s):`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}

// 3 + 4. Committed output matches a fresh build; build is deterministic.
const buildOnce = () => {
  execFileSync('node', ['scripts/build-tokens.mjs'], { cwd: root, stdio: 'ignore' });
  return readFile(resolve(root, 'tokens.css'), 'utf8');
};
const a = await buildOnce();
if (a !== css) {
  console.error('Theme token graph FAILED 1 check(s):');
  console.error('  - tokens.css drifted from a fresh build (hand edit or stale generate); run `pnpm generate` in packages/theme');
  process.exit(1);
}
const b = await buildOnce();
if (a !== b) {
  console.error('Theme token graph FAILED 1 check(s):');
  console.error('  - non-deterministic build: tokens.css differs between two runs');
  process.exit(1);
}

console.log('Theme token graph OK:');
console.log(`  ${primitives.length} caliber primitives, ${Object.keys(semantic).filter((k) => !k.startsWith('$')).length - 1} semantic color roles`);
console.log('  - every semantic role aliases an existing caliber primitive (no dangling refs, no restated literals)');
console.log('  - every primitive emitted under its canonical --caliber-* name with the verbatim value');
console.log('  - utility aliases present; retired back-compat aliases absent');
console.log('  - committed tokens.css matches a fresh, deterministic build');
