import { test, expect, type Page } from "@playwright/test";

// The keystone confirmation field-map editor: split-pane overlays, resolve
// flow. NOTE: the suite assumes a fresh mock store (dev-server process) —
// the publish journey mutates template 105 for the session.
// flow, publish gating behind the acknowledgement confirm, and the 409
// optimistic-lock (row_version) conflict surface.

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

test.describe("admin field-map editor", () => {
  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage();
    await warmRoutes(page, ["/en-HK/forms", "/en-HK/forms/105", "/en-HK/forms/101"]);
    await page.close();
  });
  test.beforeEach(async ({ page }) => {
    await setScenario(page, "baseline");
  });
  test.afterEach(async ({ page }) => {
    await setScenario(page, "baseline");
  });

  test("intake worklist opens the split-pane editor with overlays", async ({ page }) => {
    await page.goto(`${base}/forms?tab=intake`);
    await page.goto(`${base}/forms/105`);

    // Split pane: PDF caption + detected-field overlays + the field map.
    await expect(page.getByText("Original insurer PDF", { exact: false })).toBeVisible();
    await expect(page.getByTestId("overlay-9101")).toBeVisible();
    await expect(page.getByTestId("field-row-9101")).toBeVisible();

    // Bidirectional: clicking the overlay selects its field row.
    await page.waitForLoadState("networkidle");
    await page.getByTestId("overlay-9101").click();
    await expect(page.getByTestId("field-row-9101")).toHaveClass(/border-primary/);

    // Publish is gated while unresolved fields remain.
    await expect(page.getByTestId("publish-block")).toBeVisible();
    await expect(page.getByTestId("publish-button")).toBeDisabled();
  });

  test("resolving every field enables publish behind the ack gate", async ({ page }) => {
    await page.goto(`${base}/forms/105`);
    await page.waitForLoadState("networkidle");

    // Resolve field 9101 (bind + confirm via mark-resolved).
    await page.getByTestId("field-row-9101").getByRole("button").first().click();
    await page.getByTestId("resolve-9101").click();
    await expect(page.getByTestId("autosave-state")).toContainText("Draft saved");

    // Field 9102 carries the pipelines-disagree conflict — pick one type.
    await page.getByTestId("field-row-9102").getByRole("button").first().click();
    await expect(page.getByTestId("conflict-9102")).toBeVisible();
    await page.getByTestId("conflict-9102").getByRole("button", { name: "date" }).click();

    // With zero unresolved fields the publish gate opens (ack variant).
    const publish = page.getByTestId("publish-button");
    await expect(publish).toBeEnabled();
    await publish.click();
    const dialog = page.getByRole("dialog");
    const confirm = dialog.getByRole("button", { name: "Publish", exact: true });
    await expect(confirm).toBeDisabled();
    await dialog.getByRole("checkbox").click();
    await expect(confirm).toBeEnabled();
    await confirm.click();

    // Publish lands the template in the library.
    await expect(page).toHaveURL(/forms\?tab=library/);
    await expect(page.getByText("TPL3305I9J0").first()).toBeVisible();
  });

  test("row_version conflict (409) surfaces the reload banner", async ({ page }) => {
    await page.goto(`${base}/forms/101`);
    await page.waitForLoadState("networkidle");
    await expect(page.getByTestId("field-row-9001")).toBeVisible();

    // Force the optimistic-lock outcome on the next writes.
    await setScenario(page, "conflict-409");

    await page.getByTestId("field-row-9001").getByRole("button").first().click();
    const label = page.getByLabel("Label", { exact: true });
    await label.fill("Policy holder (edited elsewhere)");
    await label.blur();

    await expect(page.getByTestId("conflict-banner")).toBeVisible();

    // Reload recovers to the store's current field map.
    await setScenario(page, "baseline");
    await page.getByRole("button", { name: "Reload fields" }).click();
    await expect(page.getByTestId("conflict-banner")).toHaveCount(0);
  });
});
