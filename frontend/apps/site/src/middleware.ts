import { createLocaleMiddleware } from "@acuity/i18n/middleware";

// Locale routing middleware from the shared i18n package: rewrites `/` to the
// default-locale segment and resolves `[locale]` for every page route.
export default createLocaleMiddleware();

export const config = {
  // Match all paths except Next internals, the API proxy, and static files.
  // Next.js requires this matcher to be a static literal, so it stays here.
  matcher: ["/((?!api|_next|_vercel|.*\\..*).*)"],
};
