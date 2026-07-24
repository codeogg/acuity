"use client";

// Impersonation chooser — doctor select + view-as / act-as mode cards + the
// never-invisible notice. View-as starts directly; act-as goes through an
// acknowledgement gate. On success, open the backend entry_url in a new tab.
// submitting flips synchronously on click to block double-submit.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  Button,
  ConfirmGateDialog,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@acuity/ui";
import { AcuityIcon } from "@acuity/ui";
import { useToast } from "@acuity/ui";
import { startImpersonationAction } from "@/lib/actions";

export function ImpersonateControl({
  clinicId,
  clinicName,
  doctors,
}: {
  clinicId: number;
  clinicName: string;
  doctors: { id: number; label: string }[];
}) {
  const t = useTranslations("impersonate");
  const [mode, setMode] = useState<"view-as" | "act-as">("view-as");
  const [doctorId, setDoctorId] = useState<string>(doctors[0] ? String(doctors[0].id) : "");
  const [gateOpen, setGateOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const router = useRouter();
  const { showToast } = useToast();

  const doctorLabel = doctors.find((d) => String(d.id) === doctorId)?.label ?? doctorId;
  const locked = submitting || !doctorId;

  async function start() {
    if (!doctorId || submitting) return;
    setSubmitting(true);
    try {
      const result = await startImpersonationAction(clinicId, Number(doctorId), mode);
      if (!result.ok) {
        showToast(result.message, "error");
        return;
      }
      const entryUrl = result.data?.entry_url;
      if (!entryUrl) {
        showToast(t("missing-entry-url"), "error");
        return;
      }
      window.open(entryUrl, "_blank", "noopener,noreferrer");
      showToast(mode === "act-as" ? t("started-act-as") : t("started-view-as"));
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  function enter() {
    if (locked) return;
    if (mode === "act-as") setGateOpen(true);
    else void start();
  }

  function ModeCard({
    value,
    icon,
    title,
    desc,
  }: {
    value: "view-as" | "act-as";
    icon: "eye" | "pencil";
    title: string;
    desc: string;
  }) {
    const selected = mode === value;
    return (
      <button
        type="button"
        onClick={() => !submitting && setMode(value)}
        disabled={submitting}
        className="block flex-1 text-left disabled:opacity-60"
        aria-pressed={selected}
      >
        <div
          className={`rounded-lg border bg-card p-4 transition-colors ${
            selected ? "border-primary ring-1 ring-primary" : "border-border"
          }`}
        >
          <div className="mb-1.5 flex items-center gap-2">
            <span className={`flex ${selected ? "text-primary" : "text-muted-foreground"}`}>
              <AcuityIcon name={icon} size={18} />
            </span>
            <span className="text-sm font-semibold text-foreground">{title}</span>
            {selected ? (
              <span className="ml-auto flex text-primary">
                <AcuityIcon name="check" size={16} />
              </span>
            ) : null}
          </div>
          <div className="text-xs text-muted-foreground">{desc}</div>
        </div>
      </button>
    );
  }

  return (
    <div>
      <div className="mb-5 flex items-start gap-2.5 rounded-md bg-sky-blue/40 p-3 text-sm text-foreground">
        <span className="mt-0.5 flex shrink-0">
          <AcuityIcon name="info" size={18} />
        </span>
        {t("never-invisible")}
      </div>
      <label className="mb-1 block text-xs font-medium text-muted-foreground">{t("doctor")}</label>
      <Select value={doctorId} onValueChange={setDoctorId} disabled={submitting}>
        <SelectTrigger aria-label={t("doctor")} className="mb-5 w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {doctors.map((d) => (
            <SelectItem key={d.id} value={String(d.id)}>
              {d.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <div className="mb-1 block text-xs font-medium text-muted-foreground">{t("mode")}</div>
      <div className="mb-6 flex gap-3">
        <ModeCard value="view-as" icon="eye" title={t("view-as")} desc={t("view-as-desc")} />
        <ModeCard value="act-as" icon="pencil" title={t("act-as")} desc={t("act-as-desc")} />
      </div>
      <Button type="button" className="w-full" onClick={enter} disabled={locked}>
        <AcuityIcon name={mode === "act-as" ? "pencil" : "eye"} size={16} />
        {mode === "act-as" ? t("enter-act-as") : t("enter-view-as")}
      </Button>
      <ConfirmGateDialog
        open={gateOpen}
        onOpenChange={(open) => {
          if (!submitting) setGateOpen(open);
        }}
        title={t("gate.title")}
        description={t("gate.description", { doctor: doctorLabel, clinic: clinicName })}
        variant="ack"
        icon={<AcuityIcon name="shield" size={20} />}
        strings={{
          confirmLabel: t("gate.confirm"),
          cancelLabel: t("gate.cancel"),
          ackLabel: t("gate.ack", { doctor: doctorLabel }),
        }}
        onConfirm={() => {
          void start();
        }}
      />
    </div>
  );
}
