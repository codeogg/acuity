// The one shared routing definition: bilingual, en-HK default, no Simplified
// Chinese locale anywhere.

import { describe, expect, it } from "vitest";
import { defaultLocale, locales, routing } from "../src/routing";

describe("shared routing", () => {
  it("declares exactly en-HK and zh-Hant-HK with en-HK default", () => {
    expect([...locales]).toEqual(["en-HK", "zh-Hant-HK"]);
    expect(defaultLocale).toBe("en-HK");
    expect(routing.defaultLocale).toBe("en-HK");
    expect([...routing.locales]).toEqual(["en-HK", "zh-Hant-HK"]);
  });

  it("never declares a Simplified Chinese locale", () => {
    for (const locale of routing.locales) {
      expect(locale).not.toMatch(/zh-(Hans|CN|SG)/i);
    }
  });
});
