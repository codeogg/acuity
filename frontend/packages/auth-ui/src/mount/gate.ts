// The pure session-gate decision behind createAuthMiddleware — no Next.js
// imports, so the guard logic is unit-testable outside the edge runtime.

import { defaultLocale, locales } from "@acuity/i18n/routing";
import { isInternalPath } from "../journey/logic";

export interface AuthGateConfig {
  // Locale-relative sign-in path (always public).
  signInPath: string;
  // Additional public path prefixes ("/" matches the root exactly).
  publicPaths?: readonly string[];
}

export type AuthGateDecision =
  | { action: "allow" }
  | { action: "redirect"; to: string };

// Split "/en-HK/forms" into { locale: "en-HK", rest: "/forms" }; paths with
// no locale segment resolve against the default locale.
export function splitLocalePath(pathname: string): {
  locale: string;
  rest: string;
} {
  const segments = pathname.split("/");
  const first = segments[1] ?? "";
  if ((locales as readonly string[]).includes(first)) {
    const rest = `/${segments.slice(2).join("/")}`;
    return { locale: first, rest: rest === "//" ? "/" : rest };
  }
  return { locale: defaultLocale, rest: pathname || "/" };
}

function isPublicPath(rest: string, config: AuthGateConfig): boolean {
  if (rest === config.signInPath || rest.startsWith(`${config.signInPath}/`)) {
    return true;
  }
  for (const prefix of config.publicPaths ?? []) {
    if (rest === prefix) return true;
    if (prefix !== "/" && rest.startsWith(`${prefix}/`)) return true;
  }
  return false;
}

// Presence-only decision: unauthenticated requests to protected paths
// redirect to sign-in BEFORE the route renders, preserving the requested
// internal path as `from=` for the deep-link exchange.
export function authGateDecision(
  pathname: string,
  hasSession: boolean,
  config: AuthGateConfig,
): AuthGateDecision {
  const { locale, rest } = splitLocalePath(pathname);
  if (hasSession || isPublicPath(rest, config)) return { action: "allow" };
  const query = new URLSearchParams({ reason: "unauthenticated" });
  if (rest !== "/" && isInternalPath(rest)) query.set("from", rest);
  return {
    action: "redirect",
    to: `/${locale}${config.signInPath}?${query.toString()}`,
  };
}
