"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "@acuity/i18n/navigation";
import { useLocale, useTranslations } from "next-intl";
import { ApiError, claims, frontendOnly } from "@acuity/api-client";
import type { ClaimOut } from "@acuity/types";
import {
  Button,
  Callout,
  FileIcon,
  CheckIcon,
  SparkleIcon,
  Textarea,
  UploadIcon,
  cn,
} from "@acuity/ui";
import type { Locale } from "@/i18n/routing";
import { useApi } from "@/lib/use-api";
import { useApiErrorMessage } from "@/lib/api-error";
import { formatSize } from "@acuity/i18n/format";
import { relativeFromNow } from "@/lib/clock";
import { Eyebrow } from "@/components/ui/page";
import { LoopScaffold } from "@/components/loop/loop-scaffold";
import { CardListSkeleton } from "@/components/ui/loaders";
import { ClaimNotFound } from "@/components/ui/claim-not-found";
import { rememberIntakeSource } from "./intake-source";

const SIZE_LIMIT_MB = 25;

type Mode = "import" | "paste";
type InboxDocument = Awaited<
  ReturnType<typeof frontendOnly.documentInbox.listPrintCaptures>
>[number];

// Intake (step 2). Import <-> paste segmented toggle with paste always
// available. Import selects a capture (checkmark) — extraction only fires from
// the footer Extract, never on tap (matrix 4.3.3). A saved draft's record text
// re-seeds the paste editor (the resume pointer). The footer carries the
// 25 MB + paste-is-always-available reassurance in both modes.

export function Intake({ claimId }: { claimId: number }) {
  const t = useTranslations("intake");
  const locale = useLocale() as Locale;
  const router = useRouter();
  const apiMessage = useApiErrorMessage();

  const [mode, setMode] = useState<Mode>("paste");
  const [pasteText, setPasteText] = useState("");
  const [picked, setPicked] = useState<InboxDocument | null>(null);
  const [uploadName, setUploadName] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [overLimit, setOverLimit] = useState(false);
  const [pasteBytes, setPasteBytes] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const composingRef = useRef(false);
  const seededRef = useRef(false);

  const captures = useApi<InboxDocument[]>(() =>
    frontendOnly.documentInbox.listPrintCaptures(),
  );
  // The claim itself must resolve (cross-clinic access reads as not-found).
  const claimState = useApi<ClaimOut>(() => claims.getClaim(claimId), [claimId]);
  const notFound =
    captures.error?.kind === "not_found" ? captures.error : undefined;

  // Resume at the exact step: a DRAFT re-opened here re-seeds its saved record.
  useEffect(() => {
    let cancelled = false;
    frontendOnly.claimExtensions
      .getClaimIntakeText(claimId)
      .then((payload) => {
        if (!cancelled && !seededRef.current && payload.intake_text) {
          seededRef.current = true;
          setPasteText(payload.intake_text);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [claimId]);

  const hasContent =
    mode === "paste"
      ? pasteText.trim().length > 0
      : picked !== null || uploadName !== null;

  function handlePasteChange(value: string) {
    // A visible early over-limit error, never a silent truncation. The live
    // count keeps the surfaced limit honest while the doctor is still typing
    // or trimming (the pasted content is always preserved).
    const bytes = new TextEncoder().encode(value).length;
    setPasteBytes(bytes);
    setOverLimit(bytes > SIZE_LIMIT_MB * 1024 * 1024);
    setPasteText(value);
  }

  async function handleExtract() {
    if (overLimit || submitting) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      let recordText = pasteText;
      if (mode === "import") {
        if (picked) {
          // The document-inbox import op returns the captured record's text.
          const result = await frontendOnly.documentInbox.importInboxDocument(picked.id);
          recordText = result.intake_text;
          rememberIntakeSource(claimId, {
            kind: "import",
            filename: picked.filename,
          });
        } else if (uploadName) {
          // A browsed/dropped file: the mock boundary cannot parse a real PDF,
          // so the shared sample record stands in for its extracted text.
          const docs = captures.data ?? [];
          const first = docs[0];
          recordText = first
            ? (await frontendOnly.documentInbox.importInboxDocument(first.id)).intake_text
            : pasteText;
          rememberIntakeSource(claimId, { kind: "import", filename: uploadName });
        }
      } else {
        rememberIntakeSource(claimId, { kind: "paste" });
      }
      // Save the record as the draft intake, then go to extraction. Extraction
      // itself fires the AI submit (so the wait UI owns the loading state).
      await claims.saveDraft(claimId, { medical_record_text: recordText });
      router.push(`/forms/${claimId}/extraction`);
    } catch (cause) {
      setSubmitError(apiMessage(cause instanceof ApiError ? cause : undefined));
      setSubmitting(false);
    }
  }

  if (claimState.error?.kind === "not_found") {
    return (
      <LoopScaffold step={1} heading={t("step-heading")} headingHidden confirmLeave={false}>
        <ClaimNotFound />
      </LoopScaffold>
    );
  }

  return (
    <LoopScaffold
      step={1}
      heading={t("step-heading")}
      footerStart={t("footer-hint", { limit: SIZE_LIMIT_MB })}
      footerEnd={
        <Button
          size="lg"
          disabled={!hasContent || overLimit || submitting}
          loading={submitting}
          onClick={handleExtract}
        >
          {!submitting && <SparkleIcon size={18} aria-hidden />}
          {t("extract")}
        </Button>
      }
    >
      {/* Mode toggle (segmented control) */}
      <div
        role="radiogroup"
        aria-label={t("step-heading")}
        className="mb-6 inline-flex rounded-md border border-border bg-card p-0.5"
      >
        {(["import", "paste"] as Mode[]).map((m) => (
          <button
            key={m}
            type="button"
            role="radio"
            aria-checked={mode === m}
            onClick={() => setMode(m)}
            className={cn(
              "min-h-11 rounded-sm px-4 text-sm font-medium transition-colors duration-[120ms]",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
              mode === m
                ? "bg-primary text-primary-foreground"
                : "text-foreground hover:bg-accent",
            )}
          >
            {m === "import" ? t("mode-import") : t("mode-paste")}
          </button>
        ))}
      </div>

      {submitError && (
        <div className="mb-4">
          <Callout tone="danger">{submitError}</Callout>
        </div>
      )}

      {mode === "paste" ? (
        <div className="space-y-2">
          <Textarea
            value={pasteText}
            onChange={(e) => {
              if (composingRef.current) {
                setPasteText(e.target.value);
                return;
              }
              handlePasteChange(e.target.value);
            }}
            onCompositionStart={() => {
              composingRef.current = true;
            }}
            onCompositionEnd={(e) => {
              // Flush the in-progress IME composition before evaluating limits.
              composingRef.current = false;
              handlePasteChange((e.target as HTMLTextAreaElement).value);
            }}
            placeholder={t("paste-placeholder")}
            aria-label={t("paste-instruction")}
            rows={12}
            className="slim-scroll min-h-72 resize-y text-base leading-relaxed"
          />
          <p className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span>{t("paste-instruction-limit", { limit: SIZE_LIMIT_MB })}</span>
            {pasteBytes > 0 && (
              <span className={overLimit ? "font-medium text-destructive" : undefined}>
                {t("paste-size-count", {
                  used: formatSize(Math.max(1, Math.round(pasteBytes / 1024)), locale),
                  limit: SIZE_LIMIT_MB,
                })}
              </span>
            )}
          </p>
          {overLimit && (
            <Callout tone="danger">{t("over-limit", { limit: SIZE_LIMIT_MB })}</Callout>
          )}
        </div>
      ) : (
        <div className="space-y-6">
          <div>
            <Eyebrow className="mb-2.5">{t("import-heading")}</Eyebrow>
            {captures.loading ? (
              <CardListSkeleton count={2} label={t("loading-captures")} />
            ) : notFound || captures.error ? (
              <Callout tone="info">{t("import-empty")}</Callout>
            ) : (captures.data ?? []).length === 0 ? (
              <Callout tone="info">{t("import-empty")}</Callout>
            ) : (
              <div className="divide-y divide-border overflow-hidden rounded-md border border-border bg-card">
                {(captures.data ?? []).map((cap) => {
                  const selected = picked?.id === cap.id;
                  return (
                    <button
                      key={cap.id}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => {
                        setPicked(selected ? null : cap);
                        setUploadName(null);
                      }}
                      className={cn(
                        "flex w-full items-center gap-3 px-4 py-3 text-left transition-colors duration-[120ms]",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
                        selected ? "bg-muted" : "hover:bg-accent",
                      )}
                    >
                      <FileIcon size={20} className="shrink-0 text-[var(--color-glaucous)]" aria-hidden />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-foreground">
                          {cap.filename}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {t("captured-at", {
                            when: relativeFromNow(cap.captured_at, locale),
                            size: formatSize(cap.size_kb, locale),
                          })}
                        </p>
                      </div>
                      {selected && (
                        <CheckIcon size={16} className="shrink-0 text-primary" aria-hidden />
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Upload drop zone (drag-drop + browse; selecting arms Extract). */}
          <label
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              const file = e.dataTransfer.files?.[0];
              if (file) {
                setUploadName(file.name);
                setPicked(null);
              }
            }}
            className={cn(
              "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-md border border-dashed border-[var(--color-border-strong)] bg-card px-6 py-9 text-center transition-colors duration-[120ms] hover:bg-accent",
              dragOver && "bg-muted",
            )}
          >
            <UploadIcon size={24} className="text-[var(--color-glaucous)]" aria-hidden />
            {uploadName ? (
              <span className="inline-flex items-center gap-2 text-sm font-medium text-foreground">
                <CheckIcon size={16} className="text-primary" aria-hidden />
                {uploadName}
              </span>
            ) : (
              <span className="text-sm text-muted-foreground">
                {t.rich("upload-label", {
                  browse: (chunks) => (
                    <span className="font-medium text-primary">{chunks}</span>
                  ),
                })}
              </span>
            )}
            <span className="text-xs text-muted-foreground">
              {t("size-limit", { limit: SIZE_LIMIT_MB })}
            </span>
            <input
              type="file"
              className="sr-only"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) {
                  setUploadName(file.name);
                  setPicked(null);
                }
              }}
            />
          </label>

          <button
            type="button"
            onClick={() => setMode("paste")}
            className="text-sm font-medium text-[var(--link-text)] transition-colors duration-[120ms] hover:text-[var(--link-text-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {t("use-paste-instead")}
          </button>
        </div>
      )}
    </LoopScaffold>
  );
}
