"use client";

// Audit grid with expandable per-entry detail rows (event code, action class,
// operator, mode, surrogate target, field-set, and parsed detail JSON). Mode
// renders as a tinted chip with an icon — never colour alone. Timestamps show
// absolute HKT time and relative age; the expanded detail carries a one-tap
// copy for the event code (audit references are pasted into tickets/reports).

import { useState } from "react";
import { useTranslations } from "next-intl";
import { StatusBadge, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@acuity/ui";
import { formatDateTime, formatRelative } from "@acuity/i18n/format";
import { AcuityIcon } from "@acuity/ui";
import { MetaBadge } from "@/components/ui/status-badge";
import { KeyVal } from "@/components/ui/detail";
import { useToast } from "@acuity/ui";
import { auditAction } from "@/lib/status";
import type { AuditLog } from "@/lib/data";

export function AuditTable({ rows, locale }: { rows: AuditLog[]; locale: string }) {
  const t = useTranslations("audit");
  const tRoot = useTranslations();
  const { showToast } = useToast();
  const [expanded, setExpanded] = useState<string | null>(null);

  const headers = [t("col.timestamp"), t("col.operator"), t("col.action-class"), t("col.target"), t("col.mode"), t("col.details")];

  function copyEventId(id: string) {
    void navigator.clipboard?.writeText(id).then(
      () => showToast(t("detail.copied")),
      () => undefined,
    );
  }

  return (
    <div className="overflow-x-auto">
      <Table>
        <caption className="sr-only">{t("title")}</caption>
        <TableHeader>
          <TableRow className="border-b border-border-strong bg-muted hover:bg-muted">
            {headers.map((h, i) => (
              <TableHead key={i} className={`h-10 bg-muted text-sm font-medium text-foreground ${i === 5 ? "w-10" : ""}`}>
                {i === 5 ? <span className="sr-only">{h}</span> : h}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((e) => {
            const meta = auditAction(e.action_type);
            const isExpanded = expanded === e.event_code;
            return [
              <TableRow
                key={e.event_code}
                className="cursor-pointer border-b border-border transition-colors hover:bg-accent"
                onClick={() => setExpanded(isExpanded ? null : e.event_code)}
              >
                <TableCell className="h-11">
                  <div className="font-mono text-sm text-foreground">
                    {formatDateTime(e.created_at, locale)} {t("tz")}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {formatRelative(e.created_at, locale, Date.now())}
                  </div>
                </TableCell>
                <TableCell className="h-11 text-sm">{e.operator_name ?? `operator:${e.operator_id}`}</TableCell>
                <TableCell className="h-11">
                  {meta ? (
                    <MetaBadge meta={meta} label={tRoot(meta.key)} />
                  ) : (
                    <MetaBadge
                      meta={{ tone: "neutral", icon: "dot", key: "" }}
                      label={e.action_type}
                    />
                  )}
                </TableCell>
                <TableCell className="h-11 font-mono text-sm">{e.target_ref ?? "—"}</TableCell>
                <TableCell className="h-11">
                  {e.mode ? (
                    <StatusBadge
                      tone={e.mode === "act-as" ? "accent" : "info"}
                      appearance="outline"
                      label={e.mode}
                      icon={<AcuityIcon name={e.mode === "act-as" ? "pencil" : "eye"} size={13} />}
                    />
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell className="h-11 text-muted-foreground">
                  <button
                    type="button"
                    onClick={(click) => {
                      click.stopPropagation();
                      setExpanded(isExpanded ? null : e.event_code);
                    }}
                    aria-expanded={isExpanded}
                    aria-label={t("detail.toggle")}
                    className="inline-flex size-6 items-center justify-center rounded-sm transition-colors hover:bg-accent hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <AcuityIcon name={isExpanded ? "chevron-up" : "chevron-down"} size={16} />
                  </button>
                </TableCell>
              </TableRow>,
              isExpanded ? (
                <TableRow key={`${e.event_code}-detail`} className="bg-muted/60 hover:bg-muted/60">
                  <TableCell colSpan={6} className="px-6 py-3">
                    <div className="grid max-w-2xl grid-cols-1 gap-x-8 sm:grid-cols-2">
                      <KeyVal label={t("detail.event-id")}>
                        <span className="inline-flex items-center gap-1.5">
                          <span className="font-mono">{e.event_code}</span>
                          <button
                            type="button"
                            onClick={(click) => {
                              click.stopPropagation();
                              copyEventId(e.event_code);
                            }}
                            aria-label={t("detail.copy-id")}
                            title={t("detail.copy-id")}
                            className="inline-flex size-6 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-accent hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          >
                            <AcuityIcon name="copy" size={13} />
                          </button>
                        </span>
                      </KeyVal>
                      <KeyVal label={t("detail.action-class")}>{meta ? tRoot(meta.key) : e.action_type}</KeyVal>
                      <KeyVal label={t("detail.operator")}>{e.operator_name ?? `operator:${e.operator_id}`}</KeyVal>
                      <KeyVal label={t("detail.mode")}>{e.mode ?? "—"}</KeyVal>
                      <KeyVal label={t("detail.target")}>
                        <span className="font-mono">{e.target_ref ?? "—"}</span>
                      </KeyVal>
                      <KeyVal label={t("detail.field-set")}>
                        {e.field_set ?? t("detail.field-set-value")}
                      </KeyVal>
                      {e.detail ? (
                        <div className="sm:col-span-2">
                          <KeyVal label={t("detail.payload")}>
                            <pre className="max-w-full overflow-x-auto whitespace-pre-wrap font-mono text-xs">
                              {JSON.stringify(e.detail, null, 2)}
                            </pre>
                          </KeyVal>
                        </div>
                      ) : null}
                    </div>
                  </TableCell>
                </TableRow>
              ) : null,
            ];
          })}
        </TableBody>
      </Table>
    </div>
  );
}
