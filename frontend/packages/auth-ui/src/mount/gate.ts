// The pure session-gate decision behind createAuthMiddleware — no Next.js
// imports, so the guard logic is unit-testable outside the edge runtime.

import { defaultLocale, locales } from "@acuity/i18n/routing";
import { isInternalPath } from "../journey/logic";
import type { AuthSurface } from "./config";

export interface AuthGateConfig {
  // Locale-relative sign-in path (always public).
  signInPath: string;
  // Additional public path prefixes ("/" matches the root exactly).
  publicPaths?: readonly string[];
  // When set, a JWT whose role is outside this list is treated as no session.
  allowedRoles?: readonly string[];
  /** Which httpOnly session cookie this app owns (admin vs doctor isolation). */
  surface?: AuthSurface;
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
// redirect to sign-in BEFORE any protected route renders, preserving the
// requested internal path as `from=` for the deep-link exchange.
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

/** Read `role` from a JWT payload without verifying the signature (routing only). */
export function readAccessTokenRole(token: string | undefined): string | null {
  if (!token) return null;
  const parts = token.split(".");
  const payloadSegment = parts[1];
  if (!payloadSegment) return null;
  try {
    const normalized = payloadSegment.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    const json =
      typeof atob === "function"
        ? atob(padded)
        : Buffer.from(padded, "base64").toString("utf8");
    const payload = JSON.parse(json) as { role?: unknown };
    return typeof payload.role === "string" ? payload.role : null;
  } catch {
    return null;
  }
}

export function rolePermittedForGate(
  role: string | null,
  allowedRoles: readonly string[] | undefined,
): boolean {
  if (!allowedRoles || allowedRoles.length === 0) return true;
  if (!role) return false;
  const allowed = new Set(allowedRoles.map((r) => r.toUpperCase()));
  return allowed.has(role.toUpperCase());
}
