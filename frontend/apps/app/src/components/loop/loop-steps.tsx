"use client";

import { useTranslations } from "next-intl";
import { StepIndicator, type Step } from "@acuity/ui";

// The 5-step form-fill loop location signal (Select -> Import -> Extract ->
// Review -> PDF). Wraps the design-kit StepIndicator with the loop's labels.
// The sidebar recedes to context inside the loop; this is the in-loop signal.

export type LoopStep = 0 | 1 | 2 | 3 | 4;

export function LoopSteps({ current }: { current: LoopStep }) {
  const t = useTranslations("common");
  const steps: Step[] = [
    { id: "select", label: t("step-select") },
    { id: "import", label: t("step-import") },
    { id: "extract", label: t("step-extract") },
    { id: "review", label: t("step-review") },
    { id: "pdf", label: t("step-pdf") },
  ];
  return (
    <>
      {/* Full indicator from tablet up; a compact "Step N of 5" label below. */}
      <div className="hidden md:block">
        <StepIndicator
          steps={steps}
          current={current}
          aria-label={t("step-of", { current: current + 1, total: 5 })}
        />
      </div>
      <p className="t-eyebrow text-muted-foreground md:hidden">
        {t("step-of", { current: current + 1, total: 5 })}
      </p>
    </>
  );
}
