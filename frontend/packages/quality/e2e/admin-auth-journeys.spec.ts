import { test, expect, type Page } from "@playwright/test";

// Operator-console auth journeys against the mounted @acuity/auth-ui package
// on the admin surface (port 3002): the middleware sign-in gate, the full
// operator journey (identity → hardware-key MFA → Clinics landing), the
// session-expired re-entry loop with the preserved deep link, wrong-app
// session rejection, and sign-out (POST-based, re-gating every console
// route). Patterned on auth-ui-journeys.spec.ts; the admin dev server is
// booted by the shared Playwright webServer config, so no server management
// here.

const ORIGIN = "http://localhost:3002";
const BASE = `${ORIGIN}/en-HK`;

const h1 = (page: Page) => page.getByRole("heading", { level: 1 });
const signInButton = (page: Page) =>
  page.getByRole("button", { name: "Sign in", exact: true });

// Walk the operator journey from the sign-in card to the console landing.
async function completeOperatorSignIn(page: Page) {
  await signInButton(page).click();
  await expect(h1(page)).toHaveText("Confirm with your security key", {
    timeout: 15_000,
  });
  await page
    .getByRole("button", { name: "Simulate key touch", exact: true })
    .click();
}

test.describe("admin auth journeys", () => {
  test("signed-out visits to console routes gate to sign-in", async ({
    browser,
  }) => {
    const context = await browser.newContext();
    await context.addCookies([
      { name: "acuity_signed_out", value: "1", url: ORIGIN },
    ]);
    const page = await context.newPage();
    await page.goto(`${BASE}/clinics`);
    await page.waitForURL(/\/en-HK\/sign-in\?reason=unauthenticated&from=%2Fclinics/, {
      timeout: 15_000,
    });
    await expect(page.getByText("OPERATOR CONSOLE")).toBeVisible();
    await expect(h1(page)).toHaveText("Operator sign-in");
    await context.close();
  });

  test("operator journey lands on the Clinics portfolio", async ({ page }) => {
    await page.goto(`${BASE}/sign-in`);
    await expect(page.getByText("console.acuity.hk")).toBeVisible();
    await expect(h1(page)).toHaveText("Operator sign-in");
    await completeOperatorSignIn(page);
    await page.waitForURL(`${BASE}/clinics`, { timeout: 25_000 });
    await expect(h1(page)).toHaveText("Clinics");
  });

  test("a doctor session presented to the console is rejected outright", async ({
    page,
  }) => {
    await page.goto(`${BASE}/sign-in?demo-account=dr2207`);
    await signInButton(page).click();
    await expect(
      page.getByText("This is the operator console", { exact: false }),
    ).toBeVisible({ timeout: 15_000 });
    await page.getByRole("button", { name: "Back to sign in" }).click();
    await expect(h1(page)).toHaveText("Operator sign-in");
  });

  test("session-expired console visit re-enters and returns to the exact path", async ({
    page,
  }) => {
    await page.goto(`${BASE}/clinics?scenario=session-expired`);
    await page.waitForURL(/\/en-HK\/sign-in\?reason=expired&from=%2Fclinics/, {
      timeout: 20_000,
    });
    await expect(
      page.getByText("signed out to keep the console secure", { exact: false }),
    ).toBeVisible();
    await completeOperatorSignIn(page);
    await page.waitForURL(`${BASE}/clinics`, { timeout: 25_000 });
    await expect(h1(page)).toHaveText("Clinics");
  });

  test("sign-out POSTs, lands on sign-in, and re-gates the console", async ({
    page,
  }) => {
    // Establish a real signed-in session first.
    await page.goto(`${BASE}/sign-in`);
    await completeOperatorSignIn(page);
    await page.waitForURL(`${BASE}/clinics`, { timeout: 25_000 });

    const logoutPost = page.waitForRequest(
      (request) =>
        request.url().includes("/api/auth/logout") && request.method() === "POST",
    );
    // Sign out now lives in the account & preferences menu (ShellAccountMenu).
    await page.getByRole("button", { name: "Account menu" }).click();
    await page.getByRole("menuitem", { name: "Sign out" }).click();
    await logoutPost;
    await page.waitForURL(`${BASE}/sign-in`, { timeout: 15_000 });

    // Every console route now gates back to sign-in until re-authentication.
    await page.goto(`${BASE}/clinics`);
    await page.waitForURL(/\/en-HK\/sign-in\?reason=unauthenticated/, {
      timeout: 15_000,
    });
    await expect(h1(page)).toHaveText("Operator sign-in");
  });
});
