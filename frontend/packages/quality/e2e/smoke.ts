import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

// Shared smoke assertions for one app surface:
//   - both locales render (200 + a visible level-1 heading + correct <html lang>)
//   - no console or page errors during render
//   - the brand title font (Fraunces) is actually active on the heading
//   - the representative page passes an axe scan (no critical violations)

// Presence-only mock-session marker; mirrors MOCK_SESSION_COOKIE in
// packages/auth-ui/src/mount/config.ts (the e2e harness stays decoupled from
// the Next-importing package internals). Session-gated surfaces need it
// seeded before direct navigation; the dedicated *-auth-journeys specs prove
// the real journey, everything else rides this seeded session.
export const MOCK_SESSION_COOKIE = "acuity_mock_session";

export async function seedMockSession(context: BrowserContext, port: number) {
  await context.addCookies([
    {
      name: MOCK_SESSION_COOKIE,
      value: "e2e",
      url: `http://localhost:${port}`,
    },
  ]);
}

export interface Surface {
  name: string;
  port: number;
  // Path of the representative page, locale-relative (usually "").
  path?: string;
  // Whether the surface loads the brand webfonts today. Flip to true as the
  // shared webfont module lands on each surface.
  brandFontReady: boolean;
  // Whether the surface enforces the session gate on direct navigation in
  // mock mode (then the smoke seeds the mock-session marker first).
  sessionGated?: boolean;
  // Console messages to tolerate (dev-server noise, MSW lifecycle logs).
  allowConsole?: RegExp[];
}

const LOCALES = ["en-HK", "zh-Hant-HK"] as const;

const DEFAULT_ALLOWED = [
  /\[MSW\]/i,
  /Download the React DevTools/i,
  /mockServiceWorker/i,
  // Next dev overlay/network noise that is not an app defect.
  /Failed to load resource: the server responded with a status of 404/i,
];

function collectErrors(page: Page, allowed: RegExp[]): string[] {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    const text = message.text();
    if (allowed.some((re) => re.test(text))) return;
    errors.push(text);
  });
  page.on("pageerror", (error) => {
    errors.push(String(error));
  });
  return errors;
}

export function smokeSurface(surface: Surface) {
  const allowed = [...DEFAULT_ALLOWED, ...(surface.allowConsole ?? [])];
  const base = `http://localhost:${surface.port}`;

  test.describe(`${surface.name} smoke`, () => {
    test.beforeEach(async ({ context }) => {
      if (surface.sessionGated) await seedMockSession(context, surface.port);
    });

    for (const locale of LOCALES) {
      test(`renders ${locale} without console errors`, async ({ page }) => {
        const errors = collectErrors(page, allowed);
        const response = await page.goto(
          `${base}/${locale}${surface.path ?? ""}`,
        );
        expect(response, "navigation response").toBeTruthy();
        expect(response!.status(), "HTTP status").toBeLessThan(400);

        await expect(page.locator("html")).toHaveAttribute("lang", locale);
        await expect(
          page.getByRole("heading", { level: 1 }).first(),
        ).toBeVisible();

        // Give client bootstrap (MSW worker, hydration) a beat to surface
        // any errors before asserting.
        await page.waitForLoadState("networkidle");
        expect(errors, "console/page errors").toEqual([]);
      });
    }

    test("brand title font (Fraunces) is active", async ({ page }) => {
      test.skip(
        !surface.brandFontReady,
        "surface does not load the brand webfonts yet; flip brandFontReady when the shared webfont module lands here",
      );
      await page.goto(`${base}/en-HK${surface.path ?? ""}`);
      await page.evaluate(() => document.fonts.ready);
      const heading = page.getByRole("heading", { level: 1 }).first();
      await expect(heading).toBeVisible();
      const fontFamily = await heading.evaluate(
        (el) => getComputedStyle(el).fontFamily,
      );
      expect(fontFamily).toMatch(/Fraunces/i);
    });

    test("axe scan has no critical violations", async ({ page }) => {
      await page.goto(`${base}/en-HK${surface.path ?? ""}`);
      await page.waitForLoadState("networkidle");
      const results = await new AxeBuilder({ page }).analyze();
      const critical = results.violations.filter(
        (violation) => violation.impact === "critical",
      );
      expect(
        critical.map((v) => `${v.id}: ${v.help} (${v.nodes.length} nodes)`),
        "critical axe violations",
      ).toEqual([]);
      // Non-critical findings are informational until the surfaces finish
      // foundation adoption; they are attached for triage, not asserted.
      const rest = results.violations.filter(
        (violation) => violation.impact !== "critical",
      );
      if (rest.length > 0) {
        test.info().attachments.push({
          name: "axe-non-critical",
          contentType: "application/json",
          body: Buffer.from(JSON.stringify(rest, null, 2)),
        });
      }
    });
  });
}
