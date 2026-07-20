// Locale-formatting contract: both locales produce their native register for
// dates, relative times, numbers, and HKD currency, with zh-Hant-HK rendering
// Traditional-Chinese date/relative forms.

import { describe, expect, it } from "vitest";
import {
  formatCurrencyHKD,
  formatDate,
  formatDateTime,
  formatNumber,
  formatRelative,
  formatSize,
} from "../src/format";

const ISO = "2026-07-06T04:30:00Z";
const HK = { timeZone: "Asia/Hong_Kong" } as const;

describe("formatDate / formatDateTime", () => {
  it("renders the en-HK register (abbreviated month)", () => {
    expect(formatDate(ISO, "en-HK", HK)).toBe("6 Jul 2026");
    expect(formatDateTime(ISO, "en-HK", HK)).toContain("12:30");
  });

  it("renders zh-Hant-HK with Chinese date units", () => {
    const date = formatDate(ISO, "zh-Hant-HK", HK);
    expect(date).toContain("2026");
    expect(date).toMatch(/[年月日]/);
    expect(formatDateTime(ISO, "zh-Hant-HK", HK)).toContain("12:30");
  });

  it("falls back to the default locale for unknown route params", () => {
    expect(formatDate(ISO, "fr", HK)).toBe(formatDate(ISO, "en-HK", HK));
  });

  it("pins the requested time zone", () => {
    // 2026-07-06T20:00Z is already 07-07 in Hong Kong.
    expect(formatDate("2026-07-06T20:00:00Z", "en-HK", HK)).toBe("7 Jul 2026");
  });
});

describe("formatRelative", () => {
  const now = new Date("2026-07-06T12:00:00Z").getTime();

  it("renders locale-native relative phrases", () => {
    expect(formatRelative("2026-07-04T12:00:00Z", "en-HK", now)).toBe(
      "2 days ago",
    );
    // HK Traditional register renders day units as 天 or 日 ("前日").
    expect(
      formatRelative("2026-07-04T12:00:00Z", "zh-Hant-HK", now),
    ).toMatch(/[天日]/);
  });

  it("scales minutes and hours", () => {
    expect(formatRelative("2026-07-06T11:30:00Z", "en-HK", now)).toContain(
      "minute",
    );
    expect(formatRelative("2026-07-06T07:00:00Z", "en-HK", now)).toContain(
      "hour",
    );
  });
});

describe("formatNumber / formatCurrencyHKD", () => {
  it("adds thousands separators", () => {
    expect(formatNumber(12345.6, "en-HK")).toBe("12,345.6");
    expect(formatNumber(12345.6, "zh-Hant-HK")).toBe("12,345.6");
  });

  it("renders Hong Kong dollars with the HK$ symbol", () => {
    expect(formatCurrencyHKD(1200, "en-HK")).toBe("HK$1,200");
    expect(formatCurrencyHKD(1200, "zh-Hant-HK")).toBe("HK$1,200");
  });

  it("keeps cents only for fractional amounts", () => {
    expect(formatCurrencyHKD(1200.5, "en-HK")).toBe("HK$1,200.50");
  });
});

describe("formatSize", () => {
  it("switches to MB at 1024 KB", () => {
    expect(formatSize(512, "en-HK")).toBe("512 KB");
    expect(formatSize(2048, "en-HK")).toBe("2 MB");
  });
});
