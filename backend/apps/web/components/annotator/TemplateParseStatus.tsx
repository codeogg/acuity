"use client";

import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { isParseActive, useParseProgress } from "@/lib/hooks/useParseProgress";
import type { ParseStatus, PolicyTemplate } from "@/lib/api/types";
import { useI18n } from "@/lib/i18n/I18nProvider";

export function TemplateParseStatus({ template }: { template: PolicyTemplate }) {
  const qc = useQueryClient();
  const { t } = useI18n();
  const active = isParseActive(template.parse_status);
  const { data: progress } = useParseProgress(template.id, active);

  useEffect(() => {
    const status = progress?.status as ParseStatus | undefined;
    if (status && !isParseActive(status) && active) {
      qc.invalidateQueries({ queryKey: ["templates"] });
    }
  }, [progress?.status, active, qc]);

  if (template.parse_status === "PARSE_FAILED") {
    return (
      <div className="mt-1 min-w-[140px] text-xs text-red-600">
        {template.parse_message ?? template.parse_error ?? t("annotator.parseFailed")}
      </div>
    );
  }

  if (!active) return null;

  const percent = progress?.percent ?? template.parse_progress ?? 0;
  const message = progress?.message ?? template.parse_message ?? t("annotator.waitingParse");

  return (
    <div className="mt-1 min-w-[160px]">
      <div className="mb-1 h-1.5 overflow-hidden rounded-full bg-[var(--color-muted)]">
        <div
          className="h-full rounded-full bg-[var(--color-primary)] transition-all"
          style={{ width: `${Math.min(100, Math.max(0, percent))}%` }}
        />
      </div>
      <div className="text-xs text-[var(--color-muted-foreground)]">{message}</div>
    </div>
  );
}
