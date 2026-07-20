"use client";

import { useI18n } from "@/lib/i18n/I18nProvider";

export function LocalizedLoading({ className }: { className?: string }) {
  const { t } = useI18n();
  return (
    <p className={className ?? "p-4 text-sm text-[var(--color-muted-foreground)]"}>
      {t("doctor.common.loading")}
    </p>
  );
}
