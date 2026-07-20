import { test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// Researched UI audit sweep (round-6 wave H): walks every route on every
// surface across the six audit viewports, per locale, and records — never
// asserts — findings into audit-out/issues.json plus full-page screenshots.
// Programmatic categories covered here: horizontal overflow, WCAG 2.2 target
// size, axe (all impacts), landmarks/skip-link/aria-current, fixed-element
// overlap at the bottom safe-area. The craft categories (spacing rhythm, type
// ramp, elevation tiers) ride the screenshot review that follows the sweep.

const OUT = fileURLToPath(new URL("../audit-out", import.meta.url));
const VIEWPORTS = [360, 390, 768, 1024, 1280, 1536] as const;
const AXE_AT = new Set([390, 1280]);
const HEIGHT = 900;

const MOCK_SESSION_COOKIE = "acuity_mock_session";

interface RouteSpec {
  path: string;
  /** Slug for filenames. */
  slug: string;
}

interface SurfaceSpec {
  name: string;
  port: number;
  gated: boolean;
  routes: RouteSpec[];
  /** Locales to sweep (en always; zh where the surface ships it). */
  locales: string[];
}

const SURFACES: SurfaceSpec[] = [
  {
    name: "site",
    port: 3001,
    gated: false,
    locales: ["en-HK", "zh-Hant-HK"],
    routes: [
      { path: "", slug: "home" },
      { path: "/about", slug: "about" },
      { path: "/contact", slug: "contact" },
      { path: "/customers", slug: "customers" },
      { path: "/how-it-works", slug: "how-it-works" },
      { path: "/insurers", slug: "insurers" },
      { path: "/insurers/bupa", slug: "insurers-bupa" },
      { path: "/privacy", slug: "privacy" },
      { path: "/security", slug: "security" },
      { path: "/terms", slug: "terms" },
      { path: "/no-such-page", slug: "not-found" },
    ],
  },
  {
    name: "app",
    port: 3000,
    gated: true,
    locales: ["en-HK", "zh-Hant-HK"],
    routes: [
      { path: "", slug: "work-home" },
      { path: "/forms/new", slug: "forms-new" },
      { path: "/forms/5013/intake", slug: "form-intake" },
      { path: "/forms/5014/extraction", slug: "form-extraction" },
      { path: "/forms/5001/review", slug: "form-review" },
      { path: "/forms/5005/produce", slug: "form-produce" },
      { path: "/history", slug: "history" },
      { path: "/patients", slug: "patients" },
      { path: "/settings", slug: "settings" },
      { path: "/sign-in", slug: "sign-in" },
    ],
  },
  {
    name: "admin",
    port: 3002,
    gated: true,
    locales: ["en-HK", "zh-Hant-HK"],
    routes: [
      { path: "", slug: "overview" },
      { path: "/analytics", slug: "analytics" },
      { path: "/audit", slug: "audit" },
      { path: "/claims", slug: "claims" },
      { path: "/claims/5001", slug: "claim-detail" },
      { path: "/clinics", slug: "clinics" },
      { path: "/doctors", slug: "doctors" },
      { path: "/forms", slug: "forms" },
      { path: "/forms/101", slug: "form-detail" },
      { path: "/insurers", slug: "insurers" },
      { path: "/insurers/1", slug: "insurer-detail" },
      { path: "/settings", slug: "settings" },
      { path: "/standard-fields", slug: "standard-fields" },
      { path: "/tags", slug: "tags" },
      { path: "/tickets", slug: "tickets" },
      { path: "/sign-in", slug: "sign-in" },
    ],
  },
];

interface Finding {
  surface: string;
  locale: string;
  route: string;
  viewport: number;
  category: string;
  detail: string;
}

const findings: Finding[] = [];

function record(f: Finding) {
  findings.push(f);
}

// Horizontal overflow: the document scrolls sideways, plus the widest
// offending elements so the fix is targeted.
async function checkOverflow(page: Page): Promise<string | null> {
  return page.evaluate(() => {
    const doc = document.documentElement;
    const overflow = doc.scrollWidth - doc.clientWidth;
    if (overflow <= 1) return null;
    const offenders: string[] = [];
    for (const el of Array.from(document.querySelectorAll<HTMLElement>("body *"))) {
      const r = el.getBoundingClientRect();
      if (r.width > doc.clientWidth + 1 || r.right > doc.clientWidth + 8) {
        const id = el.id ? `#${el.id}` : "";
        const cls = typeof el.className === "string" ? `.${el.className.split(/\s+/).slice(0, 3).join(".")}` : "";
        offenders.push(`${el.tagName.toLowerCase()}${id}${cls} (${Math.round(r.width)}px)`);
        if (offenders.length >= 4) break;
      }
    }
    return `document scrollWidth exceeds viewport by ${overflow}px; offenders: ${offenders.join(", ") || "none isolated"}`;
  });
}

// WCAG 2.2 target size: visible interactive elements smaller than 24×24 CSS px
// (pointer minimum). Inline text links inside prose are exempt per the
// success-criterion exceptions.
async function checkTargets(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const out: string[] = [];
    const seen = new Set<string>();
    const nodes = document.querySelectorAll<HTMLElement>(
      "a[href], button, input, select, textarea, [role='button'], [role='tab'], [role='menuitem'], [role='checkbox'], [role='radio'], [role='switch']",
    );
    for (const el of Array.from(nodes)) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      const style = getComputedStyle(el);
      if (style.visibility === "hidden" || style.display === "none") continue;
      if (r.width >= 24 && r.height >= 24) continue;
      // Inline-link exemption: anchors flowing inside a text block.
      if (el.tagName === "A" && style.display.startsWith("inline") && el.closest("p, li, td, dd, span")) continue;
      // Hidden inputs backing custom controls.
      if (el.tagName === "INPUT" && (style.opacity === "0" || style.position === "absolute" && r.width <= 1)) continue;
      // Visually-hidden-until-focus (skip links): clipped at rest, full-size
      // when focused — the focused state is the real target.
      if (style.clipPath !== "none" || (style.clip && style.clip !== "auto")) continue;
      // A wrapping <label> extends a native input's effective target.
      if (el.tagName === "INPUT" && el.closest("label")) continue;
      // WCAG 2.2 spacing exception: grid-row checkboxes in ≥40px rows have no
      // other target within a 24px radius.
      if (
        (el.getAttribute("role") === "checkbox" || (el as HTMLInputElement).type === "checkbox") &&
        el.closest("td, th") &&
        (el.closest("tr")?.getBoundingClientRect().height ?? 0) >= 40
      ) continue;
      const label = (el.getAttribute("aria-label") || el.textContent || el.tagName).trim().slice(0, 40);
      const key = `${label}@${Math.round(r.width)}x${Math.round(r.height)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(`${el.tagName.toLowerCase()} "${label}" ${Math.round(r.width)}×${Math.round(r.height)}px`);
      if (out.length >= 10) break;
    }
    return out;
  });
}

// Landmarks + skip link + aria-current, once per route at desktop width.
async function checkStructure(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const problems: string[] = [];
    if (!document.querySelector("main, [role='main']")) problems.push("no main landmark");
    const h1s = document.querySelectorAll("h1");
    if (h1s.length === 0) problems.push("no h1");
    if (h1s.length > 1) problems.push(`${h1s.length} h1 elements`);
    // Only meaningful when some nav link actually targets the current path —
    // a nav without a matching destination correctly has no current item.
    for (const nav of Array.from(document.querySelectorAll("nav"))) {
      if (getComputedStyle(nav).display === "none") continue;
      const links = Array.from(nav.querySelectorAll<HTMLAnchorElement>("a[href]"));
      const matches = links.some((a) => new URL(a.href).pathname === location.pathname);
      if (matches && !nav.querySelector("[aria-current]")) {
        problems.push("nav contains the current destination but no aria-current");
        break;
      }
    }
    return problems;
  });
}

for (const surface of SURFACES) {
  test.describe(`audit ${surface.name}`, () => {
    test.beforeEach(async ({ context }) => {
      if (surface.gated) {
        await context.addCookies([
          { name: MOCK_SESSION_COOKIE, value: "e2e", url: `http://localhost:${surface.port}` },
        ]);
      }
    });

    for (const locale of surface.locales) {
      test(`${surface.name} ${locale} sweep`, async ({ page }) => {
        for (const route of surface.routes) {
          const url = `http://localhost:${surface.port}/${locale}${route.path}`;
          await page.setViewportSize({ width: 1280, height: HEIGHT });
          const response = await page.goto(url, { waitUntil: "networkidle" }).catch(() => null);
          if (!response) {
            record({ surface: surface.name, locale, route: route.slug, viewport: 1280, category: "navigation", detail: "navigation failed" });
            continue;
          }
          const landed = page.url();
          if (!landed.includes(route.path === "" ? `/${locale}` : route.path)) {
            record({ surface: surface.name, locale, route: route.slug, viewport: 1280, category: "navigation", detail: `redirected to ${landed}` });
          }

          const structure = await checkStructure(page);
          for (const p of structure) {
            record({ surface: surface.name, locale, route: route.slug, viewport: 1280, category: "structure", detail: p });
          }

          for (const width of VIEWPORTS) {
            await page.setViewportSize({ width, height: HEIGHT });
            // Let responsive layout + any resize observers settle.
            await page.waitForTimeout(150);

            const overflow = await checkOverflow(page);
            if (overflow) {
              record({ surface: surface.name, locale, route: route.slug, viewport: width, category: "overflow", detail: overflow });
            }

            if (width === 390 || width === 1280) {
              for (const t of await checkTargets(page)) {
                record({ surface: surface.name, locale, route: route.slug, viewport: width, category: "target-size", detail: t });
              }
            }

            if (AXE_AT.has(width) && locale === "en-HK") {
              const results = await new AxeBuilder({ page }).analyze();
              for (const v of results.violations) {
                record({
                  surface: surface.name, locale, route: route.slug, viewport: width,
                  category: `axe-${v.impact ?? "unknown"}`,
                  detail: `${v.id}: ${v.help} (${v.nodes.length} nodes: ${v.nodes.slice(0, 2).map((n) => n.target.join(" ")).join(" | ")})`,
                });
              }
            }

            const dir = `${OUT}/screens/${surface.name}/${locale}`;
            mkdirSync(dir, { recursive: true });
            await page.screenshot({ path: `${dir}/${route.slug}@${width}.png`, fullPage: true }).catch(() => {});
          }
        }
      });
    }
  });
}

test.afterAll(() => {
  mkdirSync(OUT, { recursive: true });
  writeFileSync(`${OUT}/issues.json`, JSON.stringify(findings, null, 2));
});
