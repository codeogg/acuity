import { expect, test } from "@playwright/test";

// Public-site contact journey: Phase 1 contact is channels-only (WhatsApp /
// demo / email links) with NO submittable form, and every off-site channel
// routes through the calm hand-off toast before opening.

const BASE = "http://localhost:3001";
const LOCALES = ["en-HK", "zh-Hant-HK"] as const;

const CHANNELS = {
  whatsapp: "https://wa.me/85291234567",
  demo: "https://calendly.com/acuity-hk/20min",
  email: "mailto:hello@acuity.hk",
};

test.describe("site contact journey", () => {
  for (const locale of LOCALES) {
    test(`channels present, no form (${locale})`, async ({ page }) => {
      await page.goto(`${BASE}/${locale}/contact`);

      // three channel links with the canonical destinations
      const main = page.locator("main");
      await expect(
        main.locator(`a[href="${CHANNELS.whatsapp}"]`).first(),
      ).toBeVisible();
      await expect(main.locator(`a[href="${CHANNELS.demo}"]`).first()).toBeVisible();
      await expect(main.locator(`a[href="${CHANNELS.email}"]`).first()).toBeVisible();

      // Phase 1 excludes the submittable message form entirely
      await expect(page.locator("main form")).toHaveCount(0);
      await expect(page.locator("main textarea")).toHaveCount(0);
    });
  }

  test("off-site hand-off shows the calm toast, then opens the channel", async ({
    page,
  }) => {
    await page.goto(`${BASE}/en-HK/contact`);

    // capture window.open instead of letting a real tab open
    await page.evaluate(() => {
      const w = window as unknown as { __opened: string[] };
      w.__opened = [];
      window.open = ((url?: string | URL) => {
        w.__opened.push(String(url));
        return null;
      }) as typeof window.open;
    });

    await page
      .locator(`main a[href="${CHANNELS.whatsapp}"]`)
      .first()
      .click();

    const toast = page.getByRole("status");
    await expect(toast).toContainText(/Opening WhatsApp/i);
    await expect
      .poll(async () =>
        page.evaluate(() => (window as unknown as { __opened: string[] }).__opened),
      )
      .toContain(CHANNELS.whatsapp);
  });

  test("footer channels hand off too", async ({ page }) => {
    await page.goto(`${BASE}/en-HK`);
    await page.evaluate(() => {
      window.open = (() => null) as typeof window.open;
    });
    await page.locator(`footer a[href="${CHANNELS.demo}"]`).click();
    await expect(page.getByRole("status")).toContainText(/demo calendar/i);
  });
});
