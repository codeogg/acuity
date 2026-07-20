import { NextResponse, type NextRequest } from "next/server";
import { createLocaleMiddleware } from "@acuity/i18n/middleware";
import { authGateDecision, hasSessionCookie } from "@acuity/auth-ui/middleware";

// Session gate + locale routing, composed exactly as the auth-ui mount
// contract prescribes (presence-only cookie check, redirect to sign-in with
// the requested path as from= before any protected route renders; locale
// resolution for allowed requests).
//
// Mock-first presence rule: the mock backend boots signed in (the auth
// store's default session), so a visitor with no cookies at all is treated
// as carrying that boot session until an explicit sign-out sets the
// signed-out marker. After sign-out — or in live mode — presence is the
// cookie check alone, which is the exact behaviour of createAuthMiddleware.
const MOCKING = process.env.NEXT_PUBLIC_API_MOCKING !== "disabled";
const SIGNED_OUT_COOKIE = "acuity_signed_out";

const gateConfig = { signInPath: "/sign-in", publicPaths: [] as string[] };
const handleLocale = createLocaleMiddleware();

export default function middleware(request: NextRequest) {
  const signedOut = Boolean(request.cookies.get(SIGNED_OUT_COOKIE)?.value);
  const present = hasSessionCookie(request) || (MOCKING && !signedOut);
  const decision = authGateDecision(request.nextUrl.pathname, present, gateConfig);
  if (decision.action === "redirect") {
    return NextResponse.redirect(new URL(decision.to, request.url));
  }
  return handleLocale(request);
}

export const config = {
  // Match all paths except Next internals, the API surface, and static files.
  // Next.js requires this matcher to be a static literal, so it stays here.
  matcher: ["/((?!api|_next|_vercel|.*\\..*).*)"],
};
