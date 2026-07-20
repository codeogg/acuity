"use client";

import { Button } from "@/components/ui/button";
import type { VisitCandidate } from "@/lib/api/types";
import { useI18n } from "@/lib/i18n/I18nProvider";

export function VisitSelectDialog({
  open,
  visits,
  selectedIndex,
  onSelect,
  onConfirm,
  confirming,
}: {
  open: boolean;
  visits: VisitCandidate[];
  selectedIndex: number | null;
  onSelect: (visitIndex: number) => void;
  onConfirm: () => void;
  confirming: boolean;
}) {
  const { t } = useI18n();
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div
        role="dialog"
        aria-modal="true"
        className="w-full max-w-lg rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] p-6 shadow-lg"
      >
        <h2 className="text-lg font-semibold">{t("doctor.extract.visitTitle")}</h2>
        <p className="mt-1 text-sm text-[var(--color-muted-foreground)]">
          {t("doctor.extract.visitDescription")}
        </p>
        <div className="mt-4 space-y-2">
          {visits.map((visit) => (
            <label
              key={visit.id}
              className="flex cursor-pointer items-start gap-3 rounded-md border border-[var(--color-border)] p-3 text-sm has-[:checked]:border-[var(--color-primary)]"
            >
              <input
                type="radio"
                name="visit"
                className="mt-1"
                checked={selectedIndex === visit.visit_index}
                onChange={() => onSelect(visit.visit_index)}
              />
              <div className="space-y-1">
                <div className="font-medium">
                  {t("doctor.extract.visitNumber", { number: visit.visit_index })}
                  {visit.visit_date ? ` · ${visit.visit_date}` : ""}
                </div>
                <div>{visit.summary ?? "—"}</div>
                <div className="text-xs text-[var(--color-muted-foreground)]">
                  {t("doctor.extract.pageRange", {
                    start: visit.page_range[0],
                    end: visit.page_range[1],
                  })}
                </div>
              </div>
            </label>
          ))}
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <Button
            onClick={onConfirm}
            disabled={selectedIndex == null || confirming}
          >
            {confirming ? t("doctor.extract.submitting") : t("doctor.extract.confirmVisit")}
          </Button>
        </div>
      </div>
    </div>
  );
}
