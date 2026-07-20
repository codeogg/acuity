import createMiddleware from "next-intl/middleware";
import { routing } from "./routing";

// Locale routing middleware: rewrites `/` to the default-locale segment and
// resolves `[locale]` for every page route. Each app's middleware.ts calls
// this and keeps its own literal `config.matcher` (Next.js requires the
// matcher to be statically analyzable, so it cannot live here).
export function createLocaleMiddleware() {
  return createMiddleware(routing);
}
