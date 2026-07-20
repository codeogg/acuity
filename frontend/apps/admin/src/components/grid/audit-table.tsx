"use client";

// Audit grid with expandable per-entry detail rows (event id, action class,
// operator, mode, surrogate target, and the enumerated field-set note). Mode
// renders as a tinted chip with an icon — never colour alone. Timestamps show
// the absolute time with its timezone stated (HKT) and the relative age
// together, so an entry reads at a glance and cites precisely; the expanded
// detail carries a one-tap copy for the event ID (audit references are
// pasted into tickets and reports, never retyped).

import { useState } from "react";
import { useTranslations } from "next-intl";
import { StatusBadge, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@acuity/ui";
import { formatRelative } from "@acuity/i18n/format";
import { AcuityIcon } from "@acuity/ui";
import { MetaBadge } from "@/components/ui/status-badge";
import { KeyVal } from "@/components/ui/detail";
import { useToast } from "@acuity/ui";
import { auditAction } from "@/lib/status";
import type { AuditEvent } from "@/lib/data";

// Audit timestamps arrive in the house display form ("YYYY-MM-DD at
// HH.mm.ss", HK-local). Parse it for the relative-age line; the house string
// itself stays the absolute display, with the timezone stated beside it.
function parseHouseTimestamp(ts: string): number | null {
  const iso = ts.replace(" at ", "T").replaceAll(".", ":");
  const parsed = Date.parse(iso);
  return Number.isFinite(parsed) ? parsed : null;
}

export function AuditTable({ rows, locale }: { rows: AuditEvent[]; locale: string }) {
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
                {/* The details column shows only per-row chevrons; the header
                    text is for AT, not the visual grid. */}
                {i === 5 ? <span className="sr-only">{h}</span> : h}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((e) => {
            const meta = auditAction(e.action);
            const isExpanded = expanded === e.id;
            return [
              <TableRow
                key={e.id}
                className="cursor-pointer border-b border-border transition-colors hover:bg-accent"
                onClick={() => setExpanded(isExpanded ? null : e.id)}
              >
                <TableCell className="h-11">
                  <div className="font-mono text-sm text-foreground">
                    {e.ts} {t("tz")}
                  </div>
                  {(() => {
                    const parsed = parseHouseTimestamp(e.ts);
                    return parsed != null ? (
                      <div className="text-xs text-muted-foreground">
                        {formatRelative(new Date(parsed).toISOString(), locale, Date.now())}
                      </div>
                    ) : null;
                  })()}
                </TableCell>
                <TableCell className="h-11 text-sm">{e.operator}</TableCell>
                <TableCell className="h-11">
                  {meta ? (
                    <MetaBadge meta={meta} label={tRoot(meta.key)} />
                  ) : (
                    <MetaBadge
                      meta={{ tone: "neutral", icon: "dot", key: "" }}
                      label={e.action}
                    />
                  )}
                </TableCell>
                <TableCell className="h-11 font-mono text-sm">{e.target}</TableCell>
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
                  {/* The row click is a pointer convenience; this button is the
                      keyboard/AT-facing expand control (rows cannot carry
                      aria-expanded). */}
                  <button
                    type="button"
                    onClick={(click) => {
                      click.stopPropagation();
                      setExpanded(isExpanded ? null : e.id);
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
                <TableRow key={`${e.id}-detail`} className="bg-muted/60 hover:bg-muted/60">
                  <TableCell colSpan={6} className="px-6 py-3">
                    <div className="grid max-w-2xl grid-cols-1 gap-x-8 sm:grid-cols-2">
                      <KeyVal label={t("detail.event-id")}>
                        <span className="inline-flex items-center gap-1.5">
                          <span className="font-mono">{e.id}</span>
                          <button
                            type="button"
                            onClick={(click) => {
                              click.stopPropagation();
                              copyEventId(e.id);
                            }}
                            aria-label={t("detail.copy-id")}
                            title={t("detail.copy-id")}
                            className="inline-flex size-6 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-accent hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          >
                            <AcuityIcon name="copy" size={13} />
                          </button>
                        </span>
                      </KeyVal>
                      <KeyVal label={t("detail.action-class")}>{meta ? tRoot(meta.key) : e.action}</KeyVal>
                      <KeyVal label={t("detail.operator")}>{e.operator}</KeyVal>
                      <KeyVal label={t("detail.mode")}>{e.mode ?? "—"}</KeyVal>
                      <KeyVal label={t("detail.target")}>
                        <span className="font-mono">{e.target}</span>
                      </KeyVal>
                      <KeyVal label={t("detail.field-set")}>{t("detail.field-set-value")}</KeyVal>
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
