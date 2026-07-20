"use client";

import {
  type PipelinePhase,
  type PipelineStepId,
  type StepVisualStatus,
} from "@/lib/extraction/pipeline";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n/I18nProvider";

type PdfExtractionOverlayProps = {
  currentStepId: PipelineStepId | null;
  stepStatuses: Record<PipelineStepId, StepVisualStatus>;
  phase: PipelinePhase;
  showVisitDialog?: boolean;
  progressLabel?: string | null;
  className?: string;
};

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

export function PdfExtractionOverlay({
  currentStepId,
  stepStatuses,
  phase,
  showVisitDialog,
  className,
}: PdfExtractionOverlayProps) {
  const { t } = useI18n();
  let label = t("doctor.extract.overlay.default");
  if (showVisitDialog) {
    label = t("doctor.extract.phase.visit_select");
  } else if (currentStepId && stepStatuses[currentStepId] === "running") {
    const runningKey =
      currentStepId === "ocr" && phase === "ocr_skipped"
        ? "ocr_skipped"
        : currentStepId;
    label = t(`doctor.extract.running.${runningKey}`);
  } else if (phase in {
    preprocessing: true,
    ocr: true,
    ocr_skipped: true,
    classifying: true,
    detecting_visits: true,
    visit_select: true,
    extracting: true,
    finalizing: true,
    preparing_review: true,
  }) {
    label = t(`doctor.extract.phase.${phase}`);
  }

  return (
    <div
      className={cn(
        "absolute inset-0 z-10 flex items-center justify-center bg-white/72 backdrop-blur-[2px]",
        className,
      )}
      aria-live="polite"
      aria-busy="true"
    >
      <div className="mx-4 flex max-w-sm items-center gap-3 rounded-full border border-white/80 bg-white/90 px-5 py-3 shadow-lg shadow-[var(--color-primary)]/10">
        <LoadingSpinner label={t("doctor.extract.loading")} />
        <p
          key={label}
          className="overlay-label-in flex items-center text-sm font-medium text-[var(--color-foreground)]"
        >
          <span>{label}</span>
          <LoadingDots />
        </p>
      </div>
    </div>
  );
}
