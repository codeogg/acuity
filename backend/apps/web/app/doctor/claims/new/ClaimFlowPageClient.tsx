"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { ExtractionReviewForm } from "@/components/extraction/ExtractionReviewForm";
import { AiFieldReviewForm } from "@/components/claim/AiFieldReviewForm";
import { MedicalPdfUploadZone } from "@/components/claim/MedicalPdfUploadZone";
import { MedicalRecordReviewPanel } from "@/components/claim/MedicalRecordReviewPanel";
import { PdfPreviewPrint } from "@/components/claim/PdfPreviewPrint";
import { ClaimStatusBadge } from "@/components/shared/ClaimStatusBadge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { apiFetch, ApiRequestError, resolveApiBaseUrl } from "@/lib/api/client";
import type { Claim, ExtractionReviewOutput } from "@/lib/api/types";
import {
  applyClaimExtraction,
  resetClaimMedicalUpload,
  uploadClaimMedicalPdf,
} from "@/lib/claim/extraction";
import {
  appendQueryParam,
  claimFlowUrl,
  resolveClaimBack,
} from "@/lib/doctor/utils";
import { revertClaimToReview, markClaimPrinted } from "@/lib/claim/pdf";
import { orderFieldCodes } from "@/lib/extraction/field-order";
import { fetchReviewOutput } from "@/lib/extraction/pipeline";
import { cn } from "@/lib/utils";
import { ChevronLeft } from "lucide-react";
import { useI18n } from "@/lib/i18n/I18nProvider";

function resolveUrl(url: string): string {
  if (!url.startsWith("/local-storage")) return url;
  const base = resolveApiBaseUrl();
  return base ? `${base}${url}` : url;
}

type Step = "record" | "review" | "preview";

function stepForStatus(status: Claim["status"]): Step {
  switch (status) {
    case "DRAFT":
      return "record";
    case "AI_FILLED":
      return "review";
    case "CONFIRMED":
    case "PRINTED":
      return "preview";
    default:
      return "record";
  }
}

export default function ClaimFlowPageClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const claimId = Number(searchParams.get("id") ?? 0);
  const stepParam = (searchParams.get("step") ?? "record") as Step;
  const pdfVersion = searchParams.get("pdfv");
  const backParam = searchParams.get("back");
  const { locale, t } = useI18n();
  const backTarget = resolveClaimBack(backParam, locale);
  const qc = useQueryClient();

  const [patientName, setPatientName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [reviewModeActive, setReviewModeActive] = useState(false);

  const claim = useQuery({
    queryKey: ["claim", claimId],
    enabled: claimId > 0,
    queryFn: () => apiFetch<Claim>(`/api/doctor/claims/${claimId}`),
  });

  const c = claim.data;
  const taskNo = c?.extraction_task_no ?? null;

  const reviewQuery = useQuery({
    queryKey: ["claim-extraction-review", taskNo],
    enabled: !!taskNo && stepParam === "review",
    queryFn: () => fetchReviewOutput(taskNo!),
  });

  useEffect(() => {
    if (!c) return;
    const expected = stepForStatus(c.status);
    if (stepParam !== expected && c.status !== "PRINTED") {
      router.replace(claimFlowUrl(claimId, c.status, backParam ?? undefined));
    }
  }, [c, stepParam, claimId, router, backParam]);

  useEffect(() => {
    if (c?.patient_name) setPatientName(c.patient_name);
  }, [c?.patient_name, c?.id]);

  const invalidate = useCallback(() => {
    qc.invalidateQueries({ queryKey: ["claim", claimId] });
    qc.invalidateQueries({ queryKey: ["doctor-home"] });
  }, [qc, claimId]);

  const handleError = (e: unknown) =>
    setError(e instanceof ApiRequestError ? e.message : t("doctor.common.operationFailed"));

  const uploadPdfMut = useMutation({
    mutationFn: (file: File) =>
      uploadClaimMedicalPdf(claimId, file, patientName || undefined),
    onSuccess: () => {
      setError(null);
      setSelectedFile(null);
      if (taskNo) {
        qc.removeQueries({ queryKey: ["claim-extraction-review", taskNo] });
      }
      invalidate();
    },
    onError: handleError,
  });

  const resetMedicalUploadMut = useMutation({
    mutationFn: () => resetClaimMedicalUpload(claimId),
    onSuccess: (updated: Claim) => {
      setError(null);
      setSelectedFile(null);
      setReviewModeActive(false);
      if (taskNo) {
        qc.removeQueries({ queryKey: ["claim-extraction-review", taskNo] });
      }
      qc.setQueryData(["claim", claimId], updated);
      invalidate();
      router.push(
        backParam
          ? `/doctor/claims/new?id=${claimId}&step=record&back=${encodeURIComponent(backParam)}`
          : `/doctor/claims/new?id=${claimId}&step=record`,
      );
    },
    onError: handleError,
  });

  const saveReviewMut = useMutation({
    mutationFn: async (values: Record<string, string | null>) => {
      if (taskNo) {
        await apiFetch(`/api/doctor/extraction-tasks/${taskNo}/review-output`, {
          method: "PUT",
          body: {
            fields: Object.fromEntries(
              Object.entries(values).map(([code, value]) => [code, { value }]),
            ),
          },
        });
      }
      return apiFetch(`/api/doctor/claims/${claimId}/fields`, {
        method: "PUT",
        body: { final_field_values: values },
      });
    },
    onMutate: () => {
      setError(null);
    },
    onSuccess: () => {
      setError(null);
      if (taskNo) {
        qc.invalidateQueries({ queryKey: ["claim-extraction-review", taskNo] });
      }
      invalidate();
    },
    onError: handleError,
  });

  const confirmReviewMut = useMutation({
    mutationFn: async (values: Record<string, string | null>) => {
      if (taskNo) {
        await apiFetch(`/api/doctor/extraction-tasks/${taskNo}/review-output`, {
          method: "PUT",
          body: {
            fields: Object.fromEntries(
              Object.entries(values).map(([code, value]) => [code, { value }]),
            ),
          },
        });
      }
      await apiFetch(`/api/doctor/claims/${claimId}/fields`, {
        method: "PUT",
        body: { final_field_values: values },
      });
      const current = await apiFetch<Claim>(`/api/doctor/claims/${claimId}`);
      if (current.status === "DRAFT") {
        await applyClaimExtraction(claimId);
      }
      return apiFetch<Claim>(`/api/doctor/claims/${claimId}/confirm`, { method: "POST" });
    },
    onMutate: () => {
      setError(null);
    },
    onSuccess: (confirmed) => {
      setError(null);
      qc.setQueryData(["claim", claimId], confirmed);
      if (taskNo) {
        qc.invalidateQueries({ queryKey: ["claim-extraction-review", taskNo] });
      }
      invalidate();
      const previewUrl = appendQueryParam(
        `/doctor/claims/new?id=${claimId}&step=preview`,
        "pdfv",
        confirmed.updated_at,
      );
      router.push(
        backParam
          ? appendQueryParam(previewUrl, "back", backParam)
          : previewUrl,
      );
    },
    onError: handleError,
  });

  const revertToReviewMut = useMutation({
    mutationFn: () => revertClaimToReview(claimId),
    onSuccess: (updated) => {
      setError(null);
      qc.setQueryData(["claim", claimId], updated);
      invalidate();
      router.push(
        backParam
          ? `/doctor/claims/new?id=${claimId}&step=review&back=${encodeURIComponent(backParam)}`
          : `/doctor/claims/new?id=${claimId}&step=review`,
      );
    },
    onError: handleError,
  });

  const completePrintedMut = useMutation({
    mutationFn: async () => {
      if (c?.status === "PRINTED") return c;
      return markClaimPrinted(claimId);
    },
    onSuccess: (updated) => {
      setError(null);
      if (updated) {
        qc.setQueryData(["claim", claimId], updated);
      }
      invalidate();
      qc.invalidateQueries({ queryKey: ["doctor-claims"] });
      router.push(backTarget.href);
    },
    onError: handleError,
  });

  if (!claimId) {
    return (
      <p className="text-sm text-[var(--color-muted-foreground)]">
        {t("doctor.flow.missingId")}
      </p>
    );
  }

  if (!c) {
    return <p className="text-sm text-[var(--color-muted-foreground)]">{t("doctor.common.loading")}</p>;
  }

  const review = reviewQuery.data as ExtractionReviewOutput | undefined;
  const fieldOrder = review
    ? orderFieldCodes(Object.keys(review.display_fields))
    : [];
  const usePdfReview = !!taskNo;
  const reviewLoading = usePdfReview && reviewQuery.isLoading;
  const reviewReady = usePdfReview && !!review;
  const recordSplitLayout =
    stepParam === "record" && c.status === "DRAFT" && !!taskNo;
  const wideSplitLayout =
    (stepParam === "review" && usePdfReview) || recordSplitLayout;
  const displayStep =
    stepParam === "record" && taskNo && reviewModeActive ? "review" : stepParam;

  return (
    <div
      className={cn(
        "mx-auto",
        wideSplitLayout ? "max-w-screen-2xl" : "max-w-5xl",
        (stepParam === "review" && reviewReady) || recordSplitLayout
          ? "flex flex-col lg:h-[calc(100dvh-7rem)] lg:min-h-0 lg:overflow-hidden"
          : undefined,
      )}
    >
      <Link
        href={backTarget.href}
        className="mb-4 inline-flex items-center gap-1 text-sm text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]"
      >
        <ChevronLeft className="h-4 w-4" />
        {backTarget.label}
      </Link>

      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">{t("doctor.claim.title", { number: c.submission_no })}</h1>
          {c.patient_name && (
            <p className="mt-1 text-sm text-[var(--color-muted-foreground)]">
              {t("doctor.claim.patient", { name: c.patient_name })}
            </p>
          )}
        </div>
        <ClaimStatusBadge status={c.status} />
      </div>

      <div className="mb-6 flex gap-2 text-xs">
        {(["record", "review", "preview"] as const).map((s, i) => {
          const labels = [
            t("doctor.flow.steps.record"),
            t("doctor.flow.steps.review"),
            t("doctor.flow.steps.preview"),
          ];
          const active = displayStep === s;
          const done =
            (s === "record" && (reviewModeActive || c.status !== "DRAFT")) ||
            (s === "review" && (c.status === "CONFIRMED" || c.status === "PRINTED"));
          return (
            <div
              key={s}
              className={`rounded-md px-3 py-1.5 ${
                active
                  ? "bg-[var(--color-accent-soft)] font-medium text-[var(--color-primary)]"
                  : done
                    ? "text-[var(--color-success)]"
                    : "text-[var(--color-muted-foreground)]"
              }`}
            >
              {i + 1}. {labels[i]}
            </div>
          );
        })}
      </div>

      {error && (
        <div className="mb-4 rounded-md border border-[var(--color-danger-soft)] bg-[var(--color-danger-soft)] px-3 py-2 text-sm text-[var(--color-destructive)]">
          {error}
        </div>
      )}

      {stepParam === "record" && c.status === "DRAFT" && (
        !taskNo ? (
          <Card className="border-[var(--color-border)] bg-[var(--color-surface)]">
            <CardHeader>
              <CardTitle className="text-base">{t("doctor.flow.uploadTitle")}</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <MedicalPdfUploadZone
                patientName={patientName}
                onPatientNameChange={setPatientName}
                selectedFile={selectedFile}
                onFileSelect={(file) => {
                  setSelectedFile(file);
                  setError(null);
                }}
                onUpload={() => {
                  if (!selectedFile) {
                    setError(t("doctor.flow.selectPdf"));
                    return;
                  }
                  uploadPdfMut.mutate(selectedFile);
                }}
                uploading={uploadPdfMut.isPending}
                uploadLabel={t("doctor.flow.upload")}
                hint={t("doctor.flow.uploadHint")}
              />
            </CardContent>
          </Card>
        ) : (
          <MedicalRecordReviewPanel
            claimId={claimId}
            taskNo={taskNo}
            templateId={c.template_id}
            onReviewPhaseChange={setReviewModeActive}
            onResetUpload={() => resetMedicalUploadMut.mutate()}
            resetting={resetMedicalUploadMut.isPending}
            onSaveReview={(values) => {
              setError(null);
              saveReviewMut.reset();
              confirmReviewMut.reset();
              saveReviewMut.mutate(values);
            }}
            savingReview={saveReviewMut.isPending}
            saveError={
              saveReviewMut.isError && saveReviewMut.error instanceof ApiRequestError
                ? saveReviewMut.error.message
                : null
            }
            onConfirmReview={(values) => {
              setError(null);
              saveReviewMut.reset();
              confirmReviewMut.reset();
              confirmReviewMut.mutate(values);
            }}
            confirmingReview={confirmReviewMut.isPending}
            confirmError={
              confirmReviewMut.isError && confirmReviewMut.error instanceof ApiRequestError
                ? confirmReviewMut.error.message
                : null
            }
          />
        )
      )}

      {stepParam === "review" && (c.status === "AI_FILLED" || c.status === "CONFIRMED") && (
        reviewLoading ? (
          <Card className="border-[var(--color-border)] bg-[var(--color-surface)]">
            <CardContent className="pt-6">
              <p className="text-sm text-[var(--color-muted-foreground)]">
                {t("doctor.flow.reviewLoading")}
              </p>
            </CardContent>
          </Card>
        ) : reviewReady ? (
          <div
            className={cn(
              "grid min-h-0 flex-1 grid-cols-1 gap-4 lg:grid-cols-2 lg:gap-6",
            )}
          >
            <Card className="flex min-h-[42vh] flex-col overflow-hidden lg:min-h-0 lg:h-full">
              <CardContent className="flex min-h-0 flex-1 flex-col pt-6">
                <div className="mb-3 flex shrink-0 items-center justify-between gap-2">
                  <h2 className="font-semibold">{t("doctor.flow.medicalPdf")}</h2>
                  {c.status === "AI_FILLED" && (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={resetMedicalUploadMut.isPending}
                      onClick={() => resetMedicalUploadMut.mutate()}
                    >
                      {resetMedicalUploadMut.isPending ? t("doctor.common.processing") : t("doctor.flow.reupload")}
                    </Button>
                  )}
                </div>
                <div className="min-h-0 flex-1 overflow-hidden rounded-md border border-[var(--color-border)] bg-white">
                  <iframe
                    title={t("doctor.flow.medicalPdf")}
                    src={`/api/doctor/extraction-tasks/${taskNo}/pdf`}
                    className="h-full w-full"
                  />
                </div>
              </CardContent>
            </Card>

            <Card className="flex min-h-[42vh] flex-col overflow-hidden lg:min-h-0 lg:h-full">
              <CardContent className="flex min-h-0 flex-1 flex-col gap-3 pt-6">
                <div className="shrink-0">
                  <h2 className="font-semibold">{t("doctor.flow.standardReview")}</h2>
                  <p className="mt-1 text-sm text-[var(--color-muted-foreground)]">
                    {t("doctor.flow.reviewHint")}
                  </p>
                </div>
                <div className="min-h-0 flex-1">
                  <ExtractionReviewForm
                    fields={review.display_fields}
                    fieldOrder={fieldOrder}
                    saving={saveReviewMut.isPending}
                    confirming={confirmReviewMut.isPending}
                    isConfirmed={c.status === "CONFIRMED"}
                    onSave={(values) => {
                      setError(null);
                      saveReviewMut.reset();
                      confirmReviewMut.reset();
                      saveReviewMut.mutate(values);
                    }}
                    onConfirm={(values) => {
                      setError(null);
                      saveReviewMut.reset();
                      confirmReviewMut.reset();
                      confirmReviewMut.mutate(values);
                    }}
                    showConfirm={c.status === "AI_FILLED"}
                    confirmLabel={t("doctor.flow.finishReview")}
                    layout="panel"
                    templateSpecificFieldCodes={
                      review.template_specific_field_codes ?? []
                    }
                    fieldLabels={review.field_labels ?? null}
                  />
                </div>
                {saveReviewMut.isError &&
                  saveReviewMut.error instanceof ApiRequestError && (
                  <p className="shrink-0 text-sm text-[var(--color-destructive)]">
                    {saveReviewMut.error.message}
                  </p>
                )}
                {confirmReviewMut.isError &&
                  confirmReviewMut.error instanceof ApiRequestError && (
                  <p className="shrink-0 text-sm text-[var(--color-destructive)]">
                    {confirmReviewMut.error.message}
                  </p>
                )}
              </CardContent>
            </Card>
          </div>
        ) : (
          <Card className="border-[var(--color-border)] bg-[var(--color-surface)]">
            <CardHeader className="flex flex-row items-center justify-between gap-2">
              <CardTitle className="text-base">{t("doctor.flow.reviewFields")}</CardTitle>
              {c.status === "AI_FILLED" && usePdfReview && (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={resetMedicalUploadMut.isPending}
                  onClick={() => resetMedicalUploadMut.mutate()}
                >
                  {resetMedicalUploadMut.isPending ? t("doctor.common.processing") : t("doctor.flow.reupload")}
                </Button>
              )}
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <AiFieldReviewForm
                claim={c}
                onSave={(v) => {
                  setError(null);
                  saveReviewMut.reset();
                  confirmReviewMut.reset();
                  saveReviewMut.mutate(v);
                }}
                saving={saveReviewMut.isPending}
                onConfirm={(v) => {
                  setError(null);
                  saveReviewMut.reset();
                  confirmReviewMut.reset();
                  confirmReviewMut.mutate(v);
                }}
                confirming={confirmReviewMut.isPending}
              />
              {saveReviewMut.isError &&
                saveReviewMut.error instanceof ApiRequestError && (
                <p className="text-sm text-[var(--color-destructive)]">
                  {saveReviewMut.error.message}
                </p>
              )}
              {confirmReviewMut.isError &&
                confirmReviewMut.error instanceof ApiRequestError && (
                <p className="text-sm text-[var(--color-destructive)]">
                  {confirmReviewMut.error.message}
                </p>
              )}
            </CardContent>
          </Card>
        )
      )}

      {stepParam === "preview" && (c.status === "CONFIRMED" || c.status === "PRINTED") && (
        <Card className="flex min-h-[75vh] flex-col overflow-hidden border-[var(--color-border)] bg-[var(--color-surface)]">
          <CardHeader className="shrink-0">
            <CardTitle className="text-base">{t("doctor.flow.previewTitle")}</CardTitle>
          </CardHeader>
          <CardContent className="flex min-h-0 flex-1 flex-col p-0">
            <PdfPreviewPrint
              claimId={claimId}
              submissionNo={c.submission_no}
              cacheKey={pdfVersion ?? c.updated_at}
              onRevert={() => revertToReviewMut.mutate()}
              reverting={revertToReviewMut.isPending}
              revertError={
                revertToReviewMut.error instanceof ApiRequestError
                  ? revertToReviewMut.error.message
                  : null
              }
              onComplete={() => completePrintedMut.mutate()}
              completing={completePrintedMut.isPending}
              completeError={
                completePrintedMut.error instanceof ApiRequestError
                  ? completePrintedMut.error.message
                  : null
              }
              alreadyPrinted={c.status === "PRINTED"}
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
