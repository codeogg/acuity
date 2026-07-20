// Locale-aware formatting helpers shared by every surface. Dates, relative
// times, numbers, and HKD currency render in the active locale (en-HK or
// zh-Hant-HK). Kept framework-light (Intl only) so they run in both server and
// client components.

import type { Locale } from "./routing";

// The product's single anchor zone (see request.ts): all date/time output
// defaults to Hong Kong wall time so rendering never depends on the build or
// serving machine's local zone.
const DEFAULT_TIME_ZONE = "Asia/Hong_Kong";

export interface FormatOptions {
  // IANA time zone for date/time rendering. Defaults to Asia/Hong_Kong, the
  // product's anchor zone; pass another zone only for genuinely foreign times.
  timeZone?: string;
}

// Map an app locale (or a raw route param) to a BCP-47 tag Intl understands.
// Unknown values fall back to the default locale's tag.
function intlLocale(locale: Locale | string): string {
  return locale === "zh-Hant-HK" ? "zh-Hant-HK" : "en-HK";
}

// Human date display, per FINAL date-display register (abbreviated month).
export function formatDate(
  iso: string,
  locale: Locale | string,
  options: FormatOptions = {},
): string {
  const date = new Date(iso);
  return new Intl.DateTimeFormat(intlLocale(locale), {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: options.timeZone ?? DEFAULT_TIME_ZONE,
  }).format(date);
}

export function formatDateTime(
  iso: string,
  locale: Locale | string,
  options: FormatOptions = {},
): string {
  const date = new Date(iso);
  return new Intl.DateTimeFormat(intlLocale(locale), {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: options.timeZone ?? DEFAULT_TIME_ZONE,
  }).format(date);
}

// Relative time ("2 days ago" / "2 天前"). Anchored to a fixed "now" by
// default for deterministic mock rendering; pass a real timestamp once live
// data flows.
const MOCK_NOW = new Date("2026-07-06T12:00:00Z").getTime();

export function formatRelative(
  iso: string,
  locale: Locale | string,
  now: number = MOCK_NOW,
): string {
  const then = new Date(iso).getTime();
  const diffMs = then - now;
  const rtf = new Intl.RelativeTimeFormat(intlLocale(locale), { numeric: "auto" });
  const diffMinutes = Math.round(diffMs / 60000);
  if (Math.abs(diffMinutes) < 60) return rtf.format(diffMinutes, "minute");
  const diffHours = Math.round(diffMinutes / 60);
  if (Math.abs(diffHours) < 24) return rtf.format(diffHours, "hour");
  const diffDays = Math.round(diffHours / 24);
  return rtf.format(diffDays, "day");
}

// Plain number display (thousands separators per locale).
export function formatNumber(
  value: number,
  locale: Locale | string,
  options?: Intl.NumberFormatOptions,
): string {
  return new Intl.NumberFormat(intlLocale(locale), options).format(value);
}

// Money display in Hong Kong dollars, the product's single settlement
// currency. Whole-dollar amounts drop the cents ("HK$1,200"); fractional
// amounts keep two decimal places.
export function formatCurrencyHKD(
  value: number,
  locale: Locale | string,
): string {
  const wholeDollar = Number.isInteger(value);
  return new Intl.NumberFormat(intlLocale(locale), {
    style: "currency",
    currency: "HKD",
    currencyDisplay: "symbol",
    minimumFractionDigits: wholeDollar ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(value);
}

// File size (KB -> readable).
export function formatSize(kb: number, locale: Locale | string): string {
  if (kb >= 1024) {
    return (
      new Intl.NumberFormat(intlLocale(locale), {
        maximumFractionDigits: 1,
      }).format(kb / 1024) + " MB"
    );
  }
  return `${kb} KB`;
}

// Which greeting message key to use for the current hour (mock-anchored).
export function greetingKey(): "greeting-morning" | "greeting-afternoon" | "greeting-evening" {
  const hour = new Date(MOCK_NOW).getUTCHours() + 8; // HK time (UTC+8)
  const hk = hour % 24;
  if (hk < 12) return "greeting-morning";
  if (hk < 18) return "greeting-afternoon";
  return "greeting-evening";
}
