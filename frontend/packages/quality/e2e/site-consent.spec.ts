import { expect, test } from "@playwright/test";

// Cookie-consent behaviour: the prompt appears on marketing pages, never on
// the cookie-less Security/Contact pages, and both decisions persist locally.

const BASE = "http://localhost:3001";

test.describe("site cookie consent", () => {
  test("prompt shows on marketing pages and accept persists", async ({ page }) => {
    await page.goto(`${BASE}/en-HK`);
    const dialog = page.getByRole("dialog", { name: /cookie/i });
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText(/minimal analytics/i);

    await dialog.getByRole("button", { name: /accept analytics/i }).click();
    await expect(dialog).toBeHidden();

    expect(
      await page.evaluate(() => localStorage.getItem("acuity_consent")),
    ).toBe("accept");

    await page.reload();
    await expect(page.getByRole("dialog", { name: /cookie/i })).toHaveCount(0);
  });

  test("decline persists too", async ({ page }) => {
    await page.goto(`${BASE}/en-HK/about`);
    const dialog = page.getByRole("dialog", { name: /cookie/i });
    await dialog.getByRole("button", { name: /decline/i }).click();
    expect(
      await page.evaluate(() => localStorage.getItem("acuity_consent")),
    ).toBe("decline");
    await page.reload();
    await expect(page.getByRole("dialog", { name: /cookie/i })).toHaveCount(0);
  });

  test("security and contact pages are cookie-less (no prompt)", async ({ page }) => {
    await page.goto(`${BASE}/en-HK/security`);
    await expect(page.getByRole("dialog", { name: /cookie/i })).toHaveCount(0);
    await page.goto(`${BASE}/en-HK/contact`);
    await expect(page.getByRole("dialog", { name: /cookie/i })).toHaveCount(0);
  });

  test("localised prompt on the zh locale", async ({ page }) => {
    await page.goto(`${BASE}/zh-Hant-HK`);
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("button", { name: "接受分析" })).toBeVisible();
  });
});
