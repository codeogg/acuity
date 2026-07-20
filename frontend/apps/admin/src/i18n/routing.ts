// Thin shim over the shared i18n package: one routing definition for every
// surface (en-HK default + zh-Hant-HK). Kept at this path so app-local
// imports (`@/i18n/routing`) and the next-intl plugin wiring stay stable.
export { routing, locales, defaultLocale } from "@acuity/i18n";
export type { Locale } from "@acuity/i18n";
