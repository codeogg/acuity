// @acuity/i18n — the shared bilingual i18n foundation. Client-safe surface
// (routing constants + formatting helpers). Server-only pieces live under the
// subpath exports: ./request (request-config factory), ./middleware
// (middleware factory), ./navigation (locale-aware Link/router wrappers).

export { routing, locales, defaultLocale } from "./routing";
export type { Locale } from "./routing";

export * from "./format";
