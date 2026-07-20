"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Claim } from "@/lib/api/types";
import { useI18n } from "@/lib/i18n/I18nProvider";
import { getStandardFieldLabel } from "@/lib/extraction/standard-field-labels";

/**
 * AI 结果核对表单：置信度 < 0.6 的字段高亮标黄，提示医生重点核对。
 */
export function AiFieldReviewForm({
  claim,
  onSave,
  saving,
  onConfirm,
  confirming,
}: {
  claim: Claim;
  onSave: (values: Record<string, string | null>) => void;
  saving: boolean;
  onConfirm?: (values: Record<string, string | null>) => void;
  confirming?: boolean;
}) {
  const { locale, t } = useI18n();
  const initial = claim.final_field_values ?? {};
  const [values, setValues] = useState<Record<string, string | null>>(initial);
  const codes = Object.keys(
    claim.final_field_values ?? claim.ai_raw_result ?? {},
  );

  if (codes.length === 0) {
    return (
      <p className="text-sm text-[var(--color-muted-foreground)]">
        {t("doctor.review.noAiResult")}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-4">
        {codes.map((code) => {
          const confidence = claim.ai_raw_result?.[code]?.confidence ?? 1;
          const lowConfidence = confidence < 0.6;
          return (
            <div key={code} className="flex flex-col gap-1.5">
              <Label className="flex items-center gap-2">
                <span>{getStandardFieldLabel(code, locale)}</span>
                <span className="font-mono text-xs text-[var(--color-muted-foreground)]">
                  {code}
                </span>
                {lowConfidence && (
                  <span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-700">
                    {t("doctor.review.lowConfidence", {
                      percent: (confidence * 100).toFixed(0),
                    })}
                  </span>
                )}
              </Label>
              <Input
                className={lowConfidence ? "border-amber-400 bg-amber-50" : ""}
                value={values[code] ?? ""}
                onChange={(e) =>
                  setValues({ ...values, [code]: e.target.value || null })
                }
              />
            </div>
          );
        })}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button className="self-start" onClick={() => onSave(values)} disabled={saving}>
          {saving ? t("doctor.common.saving") : t("doctor.review.saveChanges")}
        </Button>
        {onConfirm && (
          <Button
            variant="outline"
            className="self-start"
            onClick={() => onConfirm(values)}
            disabled={confirming || saving}
          >
            {confirming ? t("doctor.review.generating") : t("doctor.review.confirmGenerate")}
          </Button>
        )}
      </div>
    </div>
  );
}
