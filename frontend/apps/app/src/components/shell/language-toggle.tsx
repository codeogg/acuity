"use client";

import { useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { cn } from "@acuity/ui";
import { usePathname, useRouter } from "@acuity/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { routing } from "@/i18n/routing";

// The interface-language selector (English / 中文). Selects the running-copy
// language one language at a time (never mixes scripts in running copy). The
// shared navigation wrappers swap the [locale] segment on the same path.
// Colour-only active state (no geometry change on interaction, per FINAL/ui.md).
//
// Variants: "inline" (default segmented control), "compact" (smaller text),
// "icon" (the tablet icon-rail form — stacked short labels, 44px column).

export function LanguageToggle({
  variant = "inline",
}: {
  variant?: "inline" | "compact" | "icon";
}) {
  const t = useTranslations("shell");
  const locale = useLocale() as Locale;
  const pathname = usePathname();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function switchTo(next: Locale) {
    if (next === locale) return;
    startTransition(() => {
      router.replace(pathname, { locale: next });
    });
  }

  const options: { value: Locale; label: string; short: string }[] = [
    { value: "en-HK", label: t("language-english"), short: "EN" },
    { value: "zh-Hant-HK", label: t("language-chinese"), short: "中" },
  ];

  if (variant === "icon") {
    return (
      <div
        role="group"
        aria-label={t("language-switch")}
        className="inline-flex flex-col items-stretch gap-0.5 rounded-md border border-border bg-card p-0.5"
      >
        {options.map((opt) => {
          const active = opt.value === locale;
          return (
            <button
              key={opt.value}
              type="button"
              aria-pressed={active}
              aria-label={opt.label}
              title={opt.label}
              disabled={pending}
              onClick={() => switchTo(opt.value)}
              className={cn(
                "rounded-sm px-2 py-1 text-xs font-medium transition-colors duration-[120ms]",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                active
                  ? "bg-primary text-primary-foreground"
                  : "text-foreground hover:bg-accent",
              )}
            >
              {opt.short}
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div
      role="group"
      aria-label={t("language-switch")}
      className={cn(
        "inline-flex items-center gap-0.5 rounded-md border border-border bg-card p-0.5",
        variant === "compact" && "text-xs",
      )}
    >
      {options.map((opt) => {
        const active = opt.value === locale;
        return (
          <button
            key={opt.value}
            type="button"
            aria-pressed={active}
            disabled={pending}
            onClick={() => switchTo(opt.value)}
            className={cn(
              "rounded-sm px-2.5 py-1 text-sm font-medium transition-colors duration-[120ms]",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
              active
                ? "bg-primary text-primary-foreground"
                : "text-foreground hover:bg-accent",
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

// Guard so the [locale] segment we write is always valid.
export function isValidLocale(value: string): value is Locale {
  return (routing.locales as readonly string[]).includes(value);
}
