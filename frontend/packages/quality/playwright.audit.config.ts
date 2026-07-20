import { defineConfig, devices } from "@playwright/test";
import { fileURLToPath } from "node:url";

// Config for the researched UI audit sweep (audit/sweep.audit.ts): walks every
// route on every surface across the six audit viewports, capturing screenshots
// and a JSON issue log to audit-out/ (gitignored). Separate from the gate
// config so `pnpm test:e2e` stays fast; run via `pnpm audit:ui`.

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));

function appServer(pkg: string, port: number, firstPath: string) {
  return {
    command: `pnpm --filter @acuity/${pkg} dev`,
    url: `http://localhost:${port}${firstPath}`,
    cwd: repoRoot,
    reuseExistingServer: true,
    timeout: 180_000,
  };
}

export default defineConfig({
  testDir: "./audit",
  testMatch: "**/*.audit.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  // The sweep is an inventory, not a gate: long timeout, list reporter only.
  timeout: 600_000,
  reporter: [["list"]],
  outputDir: "./audit-out/test-artifacts",
  use: {
    ...devices["Desktop Chrome"],
    trace: "off",
    video: "off",
  },
  webServer: [
    appServer("app", 3000, "/en-HK/sign-in"),
    appServer("site", 3001, "/en-HK"),
    appServer("admin", 3002, "/en-HK"),
  ],
});
