import { createLocaleRequestConfig } from "@acuity/i18n/request";

// Thin shim over the shared i18n package: locale resolution and fallback are
// shared; the message catalogs stay app-local, so this app passes its own
// loader.
export default createLocaleRequestConfig(
  (locale) => import(`../../messages/${locale}.json`),
);
