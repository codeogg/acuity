import { createAuthMiddleware } from "@acuity/auth-ui/middleware";

// Session gate + locale routing in one middleware: unauthenticated requests
// to protected routes redirect to sign-in (carrying the requested path as
// `from=` for the deep-link return) BEFORE any page renders; authenticated
// requests fall through to the shared locale middleware, which
// createAuthMiddleware composes internally (never stack both).
export default createAuthMiddleware({
  signInPath: "/sign-in",
  publicPaths: [],
});

export const config = {
  // Match all paths except Next internals, the API proxy, and static files.
  // Next.js requires this matcher to be a static literal, so it stays here.
  matcher: ["/((?!api|_next|_vercel|mockServiceWorker.js|.*\\..*).*)"],
};
