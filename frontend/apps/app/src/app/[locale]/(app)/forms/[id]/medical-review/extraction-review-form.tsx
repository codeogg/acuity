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

export type ReviewFieldValue = {
  value: string | null;
  status: string;
  confidence: number;
  validation_error?: string | null;
};

const REVIEW_CONFIDENCE_THRESHOLD = 0.8;

function needsHighlight(field: ReviewFieldValue): boolean {
  return field.status !== "extracted" || field.confidence < REVIEW_CONFIDENCE_THRESHOLD;
}

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
  useEffect(() => {
    if (dirtyRef.current) return;
    setValues(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialKey]);

  function updateValue(code: string, value: string | null) {
    dirtyRef.current = true;
    setValues((prev) => ({ ...prev, [code]: value }));
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
              return f && needsHighlight(f);
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
                    const highlight = needsHighlight(field);
                    const label = fieldLabelFor(code, locale, fieldLabels);
                    const emptyRequired =
                      REQUIRED_FIELDS.has(code) &&
                      (!values[code] || values[code]!.trim() === "");
                    return (
                      <div
                        key={code}
                        className={cn(
                          "flex flex-col gap-1.5 rounded-md border p-3",
                          emptyRequired
                            ? "border-destructive/50 bg-destructive/5"
                            : highlight
                              ? "border-amber-400/60 bg-amber-50/40"
                              : "border-border",
                        )}
                      >
                        <div className="flex flex-wrap items-center gap-2 text-sm">
                          <span className="font-medium text-foreground">
                            {label}
                            {REQUIRED_FIELDS.has(code) ? (
                              <span className="ml-1 text-destructive">*</span>
                            ) : null}
                          </span>
                          <span className="font-mono text-[10px] text-muted-foreground">{code}</span>
                          <span className="rounded-sm bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                            {t(`status-${field.status}` as "status-extracted")}
                          </span>
                          {highlight ? (
                            <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] text-amber-800">
                              {t("needs-review")}
                              {field.confidence < REVIEW_CONFIDENCE_THRESHOLD
                                ? ` · ${t("confidence", {
                                    percent: Math.round(field.confidence * 100),
                                  })}`
                                : ""}
                            </span>
                          ) : null}
                        </div>
                        <input
                          value={values[code] ?? ""}
                          onChange={(e) => updateValue(code, e.target.value || null)}
                          className={cn(
                            "h-9 w-full rounded-md border bg-background px-3 text-sm text-foreground",
                            emptyRequired
                              ? "border-destructive/60"
                              : highlight
                                ? "border-amber-400"
                                : "border-border",
                          )}
                          aria-label={label}
                        />
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
