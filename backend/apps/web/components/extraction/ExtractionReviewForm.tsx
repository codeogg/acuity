"use client";

import { useEffect, useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ReviewFieldValue } from "@/lib/api/types";
import {
  FIELD_GROUPS,
  TEMPLATE_SPECIFIC_GROUP,
  getFieldGroupName,
  type FieldGroup,
} from "@/lib/extraction/field-groups";
import {
  REQUIRED_FIELDS,
  STANDARD_FIELD_LABELS,
  getStandardFieldLabel,
} from "@/lib/extraction/standard-field-labels";
import { useI18n } from "@/lib/i18n/I18nProvider";

const REVIEW_CONFIDENCE_THRESHOLD = 0.8;

function needsHighlight(field: ReviewFieldValue): boolean {
  return (
    field.status !== "extracted" ||
    field.confidence < REVIEW_CONFIDENCE_THRESHOLD
  );
}

function FieldCard({
  code,
  field,
  value,
  label,
  isFocused,
  isConfirmed,
  onFocus,
  onChange,
}: {
  code: string;
  field: ReviewFieldValue;
  value: string | null;
  label?: string | undefined;
  isFocused: boolean;
  isConfirmed: boolean;
  onFocus: () => void;
  onChange: (v: string | null) => void;
}) {
  const { locale, t } = useI18n();
  const highlight = needsHighlight(field);
  const isRequired = REQUIRED_FIELDS.has(code);
  const displayLabel =
    code in STANDARD_FIELD_LABELS
      ? getStandardFieldLabel(code, locale)
      : label ?? code;

  return (
    <div
      className={`flex flex-col gap-1.5 rounded-md border p-3 ${
        isFocused
          ? "border-[var(--color-primary)] bg-blue-50/50"
          : "border-transparent"
      }`}
      onClick={onFocus}
    >
      <Label className="flex flex-wrap items-center gap-2">
        <span className="text-sm">
          {displayLabel}
          {isRequired && (
            <span className="ml-1 text-[var(--color-destructive)]">*</span>
          )}
        </span>
        <span className="font-mono text-xs text-[var(--color-muted-foreground)]">
          {code}
        </span>
        <Badge variant="secondary">{t(`doctor.review.status.${field.status}`)}</Badge>
        {highlight && (
          <span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-700">
            {t("doctor.review.needsReview")}
            {field.confidence < REVIEW_CONFIDENCE_THRESHOLD
              ? ` · ${t("doctor.review.confidence", {
                  percent: (field.confidence * 100).toFixed(0),
                })}`
              : ""}
          </span>
        )}
      </Label>
      <Input
        className={highlight ? "border-amber-400 bg-amber-50" : ""}
        value={value ?? ""}
        disabled={isConfirmed}
        onChange={(e) => onChange(e.target.value || null)}
      />
      {field.validation_error && (
        <p className="text-xs text-[var(--color-destructive)]">
          {field.validation_error}
        </p>
      )}
    </div>
  );
}

export function ExtractionReviewForm({
  fields,
  fieldOrder,
  saving,
  confirming,
  isConfirmed,
  onSave,
  onConfirm,
  onFocusField,
  focusedField,
  showConfirm = true,
  confirmLabel,
  layout = "default",
  showGroups = true,
  templateSpecificFieldCodes = [],
  fieldLabels,
}: {
  fields: Record<string, ReviewFieldValue>;
  fieldOrder: string[];
  saving: boolean;
  confirming: boolean;
  isConfirmed: boolean;
  onSave: (values: Record<string, string | null>) => void;
  onConfirm: (values: Record<string, string | null>) => void;
  onFocusField?: (fieldCode: string | null) => void;
  focusedField?: string | null;
  showConfirm?: boolean;
  confirmLabel?: string;
  layout?: "default" | "panel";
  showGroups?: boolean;
  templateSpecificFieldCodes?: string[];
  fieldLabels?: Record<string, string> | null;
}) {
  const { locale, t } = useI18n();
  const resolvedConfirmLabel = confirmLabel ?? t("doctor.review.confirmComplete");
  const codes = useMemo(
    () => (fieldOrder.length > 0 ? fieldOrder : Object.keys(fields)),
    [fieldOrder, fields],
  );
  const initial = useMemo(
    () =>
      Object.fromEntries(
        codes.map((code) => [code, fields[code]?.value ?? null]),
      ) as Record<string, string | null>,
    [codes, fields],
  );
  const [values, setValues] = useState<Record<string, string | null>>(initial);

  // 仅在初始值内容真正变化时重置，避免父组件重渲染（对象换了引用）冲掉用户输入
  const initialKey = useMemo(() => JSON.stringify(initial), [initial]);
  useEffect(() => {
    setValues(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialKey]);

  // 计算需要校验的必填字段，只保留第一个错误信息
  const validationError = useMemo(() => {
    const firstErrorField = codes.find(
      (code) =>
        REQUIRED_FIELDS.has(code) &&
        (!values[code] || values[code].trim() === ""),
    );
    if (firstErrorField) {
      return t("doctor.review.required", {
        field: firstErrorField in STANDARD_FIELD_LABELS
          ? getStandardFieldLabel(firstErrorField, locale)
          : fieldLabels?.[firstErrorField] ?? firstErrorField,
      });
    }
    return null;
  }, [values, codes, fieldLabels, locale, t]);

  // 按分组排列字段
  const groupedSections = useMemo(() => {
    if (!showGroups) return null;

    const available = new Set(codes);
    const templateCodeSet = new Set(
      templateSpecificFieldCodes.filter((c) => available.has(c)),
    );
    const result: { group: FieldGroup; codes: string[] }[] = [];

    for (const group of FIELD_GROUPS) {
      const groupCodes = group.fieldCodes.filter((c) => available.has(c));
      if (groupCodes.length > 0) {
        result.push({ group, codes: groupCodes });
      }
    }

    if (templateCodeSet.size > 0) {
      const templateCodes = templateSpecificFieldCodes.filter((c) =>
        templateCodeSet.has(c),
      );
      result.push({
        group: {
          ...TEMPLATE_SPECIFIC_GROUP,
          fieldCodes: templateCodes,
        },
        codes: templateCodes,
      });
    }

    // 收集不在任何标准分组、也不在模板专属中的剩余字段
    const grouped = new Set([
      ...result.flatMap((s) => s.codes),
      ...templateCodeSet,
    ]);
    const remaining = codes.filter((c) => !grouped.has(c));
    if (remaining.length > 0) {
      result.push({
        group: {
          domainCode: "_other",
          domainName: t("doctor.review.otherFields"),
          sortOrder: 99,
          fieldCodes: remaining,
        },
        codes: remaining,
      });
    }

    return result;
  }, [codes, showGroups, templateSpecificFieldCodes, t]);

  // 单个分组渲染
  function renderGroup(
    group: FieldGroup,
    groupCodes: string[],
    isLast: boolean,
  ) {
    const needReviewCount = groupCodes.filter((code) => {
      const f = fields[code];
      return f && needsHighlight(f);
    }).length;

    return (
      <div key={group.domainCode} className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between rounded-md bg-[var(--color-muted)]/50 px-3 py-2">
          <h3 className="text-sm font-semibold text-[var(--color-foreground)]">
            {getFieldGroupName(group, locale)}
            <span className="ml-1.5 font-normal text-[var(--color-muted-foreground)]">
              {t("doctor.review.fieldCount", { count: groupCodes.length })}
            </span>
          </h3>
          {needReviewCount > 0 && (
            <span className="shrink-0 text-xs text-amber-600">
              {t("doctor.review.reviewCount", { count: needReviewCount })}
            </span>
          )}
        </div>
        <div className="h-px bg-[var(--color-border)]" />
        {layout === "panel" ? (
          <div className="grid grid-cols-2 gap-x-4 gap-y-3">
            {groupCodes.map((code) => {
              const field = fields[code];
              if (!field) return null;
              return (
                <FieldCard
                  key={code}
                  code={code}
                  field={field}
                  value={values[code] ?? null}
                  label={fieldLabels?.[code]}
                  isFocused={focusedField === code}
                  isConfirmed={isConfirmed}
                  onFocus={() => onFocusField?.(code)}
                  onChange={(v) => setValues({ ...values, [code]: v })}
                />
              );
            })}
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {groupCodes.map((code) => {
              const field = fields[code];
              if (!field) return null;
              return (
                <FieldCard
                  key={code}
                  code={code}
                  field={field}
                  value={values[code] ?? null}
                  label={fieldLabels?.[code]}
                  isFocused={focusedField === code}
                  isConfirmed={isConfirmed}
                  onFocus={() => onFocusField?.(code)}
                  onChange={(v) => setValues({ ...values, [code]: v })}
                />
              );
            })}
          </div>
        )}
        {!isLast && <div className="my-2" />}
      </div>
    );
  }

  // 无分组平铺列表（旧版）
  function renderFlatList() {
    const fieldGridClass =
      layout === "panel"
        ? "grid grid-cols-2 gap-x-4 gap-y-3"
        : "grid grid-cols-1 gap-4";

    return (
      <div className={fieldGridClass}>
        {codes.map((code) => {
          const field = fields[code];
          if (!field) return null;
          return (
            <FieldCard
              key={code}
              code={code}
              field={field}
              value={values[code] ?? null}
              label={fieldLabels?.[code]}
              isFocused={focusedField === code}
              isConfirmed={isConfirmed}
              onFocus={() => onFocusField?.(code)}
              onChange={(v) => setValues({ ...values, [code]: v })}
            />
          );
        })}
      </div>
    );
  }

  // 空状态
  if (codes.length === 0) {
    return (
      <p className="text-sm text-[var(--color-muted-foreground)]">
        {t("doctor.review.empty")}
      </p>
    );
  }

  // 主内容
  const fieldList = groupedSections
    ? groupedSections.map((s, i) =>
        renderGroup(s.group, s.codes, i === groupedSections.length - 1),
      )
    : renderFlatList();

  const actions = (
    <div className="flex flex-col gap-2">
      {validationError && (
        <p className="text-sm text-[var(--color-destructive)]">
          {validationError}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button
          className="self-start"
          onClick={() => onSave(values)}
          disabled={saving || isConfirmed}
        >
          {saving ? t("doctor.common.saving") : t("doctor.common.save")}
        </Button>
        {showConfirm && (
          <Button
            variant="outline"
            className="self-start"
            onClick={() => onConfirm(values)}
            disabled={confirming || isConfirmed || !!validationError}
          >
            {isConfirmed
              ? t("doctor.review.confirmed")
              : confirming
              ? t("doctor.review.generating")
              : resolvedConfirmLabel}
          </Button>
        )}
      </div>
    </div>
  );

  if (layout === "panel") {
    return (
      <div className="flex h-full min-h-0 flex-col">
        <div className="min-h-0 flex-1 overflow-y-auto pr-1">
          <div className="flex flex-col gap-6">{fieldList}</div>
        </div>
        <div className="shrink-0 border-t border-[var(--color-border)] bg-[var(--color-surface)] pt-4">
          {actions}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {fieldList}
      {actions}
    </div>
  );
}
