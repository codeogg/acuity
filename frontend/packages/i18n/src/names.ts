// Bilingual display-name helpers — the one locale-name utility layer.
//
// Two input shapes exist across the product:
//   - combined strings ("陳美玲 Chan Mei Ling") on fixture identities and
//     doctor-facing chrome: split per locale with cjkPart/latinPart/localeName
//     (one-language-per-toggle — running copy never mixes scripts);
//   - bilingual name pairs (name = Chinese, name_en) on contract entities:
//     pick the active register with pickName, falling back across the pair.

import type { Locale } from "./routing";

const CJK_RE = /[㐀-鿿豈-﫿]/;

/** The CJK portion of a combined bilingual string ("陳美玲 Chan Mei Ling" -> "陳美玲"). */
export function cjkPart(combined: string): string {
  return combined
    .split(/\s+/)
    .filter((part) => CJK_RE.test(part))
    .join("");
}

/** The Latin portion of a combined bilingual string ("陳美玲 Chan Mei Ling" -> "Chan Mei Ling"). */
export function latinPart(combined: string): string {
  return combined
    .split(/\s+/)
    .filter((part) => part.length > 0 && !CJK_RE.test(part))
    .join(" ");
}

/** Locale-appropriate rendering of a combined bilingual label. */
export function localeName(combined: string, locale: Locale): string {
  const preferred = locale === "zh-Hant-HK" ? cjkPart(combined) : latinPart(combined);
  return preferred || combined;
}

/**
 * The doctor's short greeting/title form per locale:
 *   en-HK: "Dr Chan"  (Dr + Latin family name — HK names are family-name-first)
 *   zh-Hant-HK: "陳美玲醫生" (full CJK name + 醫生)
 */
export function doctorShortName(displayName: string, locale: Locale): string {
  if (locale === "zh-Hant-HK") {
    const cjk = cjkPart(displayName);
    return cjk ? `${cjk}醫生` : displayName;
  }
  const latin = latinPart(displayName);
  const family = latin.split(" ")[0];
  return family ? `Dr ${family}` : displayName;
}

/** Full titled form per locale ("Dr Chan Mei Ling" / "陳美玲醫生"). */
export function doctorFullName(displayName: string, locale: Locale): string {
  if (locale === "zh-Hant-HK") {
    const cjk = cjkPart(displayName);
    return cjk ? `${cjk}醫生` : displayName;
  }
  const latin = latinPart(displayName);
  return latin ? `Dr ${latin}` : displayName;
}

/**
 * Locale-aware pick over a bilingual name pair (name = Chinese, name_en):
 * render the active locale's register and fall back across the pair (full
 * bilingual parity — no English-only carve-out).
 */
export function pickName(
  locale: string,
  zhValue: string | null | undefined,
  enValue: string | null | undefined,
): string {
  const zh = locale.startsWith("zh");
  return (zh ? zhValue : enValue) ?? enValue ?? zhValue ?? "—";
}
