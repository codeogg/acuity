"use client";

import Link from "next/link";

import { Card } from "@/components/ui/card";
import { ChevronLeft } from "lucide-react";
import { useI18n } from "@/lib/i18n/I18nProvider";

export default function PresetsPage() {
  const { t } = useI18n();
  return (
    <div className="mx-auto max-w-3xl">
      <Link
        href="/doctor"
        className="mb-4 inline-flex items-center gap-1 text-sm text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]"
      >
        <ChevronLeft className="h-4 w-4" />
        {t("doctor.back.dashboard")}
      </Link>
      <h1 className="text-xl font-semibold">{t("doctor.presets.title")}</h1>
      <p className="mt-1 text-sm text-[var(--color-muted-foreground)]">
        {t("doctor.presets.description")}
      </p>
      <Card className="mt-6 border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-8 text-center text-sm text-[var(--color-muted-foreground)] shadow-[0_1px_2px_rgba(18,22,28,0.06)]">
        {t("doctor.presets.comingSoon")}
      </Card>
    </div>
  );
}
