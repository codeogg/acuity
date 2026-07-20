"use client";

import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";

import { ExtractionReviewForm } from "@/components/extraction/ExtractionReviewForm";
import { PdfExtractionOverlay } from "@/components/extraction/PdfExtractionOverlay";
import { VisitSelectDialog } from "@/components/extraction/VisitSelectDialog";
import { useClaimExtractionPipeline } from "@/components/extraction/useClaimExtractionPipeline";
import { StandardFieldsPlaceholder } from "@/components/claim/StandardFieldsPlaceholder";
import { AiGlowBorder } from "@/components/ui/AiGlowBorder";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Toast } from "@/components/ui/toast";
import { apiFetch } from "@/lib/api/client";
import { orderFieldCodes } from "@/lib/extraction/field-order";
import { useI18n } from "@/lib/i18n/I18nProvider";

type TemplateSpecificAiField = {
  field_code: string;
  field_name: string;
  ai_extraction_hint?: string | null;
};

type MedicalRecordReviewPanelProps = {
  claimId: number;
  taskNo: string;
  templateId: number;
  onResetUpload: () => void;
  resetting: boolean;
  onSaveReview: (values: Record<string, string | null>) => void;
  savingReview: boolean;
  saveError?: string | null;
  onConfirmReview: (values: Record<string, string | null>) => void;
  confirmingReview: boolean;
  confirmError?: string | null;
  onReviewPhaseChange?: (active: boolean) => void;
};

export function MedicalRecordReviewPanel({
  claimId,
  taskNo,
  templateId,
  onResetUpload,
  resetting,
  onSaveReview,
  savingReview,
  saveError,
  onConfirmReview,
  confirmingReview,
  confirmError,
  onReviewPhaseChange,
}: MedicalRecordReviewPanelProps) {
  const { t } = useI18n();
  const pipeline = useClaimExtractionPipeline(taskNo, { templateId, claimId });

  const { data: templateSpecificFields = [] } = useQuery({
    queryKey: ["claim-template-specific-ai-fields", claimId],
    queryFn: () =>
      apiFetch<TemplateSpecificAiField[]>(
        `/api/doctor/claims/${claimId}/template-specific-ai-fields`,
      ),
    enabled: claimId > 0,
  });

  useEffect(() => {
    void pipeline.refreshReview();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskNo]);

  const review = pipeline.review;
  const isReviewReady =
    pipeline.phase === "review" ||
    pipeline.phase === "completed" ||
    !!review;

  const isRunning =
    pipeline.phase !== "uploaded" &&
    pipeline.phase !== "failed" &&
    !isReviewReady &&
    !pipeline.showVisitDialog;

  const canStartAi =
    !isRunning &&
    !isReviewReady &&
    pipeline.phase !== "failed" &&
    !pipeline.showVisitDialog;

  const inReviewPhase = isRunning || isReviewReady;

  useEffect(() => {
    onReviewPhaseChange?.(inReviewPhase);
  }, [inReviewPhase, onReviewPhaseChange]);

  const fieldOrder = review
    ? orderFieldCodes(Object.keys(review.display_fields))
    : [];

  const reviewTemplateCodes =
    review?.template_specific_field_codes ??
    templateSpecificFields.map((f) => f.field_code);
  const reviewFieldLabels =
    review?.field_labels ??
    Object.fromEntries(
      templateSpecificFields.map((f) => [f.field_code, f.field_name]),
    );

  return (
    <>
      {pipeline.completionToast && (
        <Toast
          message={pipeline.completionToast}
          variant="success"
          duration={2000}
          onDismiss={pipeline.dismissCompletionToast}
        />
      )}

      <VisitSelectDialog
        open={pipeline.showVisitDialog}
        visits={pipeline.visits}
        selectedIndex={pipeline.selectedVisitIndex}
        onSelect={pipeline.setSelectedVisitIndex}
        onConfirm={() => pipeline.confirmVisitSelection()}
        confirming={pipeline.confirmingVisit}
      />

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 lg:grid-cols-2 lg:gap-6">
        <Card className="flex min-h-[42vh] flex-col overflow-hidden lg:min-h-0 lg:h-full">
          <CardContent className="flex min-h-0 flex-1 flex-col pt-6">
            <div className="mb-3 flex shrink-0 flex-wrap items-center justify-between gap-2">
              <h2 className="font-semibold">{t("doctor.flow.medicalPdf")}</h2>
              <div className="flex flex-wrap gap-2">
                {canStartAi && (
                  <Button
                    size="sm"
                    onClick={() => {
                      onReviewPhaseChange?.(true);
                      pipeline.start();
                    }}
                  >
                    {t("doctor.extract.aiRecognition")}
                  </Button>
                )}
                {isRunning && (
                  <Button size="sm" disabled>
                    {t("doctor.extract.recognizing")}
                  </Button>
                )}
                {(isRunning || pipeline.showVisitDialog) && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={pipeline.confirmingCancel}
                    onClick={() => void pipeline.cancel()}
                  >
                    {pipeline.confirmingCancel ? t("doctor.extract.cancelling") : t("doctor.extract.cancel")}
                  </Button>
                )}
                {pipeline.phase === "failed" && (
                  <Button size="sm" variant="outline" onClick={pipeline.retry}>
                    {t("doctor.extract.retry")}
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  disabled={resetting || isRunning || pipeline.confirmingCancel}
                  onClick={onResetUpload}
                >
                  {resetting ? t("doctor.common.processing") : t("doctor.flow.reupload")}
                </Button>
              </div>
            </div>
            <AiGlowBorder
              active={isRunning}
              className="min-h-0 flex-1"
              innerClassName="relative min-h-0"
            >
              <iframe
                title={t("doctor.flow.medicalPdf")}
                src={`/api/doctor/extraction-tasks/${taskNo}/pdf`}
                className="h-full w-full"
              />
              {isRunning && (
                <PdfExtractionOverlay
                  currentStepId={pipeline.currentStepId}
                  stepStatuses={pipeline.stepStatuses}
                  phase={pipeline.phase}
                  showVisitDialog={pipeline.showVisitDialog}
                  progressLabel={pipeline.progressLabel}
                />
              )}
            </AiGlowBorder>
          </CardContent>
        </Card>

        <Card className="flex min-h-[42vh] flex-col overflow-hidden lg:min-h-0 lg:h-full">
          <CardContent className="flex min-h-0 flex-1 flex-col gap-3 pt-6">
            <div className="shrink-0">
              <h2 className="font-semibold">{t("doctor.flow.standardReview")}</h2>
              <p className="mt-1 text-sm text-[var(--color-muted-foreground)]">
                {isReviewReady
                  ? t("doctor.flow.reviewHint")
                  : isRunning
                    ? t("doctor.extract.runningHint")
                    : t("doctor.extract.startHint")}
              </p>
            </div>

            <div className="relative min-h-0 flex-1">
              {isReviewReady && review ? (
                <ExtractionReviewForm
                  fields={review.display_fields}
                  fieldOrder={fieldOrder}
                  saving={savingReview}
                  confirming={confirmingReview}
                  isConfirmed={false}
                  onSave={onSaveReview}
                  onConfirm={onConfirmReview}
                  showConfirm
                  confirmLabel={t("doctor.flow.finishReview")}
                  layout="panel"
                  templateSpecificFieldCodes={reviewTemplateCodes}
                  fieldLabels={reviewFieldLabels}
                />
              ) : (
                <div className="flex h-full min-h-0 flex-col">
                  <div className="min-h-0 flex-1 overflow-y-auto pr-1">
                    <StandardFieldsPlaceholder
                      templateSpecificFields={templateSpecificFields}
                    />
                  </div>
                  {pipeline.phase === "failed" && (
                    <div className="shrink-0 space-y-2 border-t border-[var(--color-border)] pt-4">
                      <p className="text-sm text-[var(--color-destructive)]">
                        {pipeline.error ?? t("doctor.extract.failed")}
                      </p>
                      {pipeline.task?.error_message && (
                        <p className="text-xs text-[var(--color-muted-foreground)]">
                          {pipeline.task.error_message}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            {(saveError || confirmError) && (
              <p className="shrink-0 text-sm text-[var(--color-destructive)]">
                {saveError ?? confirmError}
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
