import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { spawn, type ChildProcess } from "node:child_process";
import { fileURLToPath } from "node:url";

// Auth journey suite for the doctor app (apps/app, port 3000): the sign-in
// gate on protected routes, the full doctor journey (identity → MFA → clinic
// selection → work home), the deep-link return, session-expired re-entry, and
// sign-out. Patterned on auth-ui-journeys.spec.ts; like that spec it manages
// its own server (reuse a running one, else boot the app dev server) so it
// also runs outside the shared webServer config.

const BASE = "http://localhost:3000";
const repoRoot = fileURLToPath(new URL("../../..", import.meta.url));

let server: ChildProcess | null = null;

async function appUp(): Promise<boolean> {
  try {
    const response = await fetch(`${BASE}/en-HK/sign-in`);
    return response.ok;
  } catch {
    return false;
  }
}

test.beforeAll(async () => {
  test.setTimeout(240_000);
  if (await appUp()) return;
  server = spawn("pnpm", ["--filter", "@acuity/app", "dev"], {
    cwd: repoRoot,
    stdio: "ignore",
    detached: true,
  });
  const deadline = Date.now() + 210_000;
  while (Date.now() < deadline) {
    if (await appUp()) return;
    await new Promise((resolve) => setTimeout(resolve, 2_000));
  }
  throw new Error("doctor app did not start on :3000");
});

test.afterAll(() => {
  if (server?.pid) {
    try {
      process.kill(-server.pid);
    } catch {
      // Already gone.
    }
  }
});

const h1 = (page: Page) => page.getByRole("heading", { level: 1 });

// Walk the doctor journey from the sign-in card through MFA and the clinic
// step (the default demo identity is multi-clinic) to the destination.
async function completeDoctorSignIn(page: Page, options: { clinicStep?: boolean } = {}) {
  // ADR 0040: MFA is opt-in — the default demo doctor signs in with the
  // prefilled email + password and goes straight to clinic selection.
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  if (options.clinicStep !== false) {
    await expect(h1(page)).toHaveText("Which clinic today?", { timeout: 15_000 });
    await page.getByRole("button", { name: "Continue", exact: true }).click();
  }
}

test.describe("doctor app auth journeys", () => {
  test("signed-out visit to the work home lands on sign-in", async ({ page }) => {
    await page.goto(`${BASE}/en-HK`);
    await page.waitForURL(/\/en-HK\/sign-in\?reason=unauthenticated/);
    await expect(h1(page)).toHaveText("Sign in to Acuity");
  });

  test("full journey lands on the work home", async ({ page }) => {
    await page.goto(`${BASE}/en-HK/sign-in`);
    await completeDoctorSignIn(page);
    await page.waitForURL(/\/en-HK\/?$/, { timeout: 20_000 });
    await expect(h1(page)).toHaveText(/Good (morning|afternoon|evening)/, {
      timeout: 20_000,
    });
  });

  test("deep link is preserved through the gate and returns", async ({ page }) => {
    await page.goto(`${BASE}/en-HK/history`);
    await page.waitForURL(/\/en-HK\/sign-in\?reason=unauthenticated&from=%2Fhistory/);
    await completeDoctorSignIn(page);
    await page.waitForURL(/\/en-HK\/history$/, { timeout: 20_000 });
    await expect(h1(page)).toHaveText("Your forms", { timeout: 20_000 });
  });

  test("merged multi-clinic doctor skips clinic selection and lands combined", async ({
    page,
  }) => {
    // ADR 0041 §6: dr2520 is multi-clinic with workspace_separation "merged" —
    // no "Which clinic today?" step; the shell shows the combined-workspace
    // label instead of one clinic name.
    await page.goto(`${BASE}/en-HK/sign-in?demo-account=dr2520`);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await page.waitForURL(/\/en-HK\/?$/, { timeout: 20_000 });
    await expect(h1(page)).toHaveText(/Good (morning|afternoon|evening)/, {
      timeout: 20_000,
    });
    await expect(
      page.getByText("All clinics").filter({ visible: true }).first(),
    ).toBeVisible();
  });

  test("session-expired entry renders the calm note", async ({ page }) => {
    await page.goto(`${BASE}/en-HK/sign-in?reason=expired`);
    await expect(
      page.getByText("signed you out to keep things safe", { exact: false }),
    ).toBeVisible();
  });

  test("sign-out returns to sign-in and the gate re-applies", async ({ page }) => {
    await page.goto(`${BASE}/en-HK/sign-in`);
    await completeDoctorSignIn(page);
    await page.waitForURL(/\/en-HK\/?$/, { timeout: 20_000 });
    // Sign out now lives in the account & preferences menu (ShellAccountMenu);
    // two responsive instances render, so target the visible trigger.
    await page
      .getByRole("button", { name: "Account menu" })
      .filter({ visible: true })
      .click();
    await page.getByRole("menuitem", { name: "Sign out" }).click();
    await page.waitForURL(/\/en-HK\/sign-in/, { timeout: 20_000 });
    await page.goto(`${BASE}/en-HK/history`);
    await page.waitForURL(/\/en-HK\/sign-in\?reason=unauthenticated/);
  });

  test("sign-in card has no critical accessibility violations", async ({ page }) => {
    await page.goto(`${BASE}/en-HK/sign-in`);
    await expect(h1(page)).toHaveText("Sign in to Acuity");
    const results = await new AxeBuilder({ page }).analyze();
    const critical = results.violations.filter((v) => v.impact === "critical");
    expect(critical).toEqual([]);
  });
});
