"use client";

// Locale-level error boundary: an uncaught render error shows a calm,
// localised message inside the site chrome (never Next's default screen,
// never a stack trace).

import { useTranslations } from "next-intl";
import { PageHero } from "@/components/marketing";

export default function Error({ reset }: { error: Error; reset: () => void }) {
  const t = useTranslations("error");
  return (
    <PageHero title={t("title")} lede={t("lede")}>
      <div className="flex justify-center">
        <button
          type="button"
          onClick={reset}
          className="inline-flex h-12 items-center justify-center rounded-md bg-navy px-6 text-base font-medium text-on-navy transition-colors hover:bg-navy-bright"
        >
          {t("retry")}
        </button>
      </div>
    </PageHero>
  );
}
