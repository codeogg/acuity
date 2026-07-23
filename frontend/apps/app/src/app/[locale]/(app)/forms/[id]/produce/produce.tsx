"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "@acuity/i18n/navigation";
import { useLocale, useTranslations } from "next-intl";
import { ApiError, claims } from "@acuity/api-client";
import type { ClaimOut } from "@acuity/types";
import {
  AlertIcon,
  Button,
  Callout,
  CheckCircleIcon,
  DownloadIcon,
  cn,
} from "@acuity/ui";
import type { Locale } from "@/i18n/routing";
import { useApi } from "@/lib/use-api";
import { useApiErrorMessage } from "@/lib/api-error";
import { useCatalog } from "@/lib/catalog";
import { formatPatientDisplay } from "@/lib/patient-name";
import { LoopScaffold } from "@/components/loop/loop-scaffold";
import { CatchUpArc } from "@/components/ui/loaders";
import { ClaimNotFound } from "@/components/ui/claim-not-found";
import { toClaimStatus } from "@/components/ui/status-badge";

type Stage = "loading" | "ready" | "delivered" | "error";

function producedFileName(submissionNo: string): string {
  return `${submissionNo}.pdf`;
}

/** Step 4 — preview filled insurer PDF (parity with doctor web confirm → preview). */
export function Produce({ claimId }: { claimId: number }) {
  const t = useTranslations("produce");
  const locale = useLocale() as Locale;
  const router = useRouter();
  const apiMessage = useApiErrorMessage();
  const catalog = useCatalog();
  const claimState = useApi<ClaimOut>(() => claims.getClaim(claimId), [claimId]);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const [stage, setStage] = useState<Stage>("loading");
  const [actionError, setActionError] = useState<string | null>(null);
  const [reverting, setReverting] = useState(false);
  const [completing, setCompleting] = useState(false);
  const ensuringRef = useRef(false);

  const claim = claimState.data;
  const status = claim ? toClaimStatus(claim.status) : null;
  const alreadyPrinted = status === "PRINTED";

  const companyLabel = claim ? catalog.companyName(claim.company_id, locale) : "";
  const formLabel = claim ? catalog.formName(claim.template_id, locale) : "";
  const patientLabel = claim ? formatPatientDisplay(claim) || "—" : "—";

  const pdfUrl = useMemo(() => {
    if (!claim) return null;
    const base = claims.claimFormPdfUrl(claimId);
    const cacheKey = claim.updated_at || claim.generated_pdf_url || claim.id;
    return `${base}?v=${encodeURIComponent(String(cacheKey))}`;
  }, [claim, claimId]);

  // Ensure filled PDF exists (confirm already generates it; regenerate if missing).
  useEffect(() => {
    if (!claim || ensuringRef.current) return;
    if (status !== "CONFIRMED" && status !== "PRINTED") {
      setStage("error");
      setActionError(t("not-ready"));
      return;
    }
    if (claim.generated_pdf_url || alreadyPrinted) {
      setStage(alreadyPrinted ? "delivered" : "ready");
      return;
    }
    ensuringRef.current = true;
    setStage("loading");
    void claims
      .generateClaimPdf(claimId)
      .then(async () => {
        await claimState.refetch();
        setStage("ready");
      })
      .catch((cause) => {
        setStage("error");
        setActionError(cause instanceof ApiError ? cause.message : apiMessage(undefined));
      })
      .finally(() => {
        ensuringRef.current = false;
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [claim?.id, claim?.generated_pdf_url, status, alreadyPrinted]);

  async function handleRevert() {
    if (alreadyPrinted) return;
    setReverting(true);
    setActionError(null);
    try {
      await claims.revertClaimToReview(claimId);
      router.push(`/forms/${claimId}/medical-review`);
    } catch (cause) {
      setActionError(cause instanceof ApiError ? cause.message : apiMessage(undefined));
    } finally {
      setReverting(false);
    }
  }

  function handlePrint() {
    const iframe = iframeRef.current;
    iframe?.contentWindow?.focus();
    iframe?.contentWindow?.print();
  }

  async function handleComplete() {
    setCompleting(true);
    setActionError(null);
    try {
      if (!alreadyPrinted) {
        await claims.markClaimPrinted(claimId);
        await claimState.refetch();
      }
      setStage("delivered");
    } catch (cause) {
      setActionError(cause instanceof ApiError ? cause.message : apiMessage(undefined));
    } finally {
      setCompleting(false);
    }
  }

  if (claimState.error?.kind === "not_found") {
    return (
      <LoopScaffold step={3} heading={t("step-heading")} headingHidden confirmLeave={false}>
        <ClaimNotFound />
      </LoopScaffold>
    );
  }

  const busy = reverting || completing || stage === "loading";
  const fileName = claim ? producedFileName(claim.submission_no) : "form.pdf";

  return (
    <LoopScaffold
      step={3}
      heading={
        stage === "delivered"
          ? t("success-title")
          : t("preview-title")
      }
      headingHidden={stage === "loading"}
      confirmLeave={false}
      wide
      footerStart={
        stage === "delivered" ? (
          <span className="inline-flex items-center gap-1.5 text-sm font-medium text-foreground">
            <CheckCircleIcon
              size={16}
              className="shrink-0 text-[var(--state-confirmed)]"
              aria-hidden
            />
            {t("success-title")}
          </span>
        ) : stage === "ready" ? (
          <span className="block truncate">
            {`${companyLabel} · ${formLabel} · ${patientLabel}`}
          </span>
        ) : undefined
      }
      footerEnd={
        stage === "delivered" ? (
          <Button size="lg" onClick={() => router.push("/")}>
            {t("done")}
          </Button>
        ) : stage === "ready" ? (
          <>
            <Button
              variant="outline"
              size="lg"
              disabled={busy || alreadyPrinted}
              loading={reverting}
              onClick={handleRevert}
            >
              {t("return-edit")}
            </Button>
            <Button variant="outline" size="lg" disabled={busy} onClick={handlePrint}>
              {t("print")}
            </Button>
            {pdfUrl ? (
              <Button asChild variant="outline" size="lg">
                <a href={pdfUrl} download={fileName}>
                  <DownloadIcon size={18} aria-hidden />
                  {t("download")}
                </a>
              </Button>
            ) : null}
            <Button
              size="lg"
              disabled={busy}
              loading={completing}
              onClick={handleComplete}
            >
              {t("complete")}
            </Button>
          </>
        ) : undefined
      }
    >
      {actionError ? (
        <Callout tone="danger" className="mb-4" icon={<AlertIcon size={20} />}>
          {actionError}
        </Callout>
      ) : null}

      {stage === "loading" || claimState.loading ? (
        <div className="flex min-h-96 flex-col items-center justify-center gap-4">
          <CatchUpArc label={t("producing")} sublabel={t("producing-hint")} />
        </div>
      ) : stage === "error" ? (
        <div className="mx-auto max-w-144 space-y-4">
          <Callout tone="warning" icon={<AlertIcon size={20} />}>
            <p className="font-medium text-foreground">{t("preview-failed")}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {actionError ?? t("not-ready")}
            </p>
          </Callout>
          <Button
            variant="outline"
            size="sm"
            onClick={() => router.push(`/forms/${claimId}/medical-review`)}
          >
            {t("return-edit")}
          </Button>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col gap-3">
          {stage === "delivered" ? (
            <Callout tone="success" icon={<CheckCircleIcon size={20} />}>
              <p className="font-medium text-foreground">
                {t("success-title")}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">{t("success-description")}</p>
            </Callout>
          ) : null}
          <div
            className={cn(
              "flex min-h-[70vh] min-h-0 flex-1 flex-col overflow-hidden rounded-md border border-border bg-card",
            )}
          >
            {pdfUrl ? (
              <iframe
                key={pdfUrl}
                ref={iframeRef}
                title={t("preview-title")}
                src={pdfUrl}
                className="min-h-[70vh] w-full flex-1 border-0"
              />
            ) : null}
          </div>
        </div>
      )}
    </LoopScaffold>
  );
}
