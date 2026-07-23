"use client";

import { useTranslations } from "next-intl";
import { cn } from "@acuity/ui";
import type { PipelinePhase, PipelineStepId, StepVisualStatus } from "./pipeline-types";

function LoadingSpinner({ label }: { label: string }) {
  return <div className="pdf-loading-spinner" role="status" aria-label={label} />;
}

function LoadingDots() {
  return (
    <span className="loading-dots" aria-hidden>
      <span>.</span>
      <span>.</span>
      <span>.</span>
    </span>
  );
}

/** Frosted overlay on the PDF while the claim extraction pipeline is running. */
export function PdfExtractionOverlay({
  currentStepId,
  stepStatuses,
  phase,
  showVisitDialog,
  progressLabel,
  className,
}: {
  currentStepId: PipelineStepId | null;
  stepStatuses: Record<PipelineStepId, StepVisualStatus>;
  phase: PipelinePhase;
  showVisitDialog?: boolean;
  progressLabel?: string | null;
  className?: string;
}) {
  const t = useTranslations("medical-review");
  let label = t("overlay-default");
  if (showVisitDialog) {
    label = t("phase-visit_select");
  } else if (progressLabel) {
    label = progressLabel;
  } else if (currentStepId && stepStatuses[currentStepId] === "running") {
    const key =
      currentStepId === "ocr" && phase === "ocr_skipped" ? "ocr_skipped" : currentStepId;
    label = t(`running-${key}` as "running-preprocess");
  } else if (
    phase === "preprocessing" ||
    phase === "ocr" ||
    phase === "ocr_skipped" ||
    phase === "classifying" ||
    phase === "detecting_visits" ||
    phase === "visit_select" ||
    phase === "extracting" ||
    phase === "finalizing" ||
    phase === "preparing_review"
  ) {
    label = t(`phase-${phase}` as "phase-preprocessing");
  }

  return (
    <div
      className={cn(
        "absolute inset-0 z-10 flex items-center justify-center bg-background/70 backdrop-blur-[2px]",
        className,
      )}
      aria-live="polite"
      aria-busy="true"
    >
      <div className="mx-4 flex w-max max-w-[calc(100%-2rem)] shrink-0 items-center gap-3 rounded-full border border-border bg-card/95 px-5 py-3 shadow-lg">
        <LoadingSpinner label={t("loading-aria")} />
        <p
          key={label}
          className="overlay-label-in flex min-w-0 flex-row items-center whitespace-nowrap text-sm font-medium text-foreground"
        >
          <span className="whitespace-nowrap">{label}</span>
          <LoadingDots />
        </p>
      </div>
    </div>
  );
}
