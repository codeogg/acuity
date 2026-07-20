import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { spawn, type ChildProcess } from "node:child_process";
import { fileURLToPath } from "node:url";

// Journey suite for the shared @acuity/auth-ui package, run against its mount
// harness (packages/auth-ui-dev-harness — a minimal consuming Next.js app on
// port 3006). The harness is not one of the four deployed surfaces, so this
// spec manages its dev server itself: reuse a running one, else boot it.

const BASE = "http://localhost:3006";
const repoRoot = fileURLToPath(new URL("../../..", import.meta.url));

let harness: ChildProcess | null = null;

async function harnessUp(): Promise<boolean> {
  try {
    const response = await fetch(`${BASE}/en-HK`);
    return response.ok;
  } catch {
    return false;
  }
}

test.beforeAll(async () => {
  test.setTimeout(240_000);
  if (await harnessUp()) return;
  harness = spawn("pnpm", ["--filter", "@acuity/auth-ui", "dev"], {
    cwd: repoRoot,
    stdio: "ignore",
    detached: true,
  });
  const deadline = Date.now() + 210_000;
  while (Date.now() < deadline) {
    if (await harnessUp()) return;
    await new Promise((resolve) => setTimeout(resolve, 2_000));
  }
  throw new Error("auth-ui mount harness did not start on :3006");
});

test.afterAll(() => {
  if (harness?.pid) {
    try {
      process.kill(-harness.pid);
    } catch {
      // Already gone.
    }
  }
});

const h1 = (page: Page) => page.getByRole("heading", { level: 1 });
const signInButton = (page: Page) =>
  page.getByRole("button", { name: "Sign in", exact: true });

// Walk the doctor journey from the current sign-in page to the destination.
// ADR 0040: MFA is opt-in, so the default demo doctor goes straight from the
// prefilled credentials to clinic selection; ?demo-mfa= specs cover the
// step-up path.
async function completeDoctorSignIn(page: Page) {
  await signInButton(page).click();
}

test.describe("auth-ui journeys (mount harness)", () => {
  test("doctor multi-clinic journey lands on the work home", async ({ page }) => {
    await page.goto(`${BASE}/en-HK/sign-in`);
    await expect(h1(page)).toHaveText("Sign in to Acuity");
    await completeDoctorSignIn(page);
    await expect(h1(page)).toHaveText("Which clinic today?", { timeout: 15_000 });
    await expect(page.getByRole("radio")).toHaveCount(2);
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await page.waitForURL(`${BASE}/en-HK/forms`, { timeout: 20_000 });
    await expect(h1(page)).toHaveText("Work home");
  });

  test("single-clinic doctor lands directly (no clinic step)", async ({ page }) => {
    await page.goto(`${BASE}/en-HK/sign-in?demo-account=dr2188`);
    await completeDoctorSignIn(page);
    await page.waitForURL(`${BASE}/en-HK/forms`, { timeout: 20_000 });
    await expect(h1(page)).toHaveText("Work home");
  });

  test("middleware gates a protected route and the deep link returns", async ({
    page,
  }) => {
    await page.goto(`${BASE}/en-HK/forms`);
    await page.waitForURL(/\/en-HK\/sign-in\?reason=unauthenticated&from=%2Fforms/);
    await expect(h1(page)).toHaveText("Sign in to Acuity");
    await completeDoctorSignIn(page);
    await expect(h1(page)).toHaveText("Which clinic today?", { timeout: 15_000 });
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await page.waitForURL(`${BASE}/en-HK/forms`, { timeout: 20_000 });
  });

  test("session-expired entry renders the calm info note", async ({ page }) => {
    await page.goto(`${BASE}/en-HK/sign-in?reason=expired`);
    await expect(
      page.getByText("signed you out to keep things safe", { exact: false }),
    ).toBeVisible();
  });

  test("session expiry on a protected page re-enters and returns", async ({
    page,
  }) => {
    await page.goto(`${BASE}/en-HK/sign-in`);
    await completeDoctorSignIn(page);
    await expect(h1(page)).toHaveText("Which clinic today?", { timeout: 15_000 });
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await page.waitForURL(`${BASE}/en-HK/forms`, { timeout: 20_000 });
    await page
      .getByRole("button", { name: "Simulate session expiry", exact: true })
      .click();
    await page.waitForURL(/\/en-HK\/sign-in\?reason=expired&from=%2Fforms/, {
      timeout: 15_000,
    });
    await expect(
      page.getByText("signed you out to keep things safe", { exact: false }),
    ).toBeVisible();
    await completeDoctorSignIn(page);
    await expect(h1(page)).toHaveText("Which clinic today?", { timeout: 15_000 });
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await page.waitForURL(`${BASE}/en-HK/forms`, { timeout: 20_000 });
  });

  test("wrong credentials render the recoverable error note", async ({ page }) => {
    await page.goto(`${BASE}/en-HK/sign-in?demo-account=nobody`);
    await signInButton(page).click();
    await expect(
      page.getByText("That didn't match", { exact: false }),
    ).toBeVisible({ timeout: 15_000 });
    await expect(h1(page)).toHaveText("Sign in to Acuity");
  });

  test("locked account renders the calm warning note", async ({ page }) => {
    await page.goto(`${BASE}/en-HK/sign-in?demo-account=dr.locked`);
    await signInButton(page).click();
    await expect(
      page.getByText("paused for safety", { exact: false }),
    ).toBeVisible({ timeout: 15_000 });
  });

  test("network failure renders the network-error note", async ({ page }) => {
    await page.goto(`${BASE}/en-HK/sign-in?demo-scenario=network-error`);
    await signInButton(page).click();
    await expect(
      page.getByText("can't reach Acuity", { exact: false }),
    ).toBeVisible({ timeout: 15_000 });
  });

  test("failed MFA is recoverable: note, then retry proceeds", async ({ page }) => {
    await page.goto(`${BASE}/en-HK/sign-in?demo-mfa=fail`);
    await signInButton(page).click();
    await expect(h1(page)).toHaveText("One more step", { timeout: 15_000 });
    await page.getByRole("button", { name: "Confirm", exact: true }).click();
    await expect(
      page.getByText("didn't go through", { exact: false }),
    ).toBeVisible({ timeout: 15_000 });
    await page.getByRole("button", { name: "Confirm", exact: true }).click();
    await expect(h1(page)).toHaveText("Which clinic today?", { timeout: 15_000 });
  });

  test("expired MFA resets the challenge with the calm note", async ({ page }) => {
    await page.goto(`${BASE}/en-HK/sign-in?demo-mfa=expired`);
    await signInButton(page).click();
    await expect(h1(page)).toHaveText("One more step", { timeout: 15_000 });
    await page.getByRole("button", { name: "Confirm", exact: true }).click();
    await expect(
      page.getByText("took a little too long", { exact: false }),
    ).toBeVisible({ timeout: 15_000 });
    await expect(h1(page)).toHaveText("One more step");
  });

  test("recovery is deliberate and confirms it started", async ({ page }) => {
    await page.goto(`${BASE}/en-HK/sign-in`);
    await page.getByRole("button", { name: "Lost your device?" }).click();
    await expect(h1(page)).toHaveText("Lost your device?");
    await page.getByRole("button", { name: "Start recovery", exact: true }).click();
    await expect(
      page.getByText("Recovery started", { exact: false }),
    ).toBeVisible({ timeout: 15_000 });
    await page.getByRole("button", { name: "Back to sign in" }).click();
    await expect(h1(page)).toHaveText("Sign in to Acuity");
  });

  test("sign-out POSTs through the adapter and re-gates the app", async ({
    page,
  }) => {
    await page.goto(`${BASE}/en-HK/sign-in?demo-account=dr2188`);
    await completeDoctorSignIn(page);
    await page.waitForURL(`${BASE}/en-HK/forms`, { timeout: 20_000 });
    const logoutPost = page.waitForRequest(
      (request) =>
        request.url().includes("/api/auth/logout") && request.method() === "POST",
    );
    await page.getByRole("button", { name: "Sign out", exact: true }).click();
    await logoutPost;
    await page.waitForURL(`${BASE}/en-HK/sign-in`, { timeout: 15_000 });
    // The session marker is cleared: the protected route gates again.
    await page.goto(`${BASE}/en-HK/forms`);
    await page.waitForURL(/\/en-HK\/sign-in\?reason=unauthenticated/, {
      timeout: 15_000,
    });
  });

  test("operator journey: host signal, LD3 key steps, console landing", async ({
    page,
  }) => {
    await page.goto(`${BASE}/en-HK/operator/sign-in`);
    await expect(page.getByText("OPERATOR CONSOLE")).toBeVisible();
    await expect(page.getByText("console.acuity.hk")).toBeVisible();
    await expect(h1(page)).toHaveText("Operator sign-in");
    await signInButton(page).click();
    await expect(h1(page)).toHaveText("Confirm with your security key", {
      timeout: 15_000,
    });
    await expect(page.getByText("Insert your key")).toBeVisible();
    await page
      .getByRole("button", { name: "Simulate key touch", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Waiting for your key", exact: true }),
    ).toBeVisible();
    await page.waitForURL(`${BASE}/en-HK/clinics`, { timeout: 25_000 });
    await expect(h1(page)).toHaveText("Clinics portfolio");
  });

  test("a doctor session presented to the console is rejected outright", async ({
    page,
  }) => {
    await page.goto(`${BASE}/en-HK/operator/sign-in?demo-account=dr2207`);
    await signInButton(page).click();
    await expect(
      page.getByText("This is the operator console", { exact: false }),
    ).toBeVisible({ timeout: 15_000 });
    await page.getByRole("button", { name: "Back to sign in" }).click();
    await expect(h1(page)).toHaveText("Operator sign-in");
  });

  test("zh-Hant-HK renders and the toggle swaps copy in place mid-flow", async ({
    page,
  }) => {
    await page.goto(`${BASE}/zh-Hant-HK/sign-in`);
    await expect(h1(page)).toHaveText("登入 Acuity");
    await page.getByRole("button", { name: "English", exact: true }).click();
    await expect(h1(page)).toHaveText("Sign in to Acuity");
    expect(page.url()).toContain("/en-HK/sign-in");
    // Mid-flow: advance to the clinic step, then toggle — the step holds.
    await signInButton(page).click();
    await expect(h1(page)).toHaveText("Which clinic today?", { timeout: 15_000 });
    await page.getByRole("button", { name: "中文", exact: true }).click();
    await expect(h1(page)).toHaveText("今天在哪一間診所？");
    expect(page.url()).toContain("/zh-Hant-HK/sign-in");
  });

  test("doctor sign-in has no critical axe violations", async ({ page }) => {
    await page.goto(`${BASE}/en-HK/sign-in`);
    await page.waitForLoadState("networkidle");
    const results = await new AxeBuilder({ page }).analyze();
    const critical = results.violations.filter(
      (violation) => violation.impact === "critical",
    );
    expect(
      critical.map((v) => `${v.id}: ${v.help} (${v.nodes.length} nodes)`),
      "critical axe violations",
    ).toEqual([]);
  });
});
