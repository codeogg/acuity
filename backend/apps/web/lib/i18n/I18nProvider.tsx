"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import { adminEnHK, adminZhHK } from "@/lib/i18n/messages/admin";
import { doctorEnHK, doctorZhHK } from "@/lib/i18n/messages/doctor";
import { sharedEnHK, sharedZhHK } from "@/lib/i18n/messages/shared";
import type { AppLocale, MessageCatalog } from "@/lib/i18n/types";

const catalogs: Record<AppLocale, MessageCatalog> = {
  "zh-HK": { ...sharedZhHK, ...adminZhHK, ...doctorZhHK },
  "en-HK": { ...sharedEnHK, ...adminEnHK, ...doctorEnHK },
};

type TranslationValues = Record<string, string | number>;

interface I18nContextValue {
  locale: AppLocale;
  setLocale: (locale: AppLocale) => void;
  t: (key: string, values?: TranslationValues) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

function interpolate(message: string, values?: TranslationValues): string {
  if (!values) return message;
  return message.replace(/\{(\w+)\}/g, (match, key: string) =>
    Object.prototype.hasOwnProperty.call(values, key) ? String(values[key]) : match,
  );
}

export function I18nProvider({
  initialLocale,
  children,
}: {
  initialLocale: AppLocale;
  children: React.ReactNode;
}) {
  const [locale, setLocaleState] = useState<AppLocale>(initialLocale);

  const setLocale = useCallback((nextLocale: AppLocale) => {
    setLocaleState(nextLocale);
    document.documentElement.lang = nextLocale;
    document.cookie = `locale=${nextLocale}; path=/; max-age=31536000; samesite=lax`;
    window.localStorage.setItem("locale", nextLocale);
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const t = useCallback(
    (key: string, values?: TranslationValues) =>
      interpolate(catalogs[locale][key] ?? catalogs["zh-HK"][key] ?? key, values),
    [locale],
  );

  const value = useMemo(() => ({ locale, setLocale, t }), [locale, setLocale, t]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const context = useContext(I18nContext);
  if (!context) throw new Error("useI18n must be used within I18nProvider");
  return context;
}
