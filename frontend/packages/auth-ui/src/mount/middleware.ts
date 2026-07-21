// Session-guard middleware factory — composes the cookie-presence gate with
// the shared locale middleware from @acuity/i18n. Consuming apps keep their
// own literal `config.matcher` (Next.js requires it to be statically
// analyzable) and export `createAuthMiddleware(...)` as their middleware.
//
// The gate is presence-only at the cookie layer (edge middleware cannot fully
// validate a session). When `allowedRoles` is set, a JWT whose role is outside
// that list is treated as no session and cleared — so a doctor cookie on
// localhost cannot unlock the operator console (and vice versa). Full session
// validity still lives in the journey + page-level session guard.

import { NextResponse, type NextRequest } from "next/server";
import { createLocaleMiddleware } from "@acuity/i18n/middleware";
import { MOCK_SESSION_COOKIE } from "./config";
import {
  authGateDecision,
  readAccessTokenRole,
  rolePermittedForGate,
  type AuthGateConfig,
} from "./gate";

export {
  authGateDecision,
  readAccessTokenRole,
  rolePermittedForGate,
  splitLocalePath,
  type AuthGateConfig,
  type AuthGateDecision,
} from "./gate";

// Presence check: the real httpOnly access_token cookie (live backend) or the
// mock-mode marker (MSW cannot set httpOnly cookies in the browser jar).
export function hasSessionCookie(request: NextRequest): boolean {
  return (
    Boolean(request.cookies.get("access_token")?.value) ||
    Boolean(request.cookies.get(MOCK_SESSION_COOKIE)?.value)
  );
}

/** Cookie present and (if configured) JWT role allowed for this surface. */
export function hasEffectiveSession(
  request: NextRequest,
  config: AuthGateConfig,
): boolean {
  if (!hasSessionCookie(request)) return false;
  const token = request.cookies.get("access_token")?.value;
  if (!token) {
    // Mock marker only — page guard validates the mock session further.
    return Boolean(request.cookies.get(MOCK_SESSION_COOKIE)?.value);
  }
  return rolePermittedForGate(readAccessTokenRole(token), config.allowedRoles);
}

function clearSessionCookies(response: NextResponse): void {
  response.cookies.set("access_token", "", { path: "/", maxAge: 0 });
  response.cookies.set(MOCK_SESSION_COOKIE, "", { path: "/", maxAge: 0 });
}

export function createAuthMiddleware(config: AuthGateConfig) {
  const handleLocale = createLocaleMiddleware();
  return function authMiddleware(request: NextRequest) {
    const cookiePresent = hasSessionCookie(request);
    const present = hasEffectiveSession(request, config);
    const decision = authGateDecision(
      request.nextUrl.pathname,
      present,
      config,
    );
    if (decision.action === "redirect") {
      const response = NextResponse.redirect(new URL(decision.to, request.url));
      // Drop a wrong-surface JWT so the sign-in page can issue a fresh cookie.
      if (cookiePresent && !present) clearSessionCookies(response);
      return response;
    }
    return handleLocale(request);
  };
}
