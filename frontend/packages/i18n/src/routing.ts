import { defineRouting } from "next-intl/routing";

// The one bilingual routing definition every surface shares. English
// (Hong Kong) is the default locale; Traditional Chinese (Hong Kong) is the
// second. Full catalog parity between the two is enforced by
// scripts/check-i18n.mjs; Simplified Chinese is never shipped.
export const locales = ["en-HK", "zh-Hant-HK"] as const;
export const defaultLocale = "en-HK" as const;

export const routing = defineRouting({
  locales,
  defaultLocale,
});

export type Locale = (typeof routing.locales)[number];
