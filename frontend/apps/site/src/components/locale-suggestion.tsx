"use client";

import { cn } from "@/lib/cn";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Button, GlobeIcon } from "@acuity/ui";
import { usePathname, useRouter } from "@/i18n/navigation";

// A calm, dismissible language suggestion — no IP redirect, no auto-switch. Only
// shown to the English locale, once, and remembered locally. Overlaid; uses the
// raised shadow (floats above the page).
export function LocaleSuggestion({ locale }: { locale: string }) {
  const t = useTranslations("locale-suggest");
  const pathname = usePathname();
  const router = useRouter();
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (locale.startsWith("zh")) return;
    if (localStorage.getItem("acuity_locale_dismissed")) return;
    setShow(true);
  }, [locale]);

  if (!show) return null;

  function dismiss() {
    localStorage.setItem("acuity_locale_dismissed", "1");
    setShow(false);
  }

  return (
    <div
      role="region"
      aria-label={t("aria-label")}
      className="fixed left-1/2 top-20 z-(--z-toast) flex w-[calc(100%-2rem)] max-w-110 -translate-x-1/2 flex-wrap items-center gap-4 rounded-md border border-border bg-card p-4 shadow-md"
    >
      <span className="inline-flex text-venice">
        <GlobeIcon className="size-5" />
      </span>
      <p className="min-w-45 flex-1 text-sm text-ink">{t("body")}</p>
      <span className="inline-flex gap-2">
        <Button
          variant="secondary"
          // Venice fill: cream on glaucous is 3.9:1, failing AA for the label.
          className={cn("h-11 gap-2 bg-venice px-4 text-sm text-on-navy hover:bg-venice-deep")}
          onClick={() => {
            localStorage.setItem("acuity_locale_dismissed", "1");
            router.replace(pathname, { locale: "zh-Hant-HK" });
          }}
        >
          {t("switch")}
        </Button>
        <Button
          variant="ghost"
          className="h-11 gap-2 px-3 text-sm font-medium text-venice hover:bg-transparent hover:text-navy"
          onClick={dismiss}
        >
          {t("dismiss")}
        </Button>
      </span>
    </div>
  );
}
