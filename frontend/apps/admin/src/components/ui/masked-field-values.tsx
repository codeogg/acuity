"use client";

// Final field values — masked at console level (group constraint: no PHI at
// portfolio level). Revealing is an explicit, acknowledged action that records
// an audit event before the values render; the reveal is per-visit, never
// persisted or shareable by URL.

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button, ConfirmGateDialog } from "@acuity/ui";
import { AcuityIcon } from "@acuity/ui";
import { KeyVal } from "@/components/ui/detail";
import { useToast } from "@acuity/ui";
import { revealClaimPhiAction } from "@/lib/actions";

export function MaskedFieldValues({
  submissionNo,
  values,
}: {
  submissionNo: string;
  values: Record<string, unknown>;
}) {
  const t = useTranslations("claim-detail");
  const [revealed, setRevealed] = useState(false);
  const [gateOpen, setGateOpen] = useState(false);
  const { showToast } = useToast();

  const entries = Object.entries(values);

  function reveal() {
    void revealClaimPhiAction(submissionNo).then((result) => {
      if (result.ok) {
        setRevealed(true);
        showToast(t("reveal-logged"));
      } else {
        showToast(result.message, "error");
      }
    });
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="font-mono text-xs font-medium uppercase tracking-eyebrow text-muted-foreground">
          {t("field-values")}
        </h3>
        {entries.length > 0 && !revealed ? (
          <Button type="button" variant="outline" size="sm" onClick={() => setGateOpen(true)} data-testid="reveal-button">
            <AcuityIcon name="eye" size={14} />
            {t("reveal")}
          </Button>
        ) : null}
      </div>
      <div className="mb-3 flex items-center gap-1.5 text-xs text-muted-foreground">
        <AcuityIcon name="shield" size={13} />
        {t("phi-note")}
      </div>
      {entries.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("no-values")}</p>
      ) : (
        entries.map(([key, value]) => (
          <KeyVal key={key} label={key}>
            {revealed ? (
              <span data-testid={`value-${key}`}>{String(value)}</span>
            ) : (
              <span aria-label={t("masked")} className="select-none tracking-widest text-muted-foreground">
                ••••••
              </span>
            )}
          </KeyVal>
        ))
      )}
      <ConfirmGateDialog
        open={gateOpen}
        onOpenChange={setGateOpen}
        title={t("reveal-title")}
        description={t("reveal-feedforward", { submission: submissionNo })}
        variant="ack"
        icon={<AcuityIcon name="shield" size={20} />}
        strings={{
          confirmLabel: t("reveal-confirm"),
          cancelLabel: t("reveal-cancel"),
          ackLabel: t("reveal-ack"),
        }}
        onConfirm={reveal}
      />
    </div>
  );
}
