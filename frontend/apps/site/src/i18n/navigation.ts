// Thin shim over the shared i18n package: locale-aware navigation wrappers.
// Link/usePathname/useRouter transparently carry the active [locale] segment,
// so internal hrefs are written without it (e.g. "/insurers") and the locale
// toggle can swap locale on the same path.
export {
  Link,
  redirect,
  usePathname,
  useRouter,
  getPathname,
} from "@acuity/i18n/navigation";
