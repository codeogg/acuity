import { expect, test } from "@playwright/test";

// Nav completeness: every internal destination reachable from the header and
// footer resolves (< 400) in both locales, and the external concierge
// channels carry the canonical hrefs.

const BASE = "http://localhost:3001";
const LOCALES = ["en-HK", "zh-Hant-HK"] as const;

const INTERNAL = [
  "/",
  "/how-it-works",
  "/insurers",
  "/customers",
  "/security",
  "/about",
  "/contact",
  "/privacy",
  "/terms",
];

const EXTERNAL = [
  "https://wa.me/85291234567",
  "https://calendly.com/acuity-hk/20min",
  "mailto:hello@acuity.hk",
];

test.describe("site nav completeness", () => {
  for (const locale of LOCALES) {
    test(`header + footer destinations resolve (${locale})`, async ({ page }) => {
      await page.goto(`${BASE}/${locale}`);

      // collect the chrome's internal hrefs
      const hrefs = await page
        .locator("header a[href], footer a[href]")
        .evaluateAll((els) =>
          els
            .map((el) => el.getAttribute("href") ?? "")
            .filter((href) => href.startsWith("/")),
        );

      // every canonical destination is present in the chrome
      for (const route of INTERNAL) {
        const expected = `/${locale}${route === "/" ? "" : route}`;
        expect(hrefs, `chrome links to ${expected}`).toContain(expected);
      }

      // and every linked destination actually resolves
      const unique = [...new Set(hrefs)];
      for (const href of unique) {
        const response = await page.request.get(`${BASE}${href}`);
        expect(response.status(), `GET ${href}`).toBeLessThan(400);
      }
    });

    test(`external channels carry canonical hrefs (${locale})`, async ({ page }) => {
      await page.goto(`${BASE}/${locale}`);
      for (const href of EXTERNAL) {
        await expect(
          page.locator(`footer a[href="${href}"]`),
          `footer carries ${href}`,
        ).toHaveCount(1);
      }
    });
  }

  test("unknown routes render the localised 404", async ({ page }) => {
    const response = await page.goto(`${BASE}/en-HK/no-such-page`);
    expect(response?.status()).toBe(404);
    await expect(page.getByRole("heading", { level: 1 })).toContainText(
      /That page isn't here/i,
    );
    // 404 keeps the site chrome
    await expect(page.locator("header")).toBeVisible();
    await expect(page.locator("footer")).toBeVisible();
  });
});
