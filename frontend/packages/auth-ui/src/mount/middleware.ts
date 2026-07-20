// Session-guard middleware factory — composes the cookie-presence gate with
// the shared locale middleware from @acuity/i18n. Consuming apps keep their
// own literal `config.matcher` (Next.js requires it to be statically
// analyzable) and export `createAuthMiddleware(...)` as their middleware.
//
// The gate is presence-only (edge middleware cannot validate a session);
// role checks and session validity live in the journey + the page-level
// session guard. Unauthenticated requests redirect to the sign-in page
// BEFORE any protected route renders, carrying the requested internal path
// as `from=` so the journey can exchange it for a single-use,
// allowlist-validated deep-link token. Decision logic lives in ./gate
// (pure, unit-tested); this module adds only the Next.js wiring.

import { NextResponse, type NextRequest } from "next/server";
import { createLocaleMiddleware } from "@acuity/i18n/middleware";
import { MOCK_SESSION_COOKIE } from "./config";
import { authGateDecision, type AuthGateConfig } from "./gate";

export {
  authGateDecision,
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

export function createAuthMiddleware(config: AuthGateConfig) {
  const handleLocale = createLocaleMiddleware();
  return function authMiddleware(request: NextRequest) {
    const decision = authGateDecision(
      request.nextUrl.pathname,
      hasSessionCookie(request),
      config,
    );
    if (decision.action === "redirect") {
      return NextResponse.redirect(new URL(decision.to, request.url));
    }
    return handleLocale(request);
  };
}
