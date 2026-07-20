import { createAuthMiddleware } from "@acuity/auth-ui/middleware";

// Session gate + locale routing in one composed middleware. The harness home
// is public; both sign-in mounts are public; everything else needs a session.
export default createAuthMiddleware({
  signInPath: "/sign-in",
  publicPaths: ["/", "/operator/sign-in"],
});

export const config = {
  // Next.js requires a static literal matcher, so it stays here.
  matcher: ["/((?!api|_next|_vercel|.*\\..*).*)"],
};
