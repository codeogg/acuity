import { test, expect, type Page } from "@playwright/test";

// Guardrail journeys: tenant-isolation 404 (never 403), the PHI mask +
// audited reveal on claims oversight, and the server-rendered impersonation
// signal surviving a full reload.

const base = "http://localhost:3002/en-HK";


// Warm the routes this spec drives before any scenario manipulation: the dev
// server compiles routes on demand, and a compilation re-evaluates the shared
// mock-store modules (scenario + fixtures), which would reset state set
// mid-test. Warming first pins the module graph for the whole spec.
async function warmRoutes(page: Page, paths: string[]) {
  for (const path of paths) {
    await page.request.get(`http://localhost:3002${path}`);
  }
}

async function setScenario(page: Page, name: string) {
  const res = await page.request.get(`http://localhost:3002/api/dev/scenario?name=${name}`);
  expect(res.ok()).toBeTruthy();
}

test.describe("admin oversight guardrails", () => {
  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage();
    await warmRoutes(page, [
      "/en-HK/clinics",
      "/en-HK/claims/5014",
      "/en-HK/audit",
      "/en-HK/doctors",
    ]);
    await page.close();
  });
  test.beforeEach(async ({ page }) => {
    await setScenario(page, "baseline");
  });
  test.afterEach(async ({ page }) => {
    await setScenario(page, "baseline");
  });

  test("tenant-isolation reads surface not-found, in the drawer and on detail routes", async ({ page }) => {
    // A cross-tenant / absent clinic id renders the drawer's not-found state.
    // (Cross-tenant and absent are indistinguishable by design: the backend
    // returns 404, never 403, for both.)
    await page.goto(`${base}/clinics?open=999999`);
    await expect(page.getByTestId("drawer-not-found")).toBeVisible();

    // The claim detail route renders its not-found body for an unreachable id.
    await page.goto(`${base}/claims/999999`);
    await expect(page.getByText("Claim not found")).toBeVisible();
  });

  test("claim field values render masked; reveal is gated and audited", async ({ page }) => {
    await page.goto(`${base}/claims/5014`);

    // Masked by default: no patient-entered value visible, mask glyphs shown.
    await expect(page.getByText("Final field values", { exact: false })).toBeVisible();
    await expect(page.getByText("潘曉琳")).toHaveCount(0);
    await expect(page.getByLabel("Masked value").first()).toBeVisible();

    // Reveal is an explicit acknowledged action.
    await page.waitForLoadState("networkidle");
    await page.getByTestId("reveal-button").click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("checkbox").click();
    await dialog.getByRole("button", { name: "Reveal · logged" }).click();

    await expect(page.getByTestId("value-patient_name_cn")).toHaveText("潘曉琳");

    // The reveal recorded an audit event (raw-code render, never mislabelled).
    await page.goto(`${base}/audit`);
    await expect(page.getByText("PHI reveal (audited)").first()).toBeVisible();
    await expect(page.getByRole("cell", { name: /SUB20260710001396|SUB\d+/ }).first()).toBeVisible();
  });

  test("impersonation signal is server-rendered and survives reload", async ({ page }) => {
    await page.goto(`${base}/doctors?open=2207&facet=impersonate`);
    await page.waitForLoadState("networkidle");
    await page.getByRole("button", { name: "Enter view-as session" }).click();
    // The drawer stays open over the console; the signal renders above all
    // chrome but the open sheet aria-hides background content — close it
    // before asserting on the banner's accessible role.
    await expect(page.locator('[role="status"]').filter({ hasText: "Viewing as" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("status").filter({ hasText: "Viewing as" })).toBeVisible();

    // Full reload: the signal is in the initial server HTML (session persists
    // in the mock session store), on every surface.
    await page.goto(`${base}/audit`);
    const banner = page.getByRole("status").filter({ hasText: "Viewing as" });
    await expect(banner).toBeVisible();
    await expect(banner).toContainText("read-only");

    // Exit closes the session and the audit trail carries start + end.
    await banner.getByRole("button", { name: "Exit impersonation" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Viewing as" })).toHaveCount(0);
    await page.goto(`${base}/audit`);
    await expect(page.getByText("Impersonation start").first()).toBeVisible();
    await expect(page.getByText("Impersonation end").first()).toBeVisible();
  });
});
