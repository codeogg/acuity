"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "@acuity/i18n/navigation";
import { useLocale, useTranslations } from "next-intl";
import { ApiError, api, claims } from "@acuity/api-client";
import type { ClaimOut } from "@acuity/types";
import {
  AlertIcon,
  Button,
  Callout,
  CheckCircleIcon,
  DownloadIcon,
  SendIcon,
} from "@acuity/ui";
import type { Locale } from "@/i18n/routing";
import { useApi } from "@/lib/use-api";
import { useApiErrorMessage } from "@/lib/api-error";
import { useCatalog } from "@/lib/catalog";
import { useSession } from "@/lib/session";
import { LoopScaffold } from "@/components/loop/loop-scaffold";
import { CatchUpArc } from "@/components/ui/loaders";
import { ClaimNotFound } from "@/components/ui/claim-not-found";
import { InsurerFormFacsimile } from "@/components/form-preview/insurer-form";
import {
  getDemoControls,
  subscribeDemoControls,
} from "@/components/system/demo-controls";

type Stage = "producing" | "ready" | "delivered" | "blocked";

// Human-meaningful produced-file name: insurer, form type, the surrogate
// submission reference, and the HK-local date — never patient identifiers
// (no PHI in a filename). ASCII-slugged from the English catalog names so the
// name survives every filesystem.
function slugify(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}

function producedFileName(
  companyEn: string,
  formEn: string,
  submissionNo: string,
  createdAt: string,
): string {
  const datePart = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Hong_Kong",
  }).format(new Date(createdAt));
  return `${slugify(companyEn)}-${slugify(formEn)}-${slugify(submissionNo)}-${datePart}.pdf`;
}

// Produce and deliver (step 5). Renders the filled insurer form as a faithful
// facsimile with the signature on file applied, offers Send-to-insurer
// (primary, success-loading) beside Download (outline secondary), shows a calm
// success end-peak, and the specific recoverable held-delivery message when
// self-verification blocks (routes back to review).

export function Produce({ claimId }: { claimId: number }) {
  const t = useTranslations("produce");
  const locale = useLocale() as Locale;
  const router = useRouter();
  const apiMessage = useApiErrorMessage();
  const catalog = useCatalog();
  const { me, settings } = useSession();
  const demo = useSyncExternalStore(subscribeDemoControls, getDemoControls, getDemoControls);

  const claimState = useApi<ClaimOut>(() => claims.getClaim(claimId), [claimId]);

  const [stage, setStage] = useState<Stage>("producing");
  const [produceStep, setProduceStep] = useState<1 | 2>(1);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [sendFailed, setSendFailed] = useState<ApiError | null>(null);
  const startedRef = useRef(false);

  const companyLabel = claimState.data
    ? catalog.companyName(claimState.data.company_id, locale)
    : "";
  const formLabel = claimState.data
    ? catalog.formName(claimState.data.template_id, locale)
    : "";
  const patientLabel = claimState.data?.patient_name ?? "—";
  const fileName = claimState.data
    ? producedFileName(
        catalog.companyName(claimState.data.company_id, "en-HK"),
        catalog.formName(claimState.data.template_id, "en-HK"),
        claimState.data.submission_no,
        claimState.data.created_at,
      )
    : null;

  const produce = useCallback(async () => {
    setStage("producing");
    setProduceStep(1);
    try {
      // The self-verification demo hold rides the mock's one-shot flag.
      const path = demo.selfVerificationBlock
        ? `/doctor/claims/${claimId}/generate-pdf?scenario=self-verification-blocked`
        : `/doctor/claims/${claimId}/generate-pdf`;
      setProduceStep(2);
      const result = await api.post<{ pdf_url: string }>(path);
      setPdfUrl(result.pdf_url);
      setStage("ready");
    } catch {
      // The recoverable held-delivery state (self-verification gate).
      setStage("blocked");
    }
  }, [claimId, demo.selfVerificationBlock]);

  useEffect(() => {
    if (startedRef.current) return;
    if (!claimState.data) return;
    startedRef.current = true;
    // Re-visiting an already-produced form skips straight to its stage.
    if (claimState.data.generated_pdf_url && !demo.selfVerificationBlock) {
      setPdfUrl(claimState.data.generated_pdf_url);
      setStage(claimState.data.status === "PRINTED" ? "delivered" : "ready");
      return;
    }
    void produce();
  }, [claimState.data, produce, demo.selfVerificationBlock]);

  async function handleSend() {
    setSendFailed(null);
    setSending(true);
    try {
      await claims.markClaimPrinted(claimId);
      setStage("delivered");
    } catch (cause) {
      setSendFailed(cause instanceof ApiError ? cause : null);
    } finally {
      setSending(false);
    }
  }

  async function handleDownload() {
    // Download delivers the copy too (the reference treats both as delivery;
    // the copy lands in history either way).
    setSendFailed(null);
    try {
      await claims.markClaimPrinted(claimId);
      setStage("delivered");
    } catch (cause) {
      setSendFailed(cause instanceof ApiError ? cause : null);
    }
  }

  if (claimState.error?.kind === "not_found") {
    return (
      <LoopScaffold step={4} heading={t("step-heading")} headingHidden confirmLeave={false}>
        <ClaimNotFound />
      </LoopScaffold>
    );
  }

  const metadataLine = `${companyLabel} · ${formLabel} · ${patientLabel} · ${t(
    "delivery-target",
    { company: companyLabel },
  )}`;

  return (
    <LoopScaffold
      step={4}
      heading={
        stage === "delivered"
          ? t("success-title", { company: companyLabel })
          : t("ready-title")
      }
      headingHidden={stage === "producing"}
      confirmLeave={false}
      footerStart={
        stage === "delivered" ? (
          <span className="inline-flex items-center gap-1.5 text-sm font-medium text-foreground">
            <CheckCircleIcon
              size={16}
              className="shrink-0 text-[var(--state-confirmed)]"
              aria-hidden
            />
            {t("success-title", { company: companyLabel })}
          </span>
        ) : stage === "ready" ? (
          /* truncate needs a block box — an inline span never clips, it just
             paints past the footer edge on small viewports */
          <span className="block truncate">{`${companyLabel} · ${formLabel} · ${patientLabel}`}</span>
        ) : undefined
      }
      footerEnd={
        stage === "delivered" ? (
          <Button size="lg" onClick={() => router.push("/")}>
            {t("done")}
          </Button>
        ) : stage === "ready" ? (
          <>
            <Button variant="outline" size="lg" onClick={handleDownload}>
              <DownloadIcon size={18} aria-hidden />
              {t("download")}
            </Button>
            <Button
              size="lg"
              variant={sending ? "success" : "default"}
              loading={sending}
              disabled={sending}
              onClick={handleSend}
            >
              {!sending && <SendIcon size={18} aria-hidden />}
              {sending ? t("sending") : t("send-to", { company: companyLabel })}
            </Button>
          </>
        ) : undefined
      }
    >
      {stage === "producing" ? (
        <div className="flex min-h-96 flex-col items-center justify-center gap-4">
          <CatchUpArc
            label={t("producing")}
            sublabel={t("producing-step", { step: produceStep, total: 2 })}
          />
        </div>
      ) : stage === "blocked" ? (
        <div className="mx-auto max-w-144 space-y-6">
          <Callout tone="warning" icon={<AlertIcon size={20} />}>
            <div className="flex flex-col gap-2">
              <p className="font-medium text-foreground">
                {t("self-verification-blocked-title")}
              </p>
              <p className="text-sm text-muted-foreground">
                {t("self-verification-blocked-body")}
              </p>
              <div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => router.push(`/forms/${claimId}/review`)}
                >
                  {t("back-to-review")}
                </Button>
              </div>
            </div>
          </Callout>
        </div>
      ) : (
        <div className="space-y-6">
          {stage === "delivered" && (
            <Callout tone="success" icon={<CheckCircleIcon size={20} />}>
              <div>
                <p className="font-medium text-foreground">
                  {t("success-title", { company: companyLabel })}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {t("success-description")}
                </p>
              </div>
            </Callout>
          )}

          {sendFailed && (
            <Callout tone="warning">
              {t("send-failed")} {apiMessage(sendFailed)}
            </Callout>
          )}

          {/* Metadata line (insurer · form · patient · delivery target) */}
          <p className="text-sm text-foreground">{metadataLine}</p>

          {/* The exact produced filename — stated up front so "where did it
              save?" never becomes a support call; history re-downloads the
              same file any time. */}
          {fileName && (
            <p className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-xs text-muted-foreground">
              <span>{t("file-name-label")}</span>
              <span className="font-mono text-foreground">{fileName}</span>
            </p>
          )}

          {/* The filled insurer form — the same facsimile as review, signed. */}
          <figure className="rounded-md border border-border bg-muted p-4 md:p-6">
            <div className="mx-auto max-w-144">
              {claimState.data && (
                <InsurerFormFacsimile
                  claim={claimState.data}
                  values={
                    (claimState.data.final_field_values ?? {}) as Record<string, string>
                  }
                  signed
                  signatureName={me?.display_name ?? undefined}
                  signatureImageUrl={settings?.signature_image_url}
                />
              )}
            </div>
            <figcaption className="mt-4 text-center text-xs text-muted-foreground">
              {t("pdf-caption")}
            </figcaption>
          </figure>

          {stage === "delivered" && pdfUrl && (
            <div>
              <Button asChild variant="outline">
                <a href={pdfUrl} download={fileName ?? true}>
                  <DownloadIcon size={18} aria-hidden />
                  {t("download")}
                </a>
              </Button>
            </div>
          )}
        </div>
      )}
    </LoopScaffold>
  );
}
