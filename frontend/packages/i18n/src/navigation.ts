import { createNavigation } from "next-intl/navigation";
import { routing } from "./routing";

// Locale-aware navigation wrappers. Link/usePathname/useRouter transparently
// carry the active [locale] segment, so internal hrefs are written without it
// (e.g. "/insurers") and a locale toggle can swap locale on the same path.
export const { Link, redirect, usePathname, useRouter, getPathname } =
  createNavigation(routing);
