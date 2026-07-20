"use client";

import { Check, Minus } from "lucide-react";

import {
  getPipelineSteps,
  type PipelineStepId,
  type StepVisualStatus,
} from "@/lib/extraction/pipeline";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n/I18nProvider";

type PipelineProgressProps = {
  stepStatuses: Record<PipelineStepId, StepVisualStatus>;
  currentStepId: PipelineStepId | null;
};

function StepCircle({ status }: { status: StepVisualStatus }) {
  if (status === "running") {
    return (
      <div
        className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 border-[var(--color-primary)] bg-[var(--color-primary)]/5"
        aria-hidden
      >
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-[var(--color-primary)] border-t-transparent" />
      </div>
    );
  }

  if (status === "completed") {
    return (
      <div
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 border-green-600 bg-green-600 text-white"
        aria-hidden
      >
        <Check className="h-4 w-4" strokeWidth={2.5} />
      </div>
    );
  }

  if (status === "skipped") {
    return (
      <div
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 border-dashed border-[var(--color-muted-foreground)]/40 bg-[var(--color-muted)]/30 text-[var(--color-muted-foreground)]"
        aria-hidden
      >
        <Minus className="h-4 w-4" />
      </div>
    );
  }

  return (
    <div
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 border-[var(--color-border)] bg-white"
      aria-hidden
    />
  );
}

export function PipelineProgress({
  stepStatuses,
  currentStepId,
}: PipelineProgressProps) {
  const { locale, t } = useI18n();
  const steps = getPipelineSteps(locale);
  return (
    <nav aria-label={t("doctor.extract.progressAria")} className="w-full">
      <ol className="space-y-0">
        {steps.map((step, index) => {
          const status = stepStatuses[step.id];
          const isActive = currentStepId === step.id || status === "running";
          const isLast = index === steps.length - 1;

          return (
            <li key={step.id} className="flex gap-3">
              <div className="flex flex-col items-center">
                <StepCircle status={status} />
                {!isLast && (
                  <div
                    className={cn(
                      "my-1 w-0.5 flex-1 min-h-[1.25rem]",
                      status === "completed" || status === "skipped"
                        ? "bg-green-600/40"
                        : "bg-[var(--color-border)]",
                    )}
                  />
                )}
              </div>

              <div className={cn("pb-5 flex-1 min-w-0", isLast && "pb-0")}>
                <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5">
                  <p
                    className={cn(
                      "font-medium leading-snug",
                      isActive && "text-[var(--color-primary)]",
                      status === "pending" && "text-[var(--color-muted-foreground)]",
                    )}
                  >
                    <span className="text-xs text-[var(--color-muted-foreground)] mr-1.5">
                      {step.number}.
                    </span>
                    {t(`doctor.extract.step.${step.id}.title`)}
                  </p>
                  <span
                    className={cn(
                      "text-xs shrink-0",
                      status === "running" && "text-[var(--color-primary)]",
                      status === "completed" && "text-green-700",
                      status === "skipped" && "text-[var(--color-muted-foreground)]",
                      status === "pending" && "text-[var(--color-muted-foreground)]",
                    )}
                  >
                    {t(`doctor.extract.status.${status}`)}
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-[var(--color-muted-foreground)] leading-relaxed">
                  {t(`doctor.extract.step.${step.id}.description`)}
                </p>
              </div>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
