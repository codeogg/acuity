// Live-clock formatting overrides. The shared @acuity/i18n/format helpers
// anchor to a deterministic mock "now" by default; this app's relative times,
// greeting and wall-clock stamps follow the real clock (Hong Kong local time).

import { formatRelative } from "@acuity/i18n/format";
import type { Locale } from "@/i18n/routing";

/** Relative time against the real clock (fixture dates read honestly as they age). */
export function relativeFromNow(iso: string, locale: Locale | string): string {
  return formatRelative(iso, locale, Date.now());
}

/** Time-of-day greeting key from the real clock (Hong Kong local time). */
export function greetingKeyNow():
  | "greeting-morning"
  | "greeting-afternoon"
  | "greeting-evening" {
  const hour = Number(
    new Intl.DateTimeFormat("en-HK", {
      hour: "numeric",
      hour12: false,
      timeZone: "Asia/Hong_Kong",
    }).format(new Date()),
  );
  if (hour < 12) return "greeting-morning";
  if (hour < 18) return "greeting-afternoon";
  return "greeting-evening";
}

/** Clinic-local wall-clock time (HH:mm) for quiet status lines ("Saved · 14:32"). */
export function formatTimeHM(date: Date, locale: Locale | string): string {
  return new Intl.DateTimeFormat(locale === "zh-Hant-HK" ? "zh-Hant-HK" : "en-HK", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Hong_Kong",
  }).format(date);
}
