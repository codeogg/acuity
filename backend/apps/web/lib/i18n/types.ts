export type AppLocale = "zh-HK" | "en-HK";

export type MessageCatalog = Record<string, string>;

export const DEFAULT_LOCALE: AppLocale = "zh-HK";

export function isAppLocale(value: string | null | undefined): value is AppLocale {
  return value === "zh-HK" || value === "en-HK";
}
