"use client";

import { Globe } from "lucide-react";
import { useRouter } from "next/navigation";

import { useI18n } from "@/lib/i18n/I18nProvider";
import { cn } from "@/lib/utils";

export function LocaleSwitcher({ compact = false }: { compact?: boolean }) {
  const { locale, setLocale, t } = useI18n();
  const router = useRouter();
  const nextLocale = locale === "zh-HK" ? "en-HK" : "zh-HK";

  return (
    <button
      type="button"
      aria-label={`${t("common.language")}: ${locale === "zh-HK" ? "繁體中文" : "English"}`}
      onClick={() => {
        setLocale(nextLocale);
        router.refresh();
      }}
      className={cn(
        "flex w-full items-center gap-3 rounded-md text-sm text-[var(--color-foreground)] hover:bg-[var(--color-muted)]",
        compact ? "px-2 py-1.5" : "px-3 py-2",
      )}
    >
      <Globe className="h-4 w-4 shrink-0 text-[var(--color-muted-foreground)]" />
      <span>{t("common.language")}</span>
      <span className="ml-auto text-xs text-[var(--color-muted-foreground)]">
        {locale === "zh-HK" ? "繁體" : "English"}
      </span>
    </button>
  );
}
