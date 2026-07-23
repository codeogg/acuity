"use client";

import { useTranslations } from "next-intl";
import { StepIndicator, type Step } from "@acuity/ui";

// 4-step form-fill loop: Select → Import → Extract & review → PDF.
// The former separate "Review" step is merged into Extract & review.

export type LoopStep = 0 | 1 | 2 | 3;

export const LOOP_STEP_TOTAL = 4;

export function LoopSteps({ current }: { current: LoopStep }) {
  const t = useTranslations("common");
  const steps: Step[] = [
    { id: "select", label: t("step-select") },
    { id: "import", label: t("step-import") },
    { id: "extract", label: t("step-extract") },
    { id: "pdf", label: t("step-pdf") },
  ];
  return (
    <>
      {/* Full indicator from tablet up; a compact "Step N of 4" label below. */}
      <div className="hidden md:block">
        <StepIndicator
          steps={steps}
          current={current}
          aria-label={t("step-of", { current: current + 1, total: LOOP_STEP_TOTAL })}
        />
      </div>
      <p className="t-eyebrow text-muted-foreground md:hidden">
        {t("step-of", { current: current + 1, total: LOOP_STEP_TOTAL })}
      </p>
    </>
  );
}
