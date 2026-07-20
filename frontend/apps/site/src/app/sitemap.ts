import type { MetadataRoute } from "next";
import { locales, defaultLocale } from "@acuity/i18n";
import { SITE_URL } from "@/lib/seo";

// Bilingual sitemap: every public route, once per locale, each entry carrying
// the reciprocal hreflang alternates (+ x-default via the default locale).
const ROUTES = [
  "",
  "/how-it-works",
  "/insurers",
  "/insurers/bupa",
  "/customers",
  "/about",
  "/contact",
  "/security",
  "/privacy",
  "/terms",
];

export default function sitemap(): MetadataRoute.Sitemap {
  return ROUTES.flatMap((route) => {
    const languages: Record<string, string> = {};
    for (const locale of locales) {
      languages[locale] = `${SITE_URL}/${locale}${route}`;
    }
    languages["x-default"] = `${SITE_URL}/${defaultLocale}${route}`;
    return locales.map((locale) => ({
      url: `${SITE_URL}/${locale}${route}`,
      alternates: { languages },
    }));
  });
}
