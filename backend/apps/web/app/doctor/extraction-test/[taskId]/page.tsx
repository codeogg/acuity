"use client";

import Link from "next/link";
import { use, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";

import { ExtractionReviewForm } from "@/components/extraction/ExtractionReviewForm";
import { PipelineProgress } from "@/components/extraction/PipelineProgress";
import { VisitSelectDialog } from "@/components/extraction/VisitSelectDialog";
import { useExtractionPipeline } from "@/components/extraction/useExtractionPipeline";
import { PageHeader } from "@/components/shared/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { apiFetch, ApiRequestError } from "@/lib/api/client";
import type { Step11SaveReviewOutput } from "@/lib/api/types";
import { orderFieldCodes } from "@/lib/extraction/field-order";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n/I18nProvider";

export default function ExtractionTaskPage({
  params,
}: {
  params: Promise<{ taskId: string }>;
}) {
  const { taskId } = use(params);
  const { t } = useI18n();
  const pipeline = useExtractionPipeline(taskId);

  useEffect(() => {
    pipeline.start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskId]);

  const saveReview = useMutation({
    mutationFn: (values: Record<string, string | null>) =>
      apiFetch<Step11SaveReviewOutput>(
        `/api/doctor/extraction-tasks/${taskId}/review-output`,
        {
          method: "PUT",
          body: {
            fields: Object.fromEntries(
              Object.entries(values).map(([code, value]) => [code, { value }]),
            ),
          },
        },
      ),
    onSuccess: (data) => {
      pipeline.applyReview(data.review);
    },
  });

  const isReviewReady =
    pipeline.phase === "review" ||
    pipeline.phase === "completed" ||
    !!pipeline.review;
  const task = pipeline.task;
  const review = pipeline.review;
  const fieldOrder = review
    ? orderFieldCodes(Object.keys(review.display_fields))
    : [];

  return (
    <div className={cn("mx-auto", isReviewReady ? "max-w-screen-2xl" : "max-w-7xl", isReviewReady && "flex flex-col lg:h-[calc(100dvh-7rem)] lg:min-h-0 lg:overflow-hidden")}>
      <PageHeader
        title={t("doctor.extractionTest.taskTitle")}
        description={t("doctor.extractionTest.task", { id: task?.task_id ?? taskId })}
        action={
          <Link
            href="/doctor/extraction-test"
            className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
          >
            {t("doctor.extractionTest.reupload")}
          </Link>
        }
      />

      <div className={cn(isReviewReady && "flex min-h-0 flex-1 flex-col")}>
      <VisitSelectDialog
        open={pipeline.showVisitDialog}
        visits={pipeline.visits}
        selectedIndex={pipeline.selectedVisitIndex}
        onSelect={pipeline.setSelectedVisitIndex}
        onConfirm={() => pipeline.confirmVisitSelection()}
        confirming={pipeline.confirmingVisit}
      />

      {pipeline.phase === "failed" && (
        <Card className="mb-6 border-red-200">
          <CardContent className="space-y-3 pt-6">
            <h2 className="font-semibold text-[var(--color-destructive)]">{t("doctor.extractionTest.failed")}</h2>
            <p className="text-sm">{pipeline.error ?? t("doctor.common.unknownError")}</p>
            {task?.error_message && (
              <p className="text-xs text-[var(--color-muted-foreground)]">
                {task.error_message}
              </p>
            )}
            <Button variant="outline" onClick={pipeline.retry}>
              {t("doctor.common.retry")}
            </Button>
          </CardContent>
        </Card>
      )}

      {!isReviewReady && pipeline.phase !== "failed" && (
        <Card className="mb-6">
          <CardContent className="pt-6">
            <p className="mb-4 text-sm text-[var(--color-muted-foreground)]">
              {t("doctor.extractionTest.pipelineHint")}
            </p>
            <PipelineProgress
              stepStatuses={pipeline.stepStatuses}
              currentStepId={pipeline.currentStepId}
            />
            {task && (
              <p className="mt-4 text-xs text-[var(--color-muted-foreground)] border-t border-[var(--color-border)] pt-3">
                {t("doctor.extractionTest.taskStatus", {
                  status: t(`doctor.extractionStatus.${task.status}`),
                })}
                {task.current_step ? ` · ${task.current_step}` : ""}
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {isReviewReady && task && review && (
        <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 lg:grid-cols-2 lg:gap-6">
          <Card className="flex min-h-[42vh] flex-col overflow-hidden lg:min-h-0 lg:h-full">
            <CardContent className="flex min-h-0 flex-1 flex-col pt-6">
              <div className="mb-3 flex shrink-0 flex-wrap items-center gap-2">
                <h2 className="font-semibold">{t("doctor.flow.medicalPdf")}</h2>
                <Badge variant="secondary">{task.original_filename}</Badge>
              </div>
              <div className="min-h-0 flex-1 overflow-hidden rounded-md border border-[var(--color-border)] bg-white">
                <iframe
                  title={t("doctor.flow.medicalPdf")}
                  src={`/api/doctor/extraction-tasks/${taskId}/pdf`}
                  className="h-full w-full"
                />
              </div>
            </CardContent>
          </Card>

          <Card className="flex min-h-[42vh] flex-col overflow-hidden lg:min-h-0 lg:h-full">
            <CardContent className="flex min-h-0 flex-1 flex-col gap-3 pt-6">
              <div className="shrink-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="font-semibold">{t("doctor.flow.standardReview")}</h2>
                  {review.insurance_company && (
                    <Badge variant="secondary">{review.insurance_company}</Badge>
                  )}
                  {review.is_confirmed && (
                    <Badge variant="secondary">{t("doctor.common.saved")}</Badge>
                  )}
                </div>
                <p className="mt-1 text-sm text-[var(--color-muted-foreground)]">
                  {t("doctor.flow.reviewHint")}
                </p>
              </div>
              <div className="min-h-0 flex-1">
                <ExtractionReviewForm
                  fields={review.display_fields}
                  fieldOrder={fieldOrder}
                  saving={saveReview.isPending}
                  confirming={false}
                  isConfirmed={false}
                  onSave={(values) => saveReview.mutate(values)}
                  onConfirm={(_values) => {}}
                  showConfirm={false}
                  layout="panel"
                  templateSpecificFieldCodes={
                    review.template_specific_field_codes ?? []
                  }
                  fieldLabels={review.field_labels ?? null}
                />
              </div>
              {saveReview.error instanceof ApiRequestError && (
                <p className="shrink-0 text-sm text-[var(--color-destructive)]">
                  {saveReview.error.message}
                </p>
              )}
              {saveReview.isSuccess && (
                <p className="shrink-0 text-sm text-green-700">{t("doctor.extractionTest.savedChanges")}</p>
              )}
            </CardContent>
          </Card>
        </div>
      )}
      </div>
    </div>
  );
}
