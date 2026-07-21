import { NextResponse, type NextRequest } from "next/server";
import { createLocaleMiddleware } from "@acuity/i18n/middleware";
import {
  MOCK_SESSION_COOKIE,
  operatorAuthMount,
} from "@acuity/auth-ui";
import {
  authGateDecision,
  hasEffectiveSession,
  hasSessionCookie,
} from "@acuity/auth-ui/middleware";

// Session gate + locale routing. Presence-only cookie check, plus role
// isolation: a doctor JWT on shared localhost must not unlock this console.
const MOCKING = process.env.NEXT_PUBLIC_API_MOCKING !== "disabled";
const SIGNED_OUT_COOKIE = "acuity_signed_out";

const gateConfig = {
  signInPath: "/sign-in",
  publicPaths: [] as string[],
  allowedRoles: operatorAuthMount.allowedRoles,
};
const handleLocale = createLocaleMiddleware();

export default function middleware(request: NextRequest) {
  const signedOut = Boolean(request.cookies.get(SIGNED_OUT_COOKIE)?.value);
  const cookiePresent = hasSessionCookie(request);
  const roleOk = hasEffectiveSession(request, gateConfig);
  const present = roleOk || (MOCKING && !signedOut && !cookiePresent);
  const decision = authGateDecision(request.nextUrl.pathname, present, gateConfig);
  if (decision.action === "redirect") {
    const response = NextResponse.redirect(new URL(decision.to, request.url));
    if (cookiePresent && !roleOk) {
      response.cookies.set("access_token", "", { path: "/", maxAge: 0 });
      response.cookies.set(MOCK_SESSION_COOKIE, "", { path: "/", maxAge: 0 });
    }
    return response;
  }
  return handleLocale(request);
}

export const config = {
  // Match all paths except Next internals, the API surface, and static files.
  // Next.js requires this matcher to be a static literal, so it stays here.
  matcher: ["/((?!api|_next|_vercel|.*\\..*).*)"],
};
