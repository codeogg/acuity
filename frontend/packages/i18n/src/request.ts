import { getRequestConfig } from "next-intl/server";
import { hasLocale, type Messages } from "next-intl";
import { routing, type Locale } from "./routing";

// The product is Hong Kong-anchored: every rendered date/time is HK wall
// time regardless of the build or serving machine's local zone. Pinned here
// so all surfaces inherit one deterministic zone.
export const TIME_ZONE = "Asia/Hong_Kong";

// Message catalogs stay app-local (each surface owns its strings), so the app
// passes a loader that imports from its own messages/ directory.
export type MessageLoader = (
  locale: Locale,
) => Promise<{ default: unknown }>;

// Resolves the active locale per request and loads that locale's message
// catalog. Falls back to the default locale for an unknown segment.
export function createLocaleRequestConfig(loadMessages: MessageLoader) {
  return getRequestConfig(async ({ requestLocale }) => {
    const requested = await requestLocale;
    const locale = hasLocale(routing.locales, requested)
      ? requested
      : routing.defaultLocale;

    return {
      locale,
      timeZone: TIME_ZONE,
      messages: (await loadMessages(locale)).default as Messages,
    };
  });
}
