import { defineConfig, devices } from "@playwright/test";

// Scoped runner for the auth-ui journey suite. The specs live in the shared
// quality harness (packages/quality/e2e/auth-ui-*.spec.ts) and self-manage
// the mount-harness dev server (port 3006), so no webServer entry is needed
// here. The full @acuity/quality Playwright config also picks these specs up
// alongside the four app surfaces; this config exists so the package's
// journeys can be verified in isolation (e.g. while the app dev servers are
// held by other work).

export default defineConfig({
  testDir: "../quality/e2e",
  testMatch: "auth-ui-*.spec.ts",
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],
  use: {
    ...devices["Desktop Chrome"],
    trace: "retain-on-failure",
  },
});
