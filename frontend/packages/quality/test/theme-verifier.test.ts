// The theme package's token pipeline carries its own determinism gate
// (generator + verifier over the canonical caliber-light DTCG JSON). This
// test invokes the verifier so the suite fails when the generated tokens.css
// drifts from the canonical source.

import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const themeDir = fileURLToPath(new URL("../../theme", import.meta.url));

function themeVerifyScript(): string | null {
  const pkgPath = join(themeDir, "package.json");
  if (!existsSync(pkgPath)) return null;
  const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
  if (pkg.scripts?.["tokens:verify"]) return "tokens:verify";
  if (pkg.scripts?.verify) return "verify";
  return null;
}

describe("theme token verifier", () => {
  const script = themeVerifyScript();

  // Skipped only while the theme package has no verifier script (the
  // generator/verifier pair over presets/caliber-light.tokens.json).
  it.skipIf(script === null)("theme token verifier passes", () => {
    expect(() =>
      execFileSync("pnpm", ["run", script!], {
        cwd: themeDir,
        stdio: "pipe",
      }),
    ).not.toThrow();
  });

  it("theme package exposes tokens.css", () => {
    expect(existsSync(join(themeDir, "tokens.css"))).toBe(true);
  });
});
