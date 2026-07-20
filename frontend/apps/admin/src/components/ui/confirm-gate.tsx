"use client";

// Deliberate-confirm gate button — wraps the shared ConfirmGateDialog with the
// console's localised strings, the copy-target affordance (SC 3.3.8:
// copy → paste, transcription not accepted), an optional dry-run preview, and
// the server-action execution + toast + refresh cycle.

import { useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Button, ConfirmGateDialog, DryRunPreview, type DryRunItem } from "@acuity/ui";
import { useTranslations } from "next-intl";
import { AcuityIcon, type AcuityIconName } from "@acuity/ui";
import { useToast } from "@acuity/ui";
import type { ActionResult } from "@/lib/actions";

export function GateButton({
  buttonLabel,
  buttonIcon,
  buttonVariant = "outline",
  buttonSize = "sm",
  buttonClassName,
  title,
  description,
  variant,
  target,
  destructive = false,
  ackLabel,
  confirmLabel,
  dryRun,
  dryRunSummary,
  action,
  successMessage,
  disabled,
  onDone,
}: {
  buttonLabel: string;
  buttonIcon?: AcuityIconName;
  buttonVariant?: "default" | "outline" | "ghost" | "secondary" | "destructive";
  buttonSize?: "sm" | "default" | "lg";
  buttonClassName?: string;
  title: string;
  description: ReactNode;
  variant: "ack" | "paste";
  /** paste variant: the surrogate identifier that must be pasted back. */
  target?: string;
  destructive?: boolean;
  ackLabel?: string;
  confirmLabel: string;
  dryRun?: DryRunItem[];
  dryRunSummary?: string;
  action: () => Promise<ActionResult<unknown>>;
  successMessage: string;
  disabled?: boolean;
  onDone?: () => void;
}) {
  const t = useTranslations("confirm");
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [, startTransition] = useTransition();
  const router = useRouter();
  const { showToast } = useToast();

  function confirm() {
    startTransition(async () => {
      const result = await action();
      if (result.ok) {
        showToast(successMessage);
        router.refresh();
        onDone?.();
      } else {
        showToast(result.message, "error");
      }
    });
  }

  function copyTarget() {
    if (target && typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(target).catch(() => undefined);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <>
      <Button
        type="button"
        variant={buttonVariant}
        size={buttonSize}
        className={buttonClassName}
        disabled={disabled}
        onClick={() => setOpen(true)}
        // Icon-only gate buttons (empty label) take the dialog title as their
        // accessible name; labelled buttons keep the visible text as the name.
        aria-label={buttonLabel === "" ? title : undefined}
      >
        {buttonIcon ? <AcuityIcon name={buttonIcon} size={16} /> : null}
        {buttonLabel}
      </Button>
      <ConfirmGateDialog
        open={open}
        onOpenChange={setOpen}
        title={title}
        description={description}
        variant={variant}
        target={target}
        destructive={destructive}
        icon={<AcuityIcon name={destructive ? "alert" : "shield"} size={20} />}
        strings={{
          confirmLabel,
          cancelLabel: t("cancel"),
          ackLabel: ackLabel ?? t("default-ack"),
          pasteInstruction: t("paste-instruction"),
          pastePlaceholder: t("paste-placeholder"),
        }}
        onConfirm={confirm}
      >
        {dryRun ? <DryRunPreview items={dryRun} summary={dryRunSummary} /> : null}
        {variant === "paste" ? (
          <div className="flex justify-end">
            <Button type="button" variant="outline" size="sm" onClick={copyTarget}>
              <AcuityIcon name={copied ? "check" : "file"} size={14} />
              {copied ? t("copied") : t("copy")}
            </Button>
          </div>
        ) : null}
      </ConfirmGateDialog>
    </>
  );
}
