#!/usr/bin/env node
// Token-usage gate for the Acuity frontend.
//
// Flags the two ad-hoc styling patterns the design-token foundation bans:
//   1. Raw hex colours in TS/TSX source (#abc / #aabbcc / #aabbccdd).
//   2. Arbitrary Tailwind values that restate a scale the tokens already
//      provide: bracketed pixel/rem/em/% lengths ([13px], [1.5rem], [80%])
//      and bracketed hex colours (bg-[#8f89b7]).
//
// Implementation note: this is a regex scan rather than an eslint plugin.
// Arbitrary values live inside plain string literals (including cva/cn
// compositions and .css-adjacent template strings), where an AST rule has no
// structural advantage over a line scan; a bespoke plugin would be
// disproportionate for the same coverage. The hex-in-className AST rule in
// packages/config/eslint.config.js complements this scan.
//
// Enforcement is a per-file baseline ratchet (scripts/check-tokens.baseline.json):
//   - a file may carry at most its baselined number of hits — the debt the
//     surfaces accumulated before this gate landed;
//   - any NEW hit (a file over its budget, or a file not in the baseline)
//     fails the build;
//   - when a file drops below its budget, regenerate the baseline so the
//     budget only ever ratchets down:  node scripts/check-tokens.mjs --update-baseline
//
// Escape hatch: a line whose content (or the line directly above it) contains
// a `token-exempt: <reason>` comment is skipped. Reserved for values with no
// token-scale equivalent (e.g. a third-party embed's fixed geometry); the
// reason is mandatory and reviewed like any other code.
//
// Usage: node scripts/check-tokens.mjs                    (exit 0 = within budget)
//        node scripts/check-tokens.mjs --update-baseline  (rewrite the baseline)

import {
  readdirSync,
  readFileSync,
  statSync,
  existsSync,
  writeFileSync,
} from "node:fs";
import { join, relative } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const BASELINE_PATH = join(ROOT, "scripts", "check-tokens.baseline.json");
const UPDATE = process.argv.includes("--update-baseline");

// Raw hex colour anywhere in source.
const HEX_RE = /#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b/g;
// Arbitrary Tailwind length/colour values. var(...)-based arbitrary values and
// property syntax like [font-family:var(--font-title)] are token-backed and
// intentionally NOT flagged.
const ARBITRARY_RE = /\[(?:-?\d+(?:\.\d+)?(?:px|rem|em|%)|#[0-9a-fA-F]{3,8})\]/g;

const EXEMPT_RE = /token-exempt:/;

const SKIP_DIRS = new Set([
  "node_modules",
  ".next",
  ".turbo",
  "dist",
  "test-results",
  "playwright-report",
  "generated",
]);
const SCAN_EXT = new Set([".ts", ".tsx"]);

function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    const stats = statSync(full);
    if (stats.isDirectory()) yield* walk(full);
    else if (SCAN_EXT.has(entry.slice(entry.lastIndexOf(".")))) yield full;
  }
}

// file (repo-relative) -> [ "path:line label value", ... ]
const hitsByFile = new Map();

// design-review is the internal token-review harness: its dataset and swatch
// chrome hold raw hex/geometry values BY DESIGN (they are the subject being
// reviewed, not ad-hoc styling), so the raw-value gate does not apply to it.
const SKIP_PKGS = new Set(["design-review"]);

for (const group of ["packages", "apps"]) {
  const groupDir = join(ROOT, group);
  if (!existsSync(groupDir)) continue;
  for (const pkg of readdirSync(groupDir)) {
    if (SKIP_PKGS.has(pkg)) continue;
    const srcDir = join(groupDir, pkg, "src");
    if (!existsSync(srcDir) || !statSync(srcDir).isDirectory()) continue;
    for (const file of walk(srcDir)) {
      const rel = relative(ROOT, file);
      const lines = readFileSync(file, "utf8").split("\n");
      lines.forEach((line, index) => {
        if (EXEMPT_RE.test(line)) return;
        if (index > 0 && EXEMPT_RE.test(lines[index - 1])) return;
        for (const [label, re] of [
          ["raw hex", HEX_RE],
          ["arbitrary value", ARBITRARY_RE],
        ]) {
          for (const match of line.matchAll(re)) {
            if (!hitsByFile.has(rel)) hitsByFile.set(rel, []);
            hitsByFile.get(rel).push(`${rel}:${index + 1} ${label} ${match[0]}`);
          }
        }
      });
    }
  }
}

const totals = [...hitsByFile.values()].reduce((n, hits) => n + hits.length, 0);

if (UPDATE) {
  const baseline = Object.fromEntries(
    [...hitsByFile.entries()]
      .map(([file, hits]) => [file, hits.length])
      .sort(([a], [b]) => a.localeCompare(b)),
  );
  writeFileSync(BASELINE_PATH, `${JSON.stringify(baseline, null, 2)}\n`);
  console.log(
    `baseline written: ${Object.keys(baseline).length} file(s), ${totals} budgeted hit(s)`,
  );
  process.exit(0);
}

const baseline = existsSync(BASELINE_PATH)
  ? JSON.parse(readFileSync(BASELINE_PATH, "utf8"))
  : {};

let violations = 0;
let budgeted = 0;
let ratchetable = 0;

for (const [file, hits] of [...hitsByFile.entries()].sort(([a], [b]) =>
  a.localeCompare(b),
)) {
  const budget = baseline[file] ?? 0;
  if (hits.length > budget) {
    violations += hits.length - budget;
    console.error(
      `✗ ${file}: ${hits.length} hit(s), budget ${budget} — new ad-hoc values must use the token layer`,
    );
    for (const hit of hits) console.error(`    ${hit}`);
  } else {
    budgeted += hits.length;
    if (hits.length < budget) ratchetable++;
  }
}

// Files whose debt was fully paid off no longer need a budget line.
const stale = Object.keys(baseline).filter((file) => !hitsByFile.has(file));

console.log(
  `token scan: ${totals} hit(s) total, ${budgeted} within budget, ${violations} over budget`,
);
if (ratchetable || stale.length) {
  console.log(
    `  ${ratchetable + stale.length} file(s) now under budget — run \`node scripts/check-tokens.mjs --update-baseline\` to ratchet down`,
  );
}

process.exit(violations ? 1 : 0);
