"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  cn,
} from "@acuity/ui";
import {
  FIELD_GROUPS,
  TEMPLATE_SPECIFIC_GROUP,
  getFieldGroupName,
  getStandardFieldLabel,
  REQUIRED_FIELDS,
  STANDARD_FIELD_LABELS,
  type FieldGroup,
} from "./field-catalog";
import { formatPatientDisplay } from "@/lib/patient-name";
import {
  FieldStatusBadge,
  aiOriginalFromRaw,
  fieldCandidates,
  fieldSourceParts,
  resolveFieldBadge,
  type AiRawResultMap,
  type ReviewFieldMeta,
} from "./field-status-badge";

export type ReviewFieldValue = ReviewFieldMeta;

function fieldLabelFor(
  code: string,
  locale: string,
  fieldLabels?: Record<string, string> | null,
): string {
  if (code in STANDARD_FIELD_LABELS) return getStandardFieldLabel(code, locale);
  return fieldLabels?.[code] ?? code;
}

function PvLine({ k, val, last }: { k: string; val: string; last?: boolean }) {
  return (
    <div
      className={cn(
        "flex items-baseline justify-between gap-4 py-1.5",
        !last && "border-b border-border",
      )}
    >
      <span className="text-sm text-muted-foreground">{k}</span>
      <span className="text-right text-sm font-medium text-foreground">{val}</span>
    </div>
  );
}

/** Editable standard-field form after AI extraction (doctor web ExtractionReviewForm). */
export function ExtractionReviewForm({
  fields,
  fieldOrder,
  saving,
  confirming,
  onSave,
  onConfirm,
  companyLabel,
  formLabel,
  patientLabel,
  templateSpecificFieldCodes = [],
  fieldLabels,
  aiRawResult,
  standardFields,
  snapshotKey,
}: {
  fields: Record<string, ReviewFieldValue>;
  fieldOrder: string[];
  saving: boolean;
  confirming: boolean;
  onSave: (values: Record<string, string | null>) => void;
  onConfirm: (values: Record<string, string | null>) => void;
  companyLabel: string;
  formLabel: string;
  /** Fallback when form values don't yet include patient names. */
  patientLabel?: string;
  templateSpecificFieldCodes?: string[];
  fieldLabels?: Record<string, string> | null;
  /** Claim-level AI originals for “已修改” detection. */
  aiRawResult?: AiRawResultMap;
  /** Review standard_fields before doctor edits (fallback when ai_raw missing). */
  standardFields?: Record<string, ReviewFieldValue> | null;
  /** Reset AI original snapshot when review/claim identity changes. */
  snapshotKey?: string;
}) {
  const t = useTranslations("medical-review");
  const tReview = useTranslations("review");
  const locale = useLocale();
  const codes = useMemo(
    () => (fieldOrder.length > 0 ? fieldOrder : Object.keys(fields)),
    [fieldOrder, fields],
  );
  const initial = useMemo(
    () =>
      Object.fromEntries(codes.map((code) => [code, fields[code]?.value ?? null])) as Record<
        string,
        string | null
      >,
    [codes, fields],
  );
  const [values, setValues] = useState(initial);
  const [signOffOpen, setSignOffOpen] = useState(false);
  const initialKey = useMemo(() => JSON.stringify(initial), [initial]);
  const dirtyRef = useRef(false);
  const [aiOriginals, setAiOriginals] = useState<Record<string, string | null>>({});
  const aiSnapshotDoneRef = useRef(false);

  useEffect(() => {
    aiSnapshotDoneRef.current = false;
  }, [snapshotKey]);

  useEffect(() => {
    if (aiSnapshotDoneRef.current || codes.length === 0) return;
    const next: Record<string, string | null> = {};
    for (const code of codes) {
      const fromRaw = aiOriginalFromRaw(aiRawResult, code);
      if (fromRaw !== undefined) {
        next[code] = fromRaw;
      } else if (standardFields?.[code]) {
        next[code] = standardFields[code]!.value ?? null;
      } else {
        next[code] = fields[code]?.value ?? null;
      }
    }
    setAiOriginals(next);
    aiSnapshotDoneRef.current = true;
  }, [codes, aiRawResult, standardFields, fields, snapshotKey]);

  useEffect(() => {
    if (dirtyRef.current) return;
    setValues(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialKey]);

  function updateValue(code: string, value: string | null) {
    dirtyRef.current = true;
    setValues((prev) => ({ ...prev, [code]: value }));
  }

  const badgeLabels = useMemo(
    () => ({
      missing: t("badge-missing"),
      ambiguous: t("badge-ambiguous"),
      conflict: t("badge-conflict"),
      modified: t("badge-modified"),
      extractedLow: (percent: number) => t("badge-extracted-low", { percent }),
      extractedOk: (percent: number) => t("badge-extracted-ok", { percent }),
    }),
    [t],
  );

  function sourceTooltipFor(field: ReviewFieldValue): string | null {
    const { page, rawLabel } = fieldSourceParts(field);
    if (page == null && !rawLabel) return null;
    if (page != null && rawLabel) {
      return t("source-tooltip", { page, rawLabel });
    }
    if (page != null) return t("source-tooltip-page", { page });
    return t("source-tooltip-label", { rawLabel: rawLabel! });
  }

  const missingRequiredLabels = useMemo(() => {
    return codes
      .filter(
        (code) => REQUIRED_FIELDS.has(code) && (!values[code] || values[code]!.trim() === ""),
      )
      .map((code) => fieldLabelFor(code, locale, fieldLabels));
  }, [codes, values, fieldLabels, locale]);

  const patientDisplay =
    formatPatientDisplay({
      patient_name_cn: values.patient_name_cn,
      patient_name_en: values.patient_name_en,
      patient_name: patientLabel,
    }) ||
    patientLabel ||
    "—";

  const sections = useMemo(() => {
    const available = new Set(codes);
    const templateCodeSet = new Set(
      templateSpecificFieldCodes.filter((c) => available.has(c)),
    );
    const result: { group: FieldGroup; codes: string[] }[] = [];
    for (const group of FIELD_GROUPS) {
      const groupCodes = group.fieldCodes.filter((c) => available.has(c));
      if (groupCodes.length > 0) result.push({ group, codes: groupCodes });
    }
    if (templateCodeSet.size > 0) {
      const templateCodes = templateSpecificFieldCodes.filter((c) => templateCodeSet.has(c));
      result.push({
        group: { ...TEMPLATE_SPECIFIC_GROUP, fieldCodes: templateCodes },
        codes: templateCodes,
      });
    }
    const grouped = new Set(result.flatMap((s) => s.codes));
    const remaining = codes.filter((c) => !grouped.has(c));
    if (remaining.length > 0) {
      result.push({
        group: {
          domainCode: "_other",
          domainName: t("other-fields"),
          domainNameEn: t("other-fields"),
          sortOrder: 99,
          fieldCodes: remaining,
        },
        codes: remaining,
      });
    }
    return result;
  }, [codes, templateSpecificFieldCodes, t]);

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="slim-scroll min-h-0 flex-1 overflow-y-auto pr-1">
        <div className="space-y-6 pb-4">
          {sections.map(({ group, codes: groupCodes }) => {
            const needReviewCount = groupCodes.filter((code) => {
              const f = fields[code];
              if (!f) return false;
              return resolveFieldBadge({
                status: f.status,
                confidence: f.confidence,
                currentValue: values[code],
                aiOriginalValue: aiOriginals[code] ?? null,
              }).needsAttention;
            }).length;
            return (
              <section key={group.domainCode} className="flex flex-col gap-3">
                <div className="flex items-baseline justify-between rounded-md bg-muted/50 px-3 py-2">
                  <h3 className="text-sm font-semibold text-foreground">
                    {getFieldGroupName(group, locale)}
                    <span className="ml-1.5 font-normal text-muted-foreground">
                      {t("field-count", { count: groupCodes.length })}
                    </span>
                  </h3>
                  {needReviewCount > 0 ? (
                    <span className="shrink-0 text-xs text-amber-700">
                      {t("needs-review-count", { count: needReviewCount })}
                    </span>
                  ) : null}
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {groupCodes.map((code) => {
                    const field = fields[code];
                    if (!field) return null;
                    const badge = resolveFieldBadge({
                      status: field.status,
                      confidence: field.confidence,
                      currentValue: values[code],
                      aiOriginalValue: aiOriginals[code] ?? null,
                    });
                    const label = fieldLabelFor(code, locale, fieldLabels);
                    const emptyRequired =
                      REQUIRED_FIELDS.has(code) &&
                      (!values[code] || values[code]!.trim() === "");
                    const candidates = fieldCandidates(field);
                    const showCandidates =
                      (badge.kind === "ambiguous" || badge.kind === "conflict") &&
                      candidates.length > 0;
                    const cardTone = emptyRequired
                      ? "border-destructive/50 bg-destructive/5"
                      : badge.kind === "missing" || badge.kind === "conflict"
                        ? "border-destructive/40 bg-destructive/5"
                        : badge.needsAttention
                          ? "border-amber-400/60 bg-amber-50/40"
                          : "border-border";
                    const inputTone = emptyRequired
                      ? "border-destructive/60"
                      : badge.needsAttention
                        ? "border-amber-400"
                        : "border-border";
                    return (
                      <div
                        key={code}
                        className={cn("flex flex-col gap-1.5 rounded-md border p-3", cardTone)}
                      >
                        <div className="flex flex-wrap items-center gap-2 text-sm">
                          <span className="font-medium text-foreground">
                            {label}
                            {REQUIRED_FIELDS.has(code) ? (
                              <span className="ml-1 text-destructive">*</span>
                            ) : null}
                          </span>
                          <span className="font-mono text-[10px] text-muted-foreground">
                            {code}
                          </span>
                          <FieldStatusBadge
                            kind={badge.kind}
                            tone={badge.tone}
                            subtle={badge.subtle}
                            confidencePercent={badge.confidencePercent}
                            tooltip={sourceTooltipFor(field)}
                            labels={badgeLabels}
                          />
                        </div>
                        <input
                          value={values[code] ?? ""}
                          onChange={(e) => updateValue(code, e.target.value || null)}
                          className={cn(
                            "h-9 w-full rounded-md border bg-background px-3 text-sm text-foreground",
                            inputTone,
                          )}
                          aria-label={label}
                        />
                        {showCandidates ? (
                          <div className="flex flex-col gap-1.5">
                            <p className="text-[11px] text-muted-foreground">
                              {badge.kind === "ambiguous"
                                ? t("candidates-hint-ambiguous")
                                : t("candidates-hint-conflict")}
                            </p>
                            <div className="flex flex-wrap gap-1.5">
                              {candidates.map((candidate) => {
                                const selected =
                                  (values[code] ?? "").trim() === candidate.trim();
                                return (
                                  <button
                                    key={candidate}
                                    type="button"
                                    onClick={() => updateValue(code, candidate)}
                                    className={cn(
                                      "rounded-md border px-2 py-1 text-xs transition-colors",
                                      selected
                                        ? "border-foreground bg-foreground text-background"
                                        : "border-border bg-background text-foreground hover:bg-muted",
                                    )}
                                  >
                                    {candidate}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        ) : null}
                        {field.validation_error ? (
                          <p className="text-xs text-destructive">{field.validation_error}</p>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      </div>

      <div className="flex shrink-0 flex-wrap justify-end gap-2 border-t border-border pt-3">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={saving || confirming}
          loading={saving}
          onClick={() => onSave(values)}
        >
          {t("save-draft")}
        </Button>
        <Button
          type="button"
          size="sm"
          disabled={saving || confirming}
          onClick={() => setSignOffOpen(true)}
        >
          {t("finish-review")}
        </Button>
      </div>

      <Dialog
        open={signOffOpen}
        onOpenChange={(open) => {
          if (!confirming) setSignOffOpen(open);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <p className="t-eyebrow text-muted-foreground">{tReview("sign-off-eyebrow")}</p>
            <DialogTitle>
              {tReview("sign-off-preview-title", { company: companyLabel || "—" })}
            </DialogTitle>
            <DialogDescription className="sr-only">
              {tReview("sign-off-preview-body")}
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-md border border-border bg-muted p-4">
            <PvLine k={tReview("sign-off-row-form")} val={formLabel || "—"} />
            <PvLine k={tReview("sign-off-row-patient")} val={patientDisplay} />
            <PvLine k={tReview("sign-off-row-insurer")} val={companyLabel || "—"} />
            <PvLine
              k={tReview("sign-off-row-delivery")}
              val={tReview("sign-off-row-delivery-value", {
                company: companyLabel || "—",
              })}
              last
            />
          </div>
          {missingRequiredLabels.length > 0 ? (
            <div className="rounded-md border border-amber-300/70 bg-amber-50/60 p-3">
              <p className="text-sm font-medium text-foreground">
                {t("required-missing-title")}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">{t("required-missing-hint")}</p>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-foreground">
                {missingRequiredLabels.map((label) => (
                  <li key={label}>{label}</li>
                ))}
              </ul>
            </div>
          ) : null}
          <p className="text-sm text-muted-foreground">{tReview("sign-off-preview-body")}</p>
          <DialogFooter>
            {!confirming ? (
              <Button variant="ghost" onClick={() => setSignOffOpen(false)}>
                {tReview("sign-off-cancel")}
              </Button>
            ) : null}
            <Button
              variant={confirming ? "success" : "default"}
              loading={confirming}
              disabled={confirming}
              onClick={() => onConfirm(values)}
            >
              {confirming
                ? tReview("sign-off-producing")
                : tReview("sign-off-confirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
