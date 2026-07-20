"use client";

import { useTranslations } from "next-intl";
import { AlertIcon, CheckIcon, LinkIcon, XIcon, cn } from "@acuity/ui";
import type { ReviewField } from "./review-model";
import { FieldStatusDot } from "@/components/ui/status-badge";

// One always-in-edit-mode review field row (components.md §3): the bilingual
// label + required marker, the always-editable input, the trailing inline
// control set (icon-only where-from link, clear on autofilled values, the
// icon-only confirm checkmark), the four-status dot + label, and the inline
// validation slot (field-adjacent, non-blocking). No view-then-edit step.

const STATUS_LABEL_KEY = {
  optional: "status-optional",
  "needs-input": "status-needs-input",
  drafted: "status-drafted",
  confirmed: "status-confirmed",
} as const;

export function ReviewFieldRow({
  field,
  locale,
  onEdit,
  onConfirm,
  onUnconfirm,
  onClear,
  onWhereFrom,
  onFocus,
  onRowFocus,
  rowTabIndex,
  unconfirmable,
  showRequiredError,
  inlineSource,
}: {
  field: ReviewField;
  locale: "en-HK" | "zh-Hant-HK";
  onEdit: (value: string) => void;
  onConfirm: () => void;
  /** Reopen a confirmed value (the pre-sign-off un-confirm window). */
  onUnconfirm?: () => void;
  onClear: () => void;
  onWhereFrom: () => void;
  onFocus?: () => void;
  /** Any focus landing inside this row (keeps the roving tabindex in sync). */
  onRowFocus?: () => void;
  /** Roving tabindex for the keyboard traversal layer (0 = the active row). */
  rowTabIndex?: number;
  /** Whether a confirmed value may be reopened (false once signed off). */
  unconfirmable?: boolean;
  /** Surface required-empty messages (after a blocked sign-off attempt). */
  showRequiredError?: boolean;
  /** Reveal the source span inline beneath the field (narrow where-from). */
  inlineSource?: boolean;
}) {
  const t = useTranslations("review");
  const label = locale === "zh-Hant-HK" ? field.label_zh : field.label_en;
  const statusLabel = t(STATUS_LABEL_KEY[field.status]);

  const problemMessage = field.problem
    ? locale === "zh-Hant-HK"
      ? field.problem.message_zh
      : field.problem.message_en
    : null;
  const requiredMessage =
    showRequiredError && field.status === "needs-input"
      ? t("field-error-required")
      : null;
  const inlineError = problemMessage ?? requiredMessage;

  const confirmDisabled = field.confirmed
    ? !unconfirmable
    : (field.value === "" && field.required) ||
      (field.problem !== null && field.problem.blocking);

  const inputClass = cn(
    "h-11 w-full min-w-0 flex-1 rounded-md border bg-background px-3.5 text-base text-foreground transition-colors duration-[120ms]",
    "focus-visible:border-[var(--color-border-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
    field.status === "needs-input" || problemMessage
      ? "border-[var(--state-needs-input)]"
      : "border-border",
  );

  return (
    <div
      id={`row-${field.field_code}`}
      tabIndex={rowTabIndex}
      onFocus={onRowFocus}
      className="scroll-mt-24 rounded-md border border-border bg-card p-3 transition-colors duration-[120ms] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <label
          htmlFor={`field-${field.field_code}`}
          className="flex items-center gap-1 text-sm font-medium text-foreground"
        >
          {label}
          {field.required && (
            <span className="text-[var(--state-needs-input)]" aria-hidden>
              *
            </span>
          )}
          {field.required && <span className="sr-only">{t("required")}</span>}
        </label>
        <FieldStatusDot status={field.status} label={statusLabel} />
      </div>

      <div className="flex items-center gap-2">
        {field.data_type === "enum" && field.enum_options ? (
          <select
            id={`field-${field.field_code}`}
            value={field.value}
            onChange={(e) => onEdit(e.target.value)}
            onFocus={onFocus}
            className={inputClass}
          >
            <option value="" />
            {field.enum_options.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        ) : (
          <input
            id={`field-${field.field_code}`}
            type={field.data_type === "date" ? "date" : "text"}
            inputMode={field.data_type === "number" ? "decimal" : undefined}
            value={field.value}
            onChange={(e) => onEdit(e.target.value)}
            onFocus={onFocus}
            aria-invalid={inlineError ? true : undefined}
            aria-describedby={inlineError ? `error-${field.field_code}` : undefined}
            className={inputClass}
          />
        )}

        {/* Where-from — an icon-only inline control in the input row
            (components.md §3 anatomy). */}
        {field.source_span && (
          <button
            type="button"
            onClick={onWhereFrom}
            aria-label={t("where-from")}
            title={t("where-from-title")}
            className="flex size-11 shrink-0 items-center justify-center rounded-md text-[var(--color-glaucous)] transition-colors duration-[120ms] hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
          >
            <LinkIcon size={18} />
          </button>
        )}

        {/* Clear (autofilled values only) */}
        {field.autofilled && field.value !== "" && !field.confirmed && (
          <button
            type="button"
            onClick={onClear}
            aria-label={t("clear-field")}
            title={t("clear-field")}
            className="flex size-11 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors duration-[120ms] hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
          >
            <XIcon size={16} />
          </button>
        )}

        {/* Trailing checkmark — the single quiet confirm gesture */}
        <button
          type="button"
          onClick={field.confirmed ? onUnconfirm : onConfirm}
          disabled={confirmDisabled}
          aria-pressed={field.confirmed}
          aria-label={field.confirmed ? t("unconfirm-field") : t("confirm-field")}
          title={field.confirmed ? t("unconfirm-field") : t("confirm-field")}
          className={cn(
            "flex size-11 shrink-0 items-center justify-center rounded-md transition-colors duration-[120ms]",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
            field.confirmed
              ? "bg-[var(--state-confirmed)] text-[var(--color-on-navy)]"
              : "border border-border text-primary hover:bg-accent",
            confirmDisabled && !field.confirmed && "cursor-not-allowed opacity-40",
          )}
        >
          <CheckIcon size={20} />
        </button>
      </div>

      {/* Inline validation (field-adjacent, non-blocking) */}
      {inlineError && (
        <p
          id={`error-${field.field_code}`}
          className="mt-2 flex items-center gap-1.5 text-xs text-destructive"
        >
          <AlertIcon size={14} aria-hidden />
          {inlineError}
        </p>
      )}

      {/* Narrow where-from: the source span revealed beneath the field. */}
      {inlineSource && field.source_span && (
        <p className="mt-2 rounded-sm px-2 py-1.5 font-mono text-xs text-foreground"
          style={{
            background: "color-mix(in srgb, var(--tone-warning) 40%, transparent)",
            boxShadow: "inset 2px 0 0 var(--tone-warning-glyph)",
          }}
        >
          {field.source_span}
        </p>
      )}
    </div>
  );
}
