"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { ApiError, claims } from "@acuity/api-client";
import type { ClaimOut } from "@acuity/types";
import {
  Button,
  Callout,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  SparkleIcon,
  cn,
  useToast,
} from "@acuity/ui";
import { useApi } from "@/lib/use-api";
import { useApiErrorMessage } from "@/lib/api-error";
import { useCatalog } from "@/lib/catalog";
import { formatPatientDisplay } from "@/lib/patient-name";
import type { Locale } from "@/i18n/routing";
import { LoopScaffold } from "@/components/loop/loop-scaffold";
import { ResizableSplit } from "@/components/loop/resizable-split";
import { ReviewSurfaceSkeleton } from "@/components/ui/loaders";
import { ErrorPanel } from "@/components/ui/states";
import { ClaimNotFound } from "@/components/ui/claim-not-found";
import { useRouter } from "@acuity/i18n/navigation";
import { AiGlowBorder } from "./ai-glow-border";
import { PdfExtractionOverlay } from "./pdf-extraction-overlay";
import { StandardFieldsPlaceholder } from "./standard-fields-placeholder";
import {
  ExtractionReviewForm,
  type ReviewFieldValue,
} from "./extraction-review-form";
import { orderFieldCodes } from "./field-catalog";
import { useClaimAiExtract } from "./use-claim-ai-extract";

type ClaimWithTask = ClaimOut & {
  extraction_task_no?: string | null;
  generated_pdf_url?: string | null;
};

type PdfTab = "source" | "form";

type TemplateSpecificAiField = Awaited<
  ReturnType<typeof claims.listTemplateSpecificAiFields>
>[number];

function mergeReviewFieldsWithClaim(
  reviewFields: Record<string, ReviewFieldValue>,
  claimValues: Record<string, string | null> | null | undefined,
): Record<string, ReviewFieldValue> {
  if (!claimValues) return reviewFields;
  const merged: Record<string, ReviewFieldValue> = { ...reviewFields };
  for (const [code, value] of Object.entries(claimValues)) {
    const existing = merged[code];
    if (existing) {
      merged[code] = { ...existing, value };
    } else {
      merged[code] = {
        value,
        status: "edited",
        confidence: 1,
      };
    }
  }
  return merged;
}

async function persistReviewValues(
  claimId: number,
  taskNo: string | null,
  values: Record<string, string | null>,
) {
  if (taskNo) {
    await claims.saveExtractionReviewOutput(taskNo, values);
  }
  await claims.updateClaimFields(claimId, { final_field_values: values });
}

// Extract step — parity with doctor web MedicalRecordReviewPanel:
// AI glow on PDF, frosted step overlay, visit select, standard-field
// placeholder → editable review form, re-upload + AI Extract controls.

export function MedicalReview({ claimId }: { claimId: number }) {
  const t = useTranslations("medical-review");
  const locale = useLocale() as Locale;
  const catalog = useCatalog();
  const router = useRouter();
  const searchParams = useSearchParams();
  const apiMessage = useApiErrorMessage();
  const { showToast } = useToast();
  const claimState = useApi<ClaimWithTask>(() => claims.getClaim(claimId), [claimId]);
  const [pdfTab, setPdfTab] = useState<PdfTab>("source");
  const [templateSpecificFields, setTemplateSpecificFields] = useState<
    TemplateSpecificAiField[]
  >([]);
  const [actionError, setActionError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();
  const [formPdfReady, setFormPdfReady] = useState(false);
  const [formPdfVersion, setFormPdfVersion] = useState(0);
  const [previewingPdf, setPreviewingPdf] = useState(false);
  const appliedExtractionRef = useRef<string | null>(null);

  const taskNo =
    searchParams.get("task") ||
    claimState.data?.extraction_task_no ||
    null;

  const pipeline = useClaimAiExtract(claimId, taskNo);

  const sourcePdfUrl = useMemo(
    () => (taskNo ? claims.medicalPdfPreviewUrl(taskNo) : null),
    [taskNo],
  );
  const formPdfUrl = useMemo(() => {
    const base = claims.claimFormPdfUrl(claimId);
    const cacheKey =
      formPdfVersion ||
      claimState.data?.updated_at ||
      claimState.data?.generated_pdf_url ||
      claimId;
    return `${base}?v=${encodeURIComponent(String(cacheKey))}`;
  }, [claimId, claimState.data?.generated_pdf_url, claimState.data?.updated_at, formPdfVersion]);

  useEffect(() => {
    appliedExtractionRef.current = null;
  }, [claimId, taskNo]);

  useEffect(() => {
    let cancelled = false;
    void claims
      .listTemplateSpecificAiFields(claimId)
      .then((rows) => {
        if (!cancelled) setTemplateSpecificFields(rows);
      })
      .catch(() => {
        if (!cancelled) setTemplateSpecificFields([]);
      });
    return () => {
      cancelled = true;
    };
  }, [claimId]);

  useEffect(() => {
    void pipeline.refreshReview();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskNo]);

  useEffect(() => {
    if (!pipeline.completionToast) return;
    showToast(pipeline.completionToast);
    pipeline.dismissCompletionToast();
    // Only react to toast text changes — dismiss is stable enough for one-shot.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pipeline.completionToast, showToast]);

  useEffect(() => {
    const claim = claimState.data;
    if (!claim) {
      setFormPdfReady(false);
      return;
    }
    setFormPdfReady(
      Boolean(claim.generated_pdf_url) ||
        claim.status === "CONFIRMED" ||
        claim.status === "PRINTED",
    );
  }, [claimState.data]);

  // Apply extraction once per review load — never re-apply after the doctor
  // has saved edits (that race was wiping PUT /fields).
  useEffect(() => {
    if (!pipeline.review) return;
    const applyKey = `${claimId}:${taskNo ?? ""}`;
    if (appliedExtractionRef.current === applyKey) return;
    // Already have saved claim values — skip overwrite.
    if (
      claimState.data?.status === "AI_FILLED" &&
      claimState.data.final_field_values &&
      Object.keys(claimState.data.final_field_values).length > 0
    ) {
      appliedExtractionRef.current = applyKey;
      return;
    }
    let cancelled = false;
    appliedExtractionRef.current = applyKey;
    void (async () => {
      try {
        await claims.applyExtraction(claimId);
        if (!cancelled) await claimState.refetch();
      } catch {
        if (!cancelled) appliedExtractionRef.current = null;
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pipeline.review, claimId, taskNo]);

  const review = pipeline.review;
  const reviewFields = review?.display_fields ?? review?.standard_fields ?? {};
  const formFields = useMemo(
    () =>
      mergeReviewFieldsWithClaim(
        reviewFields,
        claimState.data?.final_field_values as Record<string, string | null> | undefined,
      ),
    [reviewFields, claimState.data?.final_field_values],
  );
  const fieldOrder = review
    ? orderFieldCodes(Object.keys(formFields))
    : [];
  const reviewTemplateCodes =
    review?.template_specific_field_codes ??
    templateSpecificFields.map((f) => f.field_code);
  const reviewFieldLabels =
    review?.field_labels ??
    Object.fromEntries(templateSpecificFields.map((f) => [f.field_code, f.field_name]));

  function handleReupload() {
    setActionError(null);
    startTransition(async () => {
      try {
        await claims.resetMedicalUpload(claimId);
        router.push(`/forms/${claimId}/intake`);
      } catch (cause) {
        setActionError(cause instanceof ApiError ? cause.message : apiMessage(undefined));
      }
    });
  }

  async function handleSave(values: Record<string, string | null>) {
    setSaving(true);
    setPreviewingPdf(true);
    setActionError(null);
    try {
      await persistReviewValues(claimId, taskNo, values);
      // Keep in-memory review in sync so remount/reset keeps doctor edits.
      await pipeline.refreshReview();
      await claims.generateClaimPdf(claimId);
      setFormPdfReady(true);
      setFormPdfVersion((v) => v + 1);
      setPdfTab("form");
      showToast(t("saved"));
      await claimState.refetch();
    } catch (cause) {
      setActionError(cause instanceof ApiError ? cause.message : apiMessage(undefined));
    } finally {
      setSaving(false);
      setPreviewingPdf(false);
    }
  }

  async function handleConfirm(values: Record<string, string | null>) {
    setConfirming(true);
    setActionError(null);
    try {
      await persistReviewValues(claimId, taskNo, values);
      if (claimState.data?.status === "DRAFT") {
        await claims.applyExtraction(claimId);
      }
      await claims.confirmClaim(claimId);
      showToast(t("confirmed"));
      router.push(`/forms/${claimId}/produce`);
    } catch (cause) {
      setActionError(cause instanceof ApiError ? cause.message : apiMessage(undefined));
    } finally {
      setConfirming(false);
    }
  }

  if (claimState.error?.kind === "not_found") {
    return (
      <LoopScaffold step={2} heading={t("step-heading")} headingHidden confirmLeave={false} wide>
        <ClaimNotFound />
      </LoopScaffold>
    );
  }

  if (claimState.loading) {
    return (
      <LoopScaffold step={2} heading={t("step-heading")} headingHidden confirmLeave={false} wide>
        <ReviewSurfaceSkeleton label={t("loading")} />
      </LoopScaffold>
    );
  }

  if (claimState.error) {
    return (
      <LoopScaffold step={2} heading={t("step-heading")} confirmLeave={false} wide>
        <ErrorPanel
          title={t("error-title")}
          description={apiMessage(claimState.error)}
          action={
            <Button variant="outline" size="sm" onClick={claimState.refetch}>
              {t("retry")}
            </Button>
          }
        />
      </LoopScaffold>
    );
  }

  if (!sourcePdfUrl || !taskNo) {
    return (
      <LoopScaffold
        step={2}
        heading={t("step-heading")}
        confirmLeave={false}
        wide
        footerEnd={
          <Button size="lg" variant="outline" onClick={() => router.push(`/forms/${claimId}/intake`)}>
            {t("back-upload")}
          </Button>
        }
      >
        <Callout tone="warning">{t("missing-pdf")}</Callout>
      </LoopScaffold>
    );
  }

  const footerHint = pipeline.isReviewReady
    ? t("fields-hint-done")
    : pipeline.isRunning
      ? t("running-hint")
      : t("start-hint");

  return (
    <LoopScaffold
      step={2}
      heading={t("step-heading")}
      headingHidden
      wide
      footerStart={<span className="text-sm text-muted-foreground">{footerHint}</span>}
      footerEnd={
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button
            size="lg"
            variant="outline"
            disabled={pending || pipeline.isRunning || pipeline.confirmingCancel}
            loading={pending}
            onClick={handleReupload}
          >
            {t("reupload")}
          </Button>
          {pipeline.canStartAi ? (
            <Button
              size="lg"
              onClick={() => {
                setActionError(null);
                pipeline.start();
              }}
            >
              <SparkleIcon size={18} aria-hidden />
              {t("ai-extract")}
            </Button>
          ) : null}
          {pipeline.isRunning ? (
            <>
              <Button size="lg" disabled>
                {t("recognizing")}
              </Button>
              <Button
                size="lg"
                variant="outline"
                disabled={pipeline.confirmingCancel}
                loading={pipeline.confirmingCancel}
                onClick={() => void pipeline.cancel()}
              >
                {t("cancel-ai")}
              </Button>
            </>
          ) : null}
          {pipeline.phase === "failed" ? (
            <Button size="lg" variant="outline" onClick={pipeline.retry}>
              {t("retry-ai")}
            </Button>
          ) : null}
        </div>
      }
    >
      {(actionError || pipeline.error) && (
        <div className="mb-3 shrink-0">
          <Callout tone="danger">{actionError || pipeline.error}</Callout>
        </div>
      )}

      <div className="flex min-h-0 flex-1 flex-col">
        <ResizableSplit
          ariaLabel={t("step-heading")}
          defaultLeftPct={48}
          minPct={32}
          maxPct={62}
          left={
            <div className="flex h-full min-h-0 flex-col gap-2">
              <div className="flex shrink-0 flex-wrap items-center justify-between gap-2">
                <div
                  role="tablist"
                  aria-label={t("pdf-tabs-label")}
                  className="inline-flex rounded-md border border-border bg-card p-0.5"
                >
                  {(
                    [
                      { key: "source" as const, label: t("tab-source") },
                      { key: "form" as const, label: t("tab-form") },
                    ] as const
                  ).map((tab) => (
                    <button
                      key={tab.key}
                      type="button"
                      role="tab"
                      aria-selected={pdfTab === tab.key}
                      onClick={() => setPdfTab(tab.key)}
                      className={cn(
                        "min-h-9 rounded-sm px-3 text-sm font-medium transition-colors duration-[120ms]",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        pdfTab === tab.key
                          ? "bg-primary text-primary-foreground"
                          : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
              </div>

              {pdfTab === "source" ? (
                <AiGlowBorder
                  active={pipeline.isRunning}
                  className="min-h-0 flex-1"
                  innerClassName="relative min-h-0"
                >
                  <iframe title={t("tab-source")} src={sourcePdfUrl} className="h-full w-full" />
                  {pipeline.isRunning ? (
                    <PdfExtractionOverlay
                      currentStepId={pipeline.currentStepId}
                      stepStatuses={pipeline.stepStatuses}
                      phase={pipeline.phase}
                      showVisitDialog={pipeline.showVisitDialog}
                      progressLabel={pipeline.progressLabel}
                    />
                  ) : null}
                </AiGlowBorder>
              ) : (
                <div className="relative min-h-0 flex-1 overflow-hidden rounded-md border border-border bg-card">
                  {formPdfReady ? (
                    <iframe title={t("tab-form")} src={formPdfUrl} className="h-full w-full" />
                  ) : (
                    <div className="flex h-full items-center justify-center p-6 text-center text-sm text-muted-foreground">
                      {t("form-pdf-empty")}
                    </div>
                  )}
                  {previewingPdf ? (
                    <div className="absolute inset-0 flex items-center justify-center bg-card/80 text-sm text-muted-foreground">
                      {t("form-pdf-generating")}
                    </div>
                  ) : null}
                </div>
              )}
            </div>
          }
          right={
            <div className="flex h-full min-h-0 flex-col gap-2">
              <div className="shrink-0">
                <h2 className="text-sm font-medium text-foreground">{t("fields-title")}</h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  {pipeline.isReviewReady
                    ? t("fields-hint-done")
                    : pipeline.isRunning
                      ? t("running-hint")
                      : t("start-hint")}
                </p>
              </div>
              <div className="relative min-h-0 flex-1">
                {pipeline.isReviewReady && review ? (
                  <ExtractionReviewForm
                    fields={formFields}
                    fieldOrder={fieldOrder}
                    saving={saving}
                    confirming={confirming}
                    onSave={handleSave}
                    onConfirm={handleConfirm}
                    companyLabel={
                      claimState.data
                        ? catalog.companyName(claimState.data.company_id, locale)
                        : ""
                    }
                    formLabel={
                      claimState.data
                        ? catalog.formName(claimState.data.template_id, locale)
                        : ""
                    }
                    patientLabel={formatPatientDisplay(claimState.data ?? {}) || "—"}
                    templateSpecificFieldCodes={reviewTemplateCodes}
                    fieldLabels={reviewFieldLabels}
                  />
                ) : (
                  <div className="flex h-full min-h-0 flex-col">
                    <div className="slim-scroll min-h-0 flex-1 overflow-y-auto pr-1">
                      <StandardFieldsPlaceholder
                        templateSpecificFields={templateSpecificFields}
                      />
                    </div>
                    {pipeline.phase === "failed" ? (
                      <div className="shrink-0 space-y-2 border-t border-border pt-4">
                        <p className="text-sm text-destructive">
                          {pipeline.error ?? t("failed")}
                        </p>
                      </div>
                    ) : null}
                  </div>
                )}
              </div>
            </div>
          }
        />
      </div>

      <Dialog
        open={pipeline.showVisitDialog}
        onOpenChange={(open) => {
          if (!open) void pipeline.cancel();
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("visit-title")}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">{t("visit-hint")}</p>
          <div className="max-h-64 space-y-2 overflow-y-auto">
            {pipeline.visits.map((visit) => {
              const selected = pipeline.selectedVisitIndex === visit.visit_index;
              return (
                <label
                  key={visit.visit_index}
                  className={cn(
                    "flex cursor-pointer items-start gap-3 rounded-md border p-3 text-sm",
                    selected ? "border-primary bg-muted" : "border-border",
                  )}
                >
                  <input
                    type="radio"
                    name="visit"
                    className="mt-1"
                    checked={selected}
                    onChange={() => pipeline.setSelectedVisitIndex(visit.visit_index)}
                  />
                  <div className="space-y-1">
                    <div className="font-medium text-foreground">
                      {t("visit-option", {
                        index: visit.visit_index,
                        date: visit.visit_date ?? "—",
                      })}
                    </div>
                    <div className="text-muted-foreground">{visit.summary ?? "—"}</div>
                    {visit.page_range?.length >= 2 ? (
                      <div className="text-xs text-muted-foreground">
                        {t("page-range", {
                          start: visit.page_range[0] ?? 0,
                          end: visit.page_range[1] ?? 0,
                        })}
                      </div>
                    ) : null}
                  </div>
                </label>
              );
            })}
          </div>
          <DialogFooter>
            <Button
              type="button"
              disabled={pipeline.selectedVisitIndex == null || pipeline.confirmingVisit}
              loading={pipeline.confirmingVisit}
              onClick={() => void pipeline.confirmVisitSelection()}
            >
              {t("visit-confirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </LoopScaffold>
  );
}
