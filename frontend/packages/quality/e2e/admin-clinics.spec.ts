import { test, expect, type Page } from "@playwright/test";

// Operator-console clinic-management journeys against the mock backend:
// create → provision-edit → drawer navigation, plus a bulk operation with
// dry-run + deliberate-confirm. State is process-scoped in the dev server's
// mock store, so assertions use records the test itself creates.

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

async function resetScenario(page: Page) {
  await page.request.get("http://localhost:3002/api/dev/scenario?name=baseline");
}

test.describe("admin clinics", () => {
  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage();
    await warmRoutes(page, ["/en-HK/clinics", "/en-HK/clinics?tab=all&open=142"]);
    // Throwaway create: the FIRST server-action invocation compiles the
    // action chunk in the dev server, which re-evaluates the shared mock-store
    // modules (state reset). Absorb that once here so the journeys below run
    // on a pinned module graph.
    await page.goto("http://localhost:3002/en-HK/clinics?tab=all&new=1");
    await page.waitForLoadState("networkidle");
    await page.getByLabel("Clinic name (Chinese)").fill("暖機診所");
    await page.getByRole("button", { name: "Create clinic" }).click();
    await page.waitForTimeout(1500);
    await page.close();
  });
  test.beforeEach(async ({ page }) => {
    await resetScenario(page);
  });

  test("creates a clinic, edits provisioning basics, shows it in the grid", async ({ page }) => {
    await page.goto(`${base}/clinics?tab=all`);
    await page.waitForLoadState("networkidle");
    await page.getByRole("link", { name: "New clinic" }).click();

    await page.getByLabel("Clinic name (Chinese)").fill("測試診所");
    await page.getByLabel("Clinic name (English)").fill("Journey Test Clinic");
    await page.getByLabel("Address").fill("1 Test Road, Central");
    await page.getByRole("button", { name: "Create clinic" }).click();

    // Create routes into the provisioning facet of the new clinic's drawer.
    await expect(page.getByText("What's left")).toBeVisible();
    await expect(page).toHaveURL(/facet=provisioning/);

    // Edit a provisioning basic (autosaved on blur through the contract PUT).
    const phone = page.getByLabel("Phone", { exact: true });
    await phone.fill("+852 9999 0000");
    await phone.blur();

    // Close the drawer; the grid keeps its tab context and lists the clinic.
    await page.keyboard.press("Escape");
    await expect(page).toHaveURL(/tab=all/);
    await expect(page.locator("#main").getByText("Journey Test Clinic", { exact: true })).toBeVisible();
  });

  test("clinic detail drawer opens over the grid with all six facets", async ({ page }) => {
    await page.goto(`${base}/clinics?tab=all&open=142`);
    const drawer = page.getByRole("dialog");
    await expect(drawer.getByText("CL-0142")).toBeVisible();
    const facetTabs = drawer.getByTestId("facet-tabs");
    for (const facet of ["Overview", "Provisioning", "Usage & settings", "Account", "Onboarding", "Impersonate"]) {
      await expect(facetTabs.getByRole("link", { name: facet, exact: true })).toBeVisible();
    }
    // Facet switch is a URL-driven server re-render inside the drawer.
    await facetTabs.getByRole("link", { name: "Onboarding", exact: true }).click();
    await expect(page.getByText(/Walkthrough · \d of 8/)).toBeVisible();
    // The grid stays mounted underneath (filter/sort context survives; the
    // open sheet marks background content inert, so assert attachment).
    await expect(page.getByRole("heading", { name: "Clinics", includeHidden: true })).toBeAttached();
    await expect(page).toHaveURL(/tab=all/);
  });

  test("bulk deactivate runs dry-run + paste gate over the selection", async ({ page }) => {
    await page.goto(`${base}/clinics?tab=active`);
    await page.waitForLoadState("networkidle");
    const checkboxes = page.getByRole("checkbox");
    await checkboxes.nth(1).click();
    await checkboxes.nth(2).click();

    // Contextual action bar appears on selection.
    const bar = page.getByRole("status").filter({ hasText: "selected" });
    await expect(bar).toBeVisible();
    await bar.getByRole("button", { name: "Deactivate" }).click();

    // Deliberate-confirm: dry-run preview + paste-to-confirm; confirm stays
    // disabled until the identifier is pasted (typing friction is the point).
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText(/Dry run — 2 rows/)).toBeVisible();
    const confirm = dialog.getByRole("button", { name: "Deactivate", exact: true });
    await expect(confirm).toBeDisabled();

    const target = await dialog.locator("code").innerText();
    await dialog.getByPlaceholder("Paste identifier here").fill(target);
    await expect(confirm).toBeEnabled();
    await confirm.click();

    await expect(page.getByText(/2 clinics deactivated · logged/)).toBeVisible();
  });
});
