"use client";

// Retention override — paste clinic code + new retention_days, then POST the
// super-admin-only override endpoint. Shows effective days and override state.

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  Button,
  ConfirmGateDialog,
  Input,
  cn,
  useToast,
} from "@acuity/ui";
import { AcuityIcon } from "@acuity/ui";
import { overrideClinicRetentionAction } from "@/lib/actions";
import type { ClinicRetentionAuditOut, ClinicRetentionOut } from "@acuity/types";
import { formatRelative } from "@acuity/i18n/format";

export function RetentionOverridePanel({
  clinicId,
  clinicCode,
  clinicName,
  retention,
  history,
  locale,
}: {
  clinicId: number;
  clinicCode: string;
  clinicName: string;
  retention: ClinicRetentionOut;
  history: ClinicRetentionAuditOut[];
  locale: string;
}) {
  const t = useTranslations("clinic-drawer.account");
  const tConfirm = useTranslations("confirm");
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [days, setDays] = useState(String(retention.retention_days));
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const { showToast } = useToast();

  const parsedDays = useMemo(() => {
    const n = Number(days);
    return Number.isFinite(n) && n >= 1 ? Math.floor(n) : null;
  }, [days]);

  function copyTarget() {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(clinicCode).catch(() => undefined);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  function confirm() {
    if (parsedDays == null) {
      showToast(t("retention-days-invalid"), "error");
      return;
    }
    startTransition(async () => {
      // Paste gate already verified the clipboard value === clinicCode.
      const result = await overrideClinicRetentionAction(
        clinicId,
        clinicCode,
        clinicCode,
        parsedDays,
      );
      if (result.ok) {
        showToast(t("retention-done", { name: clinicName }));
        setOpen(false);
        router.refresh();
      } else {
        showToast(result.message, "error");
      }
    });
  }

  return (
    <div>
      <div className="mb-3 space-y-1 text-sm">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-muted-foreground">{t("retention-effective")}</span>
          <span className="font-mono tabular-nums text-foreground">
            {t("retention-days-value", { days: retention.retention_days })}
          </span>
        </div>
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-muted-foreground">{t("retention-source")}</span>
          <span className={cn(retention.is_overridden ? "text-destructive" : "text-foreground")}>
            {retention.is_overridden
              ? t("retention-overridden")
              : t("retention-default", { policy: retention.policy_name ?? "—" })}
          </span>
        </div>
      </div>

      <div className="mb-3">
        <label className="mb-1.5 block text-xs font-medium text-muted-foreground" htmlFor="retention-days">
          {t("retention-days-label")}
        </label>
        <Input
          id="retention-days"
          type="number"
          min={1}
          max={36500}
          value={days}
          onChange={(e) => setDays(e.target.value)}
          className="h-8 font-mono"
        />
      </div>

      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="text-destructive"
        onClick={() => {
          setCopied(false);
          setOpen(true);
        }}
        disabled={pending || parsedDays == null}
      >
        <AcuityIcon name="shield" size={16} />
        {t("override-retention")}
      </Button>

      <ConfirmGateDialog
        open={open}
        onOpenChange={setOpen}
        title={t("retention-title")}
        description={t("retention-feedforward", { name: clinicName })}
        variant="paste"
        target={clinicCode}
        destructive
        icon={<AcuityIcon name="alert" size={20} />}
        strings={{
          confirmLabel: t("retention-confirm"),
          cancelLabel: tConfirm("cancel"),
          pasteInstruction: tConfirm("paste-instruction"),
          pastePlaceholder: tConfirm("paste-placeholder"),
        }}
        onConfirm={confirm}
      >
        <div className="mb-3 flex justify-end">
          <Button type="button" variant="outline" size="sm" onClick={copyTarget}>
            <AcuityIcon name={copied ? "check" : "file"} size={14} />
            {copied ? tConfirm("copied") : tConfirm("copy")}
          </Button>
        </div>
        <p className="mb-2 text-xs text-muted-foreground">
          {t("retention-confirm-days", { days: parsedDays ?? "—" })}
        </p>
      </ConfirmGateDialog>

      {history.length > 0 ? (
        <div className="mt-6">
          <div className="mb-2 font-mono text-xs font-medium uppercase tracking-eyebrow text-muted-foreground">
            {t("retention-history")}
          </div>
          <ul className="space-y-2">
            {history.map((row) => (
              <li
                key={row.id}
                className="rounded-md border border-border px-3 py-2 text-xs text-muted-foreground"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-mono text-foreground">
                    {row.old_retention_days} → {row.new_retention_days}{" "}
                    {t("retention-days-unit")}
                  </span>
                  <span>{formatRelative(row.operated_at, locale, Date.now())}</span>
                </div>
                <div className="mt-0.5">
                  {row.operator_name ?? `#${row.operated_by}`} · {row.clinic_code_input}
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
