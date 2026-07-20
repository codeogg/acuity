import type { Metadata } from "next";
import { locales, defaultLocale } from "@acuity/i18n";

// Bilingual-parity SEO helpers (per the utility requirements): every page
// declares reciprocal hreflang alternates plus an x-default pointing at the
// default locale, a per-locale canonical URL, and per-locale Open Graph
// metadata. The canonical origin is env-configurable; the fallback is the
// production host.

export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://acuity.hk";

// Open Graph locale tags (ll_CC form): Traditional Chinese for Hong Kong is
// conventionally zh_HK.
const OG_LOCALE: Record<string, string> = {
  "en-HK": "en_HK",
  "zh-Hant-HK": "zh_HK",
};

function alternateLanguages(path: string): Record<string, string> {
  const languages: Record<string, string> = {};
  for (const locale of locales) {
    languages[locale] = `${SITE_URL}/${locale}${path}`;
  }
  languages["x-default"] = `${SITE_URL}/${defaultLocale}${path}`;
  return languages;
}

/** hreflang alternates for a locale-relative path ("" for home, "/insurers", ...). */
export function pageAlternates(path: string): Metadata["alternates"] {
  return { languages: alternateLanguages(path) };
}

/**
 * Shared page metadata: title/description, per-locale canonical, reciprocal
 * hreflang alternates, and per-locale Open Graph (no og:image is declared —
 * the site ships no imagery and fabricates none).
 */
export function pageMetadata({
  locale,
  path,
  title,
  description,
}: {
  locale: string;
  path: string;
  title: string;
  description?: string;
}): Metadata {
  const url = `${SITE_URL}/${locale}${path}`;
  return {
    metadataBase: new URL(SITE_URL),
    title,
    description,
    alternates: {
      canonical: url,
      languages: alternateLanguages(path),
    },
    openGraph: {
      type: "website",
      siteName: "Acuity",
      title,
      description,
      url,
      locale: OG_LOCALE[locale] ?? OG_LOCALE[defaultLocale],
      alternateLocale: locales
        .filter((l) => l !== locale)
        .flatMap((l) => OG_LOCALE[l] ?? []),
    },
  };
}
