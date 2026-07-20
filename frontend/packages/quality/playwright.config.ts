import { defineConfig, devices } from "@playwright/test";
import { fileURLToPath } from "node:url";

// Smoke + accessibility suite over the app, site, and admin surfaces. Each
// boots its own dev server (mock-first: MSW is the default data source, so no
// backend is needed). Ports mirror each app's dev script (app 3000,
// site 3001, admin 3002); the auth-ui journey spec boots its own harness
// on 3006.

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));

function appServer(pkg: string, port: number, firstPath: string) {
  return {
    command: `pnpm --filter @acuity/${pkg} dev`,
    url: `http://localhost:${port}${firstPath}`,
    cwd: repoRoot,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  };
}

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  // The dev servers hold one mutable scenario store each; parallel spec files
  // clobber each other's scenario state, so the suite runs serially.
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["list"]] : [["list"]],
  use: {
    ...devices["Desktop Chrome"],
    trace: "retain-on-failure",
  },
  projects: [
    // Compile the primary routes before any spec runs (dev servers compile on
    // demand; the warm-up removes the cold-start race without retries).
    { name: "warmup", testMatch: /warmup\.setup\.ts/ },
    { name: "e2e", testMatch: /.*\.spec\.ts/, dependencies: ["warmup"] },
  ],
  webServer: [
    appServer("app", 3000, "/en-HK"),
    appServer("site", 3001, "/en-HK"),
    appServer("admin", 3002, "/en-HK"),
  ],
});
