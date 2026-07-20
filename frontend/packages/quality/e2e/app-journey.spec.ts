import { expect, test, type Page } from "@playwright/test";
import { seedMockSession } from "./smoke";

// Doctor-app journey suite (mock-first, en-HK): the five-step claim loop,
// the inline validation layer, the 409 optimistic-lock conflict, tenant
// not-found isolation, and the patients -> history navigation. States are
// reached through the app's demo scenario switcher (the runtime face of the
// mock scenario engine), exactly as a demo run reaches them. The suite rides
// a seeded mock session past the middleware sign-in gate; the real auth
// journey is proven in app-auth-journeys.spec.ts.

const BASE = "http://localhost:3000/en-HK";

test.beforeEach(async ({ context }) => {
  await seedMockSession(context, 3000);
});

async function openSwitcher(page: Page) {
  await page.getByTestId("scenario-switcher-toggle").click();
  await expect(page.getByTestId("scenario-switcher")).toBeVisible();
}

async function confirmAllFields(page: Page) {
  // Click enabled confirm checkmarks until none remain (confirmed rows keep
  // the label but disable the control).
  const enabled = page.locator('button[aria-label="Confirm this value"]:not([disabled])');
  for (let i = 0; i < 30; i += 1) {
    const count = await enabled.count();
    if (count === 0) return;
    await enabled.first().click();
  }
}

test.describe("doctor app journeys", () => {
  test("five-step claim journey: select → intake → extraction → review → produce", async ({
    page,
  }) => {
    test.setTimeout(120_000);

    // 1. Select — search-first recognition over the coverage registry.
    await page.goto(`${BASE}/forms/new`);
    await expect(
      page.getByRole("heading", { name: "Choose the insurer and form" }),
    ).toBeVisible();
    const card = page
      .getByRole("button")
      .filter({ hasText: "Demo Insurance Ltd." })
      .filter({ hasText: "Outpatient Claim" })
      .first();
    await card.click();
    await expect(page.getByText(/Selected: Demo Insurance Ltd/)).toBeVisible();
    await page.getByRole("button", { name: "Continue" }).click();

    // 2. Intake — paste is the always-available path.
    await expect(page).toHaveURL(/\/forms\/\d+\/intake/);
    await page
      .getByLabel("Paste the patient's record or notes")
      .fill("Patient: LEE Siu Ming. 2-day URTI, consult fee 380.");
    await page.getByRole("button", { name: "Extract" }).click();

    // 3. Extraction — the wait screen owns the loading state, then review.
    await expect(page).toHaveURL(/\/forms\/\d+\/(extraction|review)/);
    await expect(page).toHaveURL(/\/forms\/\d+\/review/, { timeout: 30_000 });

    // 4. Review — needs-input + validation seeded by the canned extraction.
    await expect(page.getByLabel("Policy number")).toBeVisible();
    // The invalid canned ICD-10 shows its field-adjacent message.
    await expect(page.getByText("Use an ICD-10 code such as J06.9.")).toBeVisible();
    await page.getByLabel("ICD-10 code").fill("J06.9");
    await expect(page.getByText("Use an ICD-10 code such as J06.9.")).toHaveCount(0);
    await page.getByLabel("Policy number").fill("POL-2026-000123");
    await confirmAllFields(page);
    await expect(page.getByText("All fields confirmed — ready to sign").first()).toBeVisible();

    // Sign-off: the feedforward preview then the producing state.
    await page.getByRole("button", { name: "Review and sign" }).click();
    await expect(page.getByRole("button", { name: "Sign and submit" })).toBeVisible();
    await expect(page.getByText("Demo Insurance Ltd.").first()).toBeVisible();
    await page.getByRole("button", { name: "Sign and submit" }).click();

    // 5. Produce & deliver — facsimile + Send primary; calm end-peak.
    await expect(page).toHaveURL(/\/forms\/\d+\/produce/, { timeout: 30_000 });
    await expect(page.getByText("Your form is ready").first()).toBeVisible();
    await expect(page.getByText("Attending physician signature 主診醫生簽署")).toBeVisible();
    await page.getByRole("button", { name: /Send to Demo Insurance/ }).click();
    await expect(page.getByText(/Submitted to Demo Insurance Ltd/).first()).toBeVisible();
    await page.getByRole("button", { name: "Done" }).click();
    await expect(page).toHaveURL(new RegExp(`${BASE.replace(/[/.]/g, "\\$&")}/?$`));
  });

  test("validation failure gates sign-off with a counted reason", async ({ page }) => {
    // Claim 5001 ships with the invalid ICD-10 + unconfirmed drafts.
    await page.goto(`${BASE}/forms/5001/review`);
    await expect(page.getByText("Use an ICD-10 code such as J06.9.")).toBeVisible();
    // The invalid field's confirm control is disabled.
    const icdRow = page.locator("#row-icd10_code");
    await expect(icdRow.getByRole("button", { name: "Confirm this value" })).toBeDisabled();
    // Sign-off is gated with the counted reason.
    await expect(page.getByRole("button", { name: "Review and sign" })).toBeDisabled();
    await expect(page.getByText(/still needs? review before you can produce/)).toBeVisible();
  });

  test("409 optimistic-lock conflict on a review field save", async ({ page }) => {
    await page.goto(`${BASE}/forms/5001/review`);
    await expect(page.getByLabel("Diagnosis")).toBeVisible();
    await openSwitcher(page);
    await page.getByLabel("409 conflict on writes").check();
    await page.getByTestId("scenario-switcher-toggle").click();
    await page.getByLabel("Diagnosis").fill("急性上呼吸道感染（覆診）");
    await expect(
      page.getByText("This form was changed in another window", { exact: false }),
    ).toBeVisible({ timeout: 15_000 });
  });

  test("tenant isolation renders the designed not-found state", async ({ page }) => {
    await page.goto(`${BASE}`);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await openSwitcher(page);
    await page.getByLabel("Tenant not-found (404)").check();
    await page.getByTestId("scenario-switcher-toggle").click();
    // Client-side navigate into a claim: the detail read 404s per isolation.
    await page
      .getByRole("link")
      .filter({ hasText: /Outpatient Claim|Inpatient Claim|Health Declaration/ })
      .first()
      .click();
    // The not-found panel is the converged design-kit EmptyState grammar,
    // which renders its title as a paragraph (heading semantics are a
    // queued design-kit ask).
    await expect(page.getByText("We couldn't find that form")).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByRole("link", { name: "Back to your forms" })).toBeVisible();
  });

  test("patients open a pre-filtered history with resume cues", async ({ page }) => {
    await page.goto(`${BASE}/patients`);
    const firstPatient = page
      .locator("a[href*='/history?patient=']")
      .first();
    await expect(firstPatient).toBeVisible();
    const patientName = (await firstPatient.locator("p").first().textContent()) ?? "";
    await firstPatient.click();
    await expect(page).toHaveURL(/\/history\?patient=/);
    // The patient filter is echoed as a clearable chip and rows are filtered.
    await expect(page.getByText(`Patient: ${patientName}`)).toBeVisible();
    const rows = page.locator("div.divide-y > div");
    const rowCount = await rows.count();
    expect(rowCount).toBeGreaterThan(0);
    for (let i = 0; i < rowCount; i += 1) {
      await expect(rows.nth(i)).toContainText(patientName);
    }
  });

  test("session expiry surfaces the re-auth overlay", async ({ page }) => {
    await page.goto(`${BASE}`);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await openSwitcher(page);
    await page.getByLabel("Session expired (401)").check();
    await page.getByTestId("scenario-switcher-toggle").click();
    // Client-side navigate: the next authed fetch 401s and the overlay mounts.
    await page.getByRole("link", { name: "Completed" }).first().click();
    await expect(
      page.getByRole("heading", { name: "Your session has expired" }),
    ).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("button", { name: "Sign in again" })).toBeVisible();
  });
});
