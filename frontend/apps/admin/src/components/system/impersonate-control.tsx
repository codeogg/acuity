"use client";

// Impersonation chooser — doctor select + view-as / act-as mode cards + the
// never-invisible notice. View-as starts directly (the safer default); act-as
// is the deliberate escalation behind an explicit-acknowledgement gate. The
// session persists server-side (mock store), the banner is server-rendered,
// and start / end are audited by the mock handlers.

import { useState, useTransition } from "react";
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
  const [, startTransition] = useTransition();
  const router = useRouter();
  const { showToast } = useToast();

  const doctorLabel = doctors.find((d) => String(d.id) === doctorId)?.label ?? doctorId;

  function start() {
    startTransition(async () => {
      const result = await startImpersonationAction(clinicId, Number(doctorId), mode);
      if (result.ok) {
        showToast(mode === "act-as" ? t("started-act-as") : t("started-view-as"));
        router.refresh();
      } else {
        showToast(result.message, "error");
      }
    });
  }

  function enter() {
    if (!doctorId) return;
    if (mode === "act-as") setGateOpen(true);
    else start();
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
      <button type="button" onClick={() => setMode(value)} className="block flex-1 text-left" aria-pressed={selected}>
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
      <Select value={doctorId} onValueChange={setDoctorId}>
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
      <Button type="button" className="w-full" onClick={enter} disabled={!doctorId}>
        <AcuityIcon name={mode === "act-as" ? "pencil" : "eye"} size={16} />
        {mode === "act-as" ? t("enter-act-as") : t("enter-view-as")}
      </Button>
      <ConfirmGateDialog
        open={gateOpen}
        onOpenChange={setGateOpen}
        title={t("gate.title")}
        description={t("gate.description", { doctor: doctorLabel, clinic: clinicName })}
        variant="ack"
        icon={<AcuityIcon name="shield" size={20} />}
        strings={{
          confirmLabel: t("gate.confirm"),
          cancelLabel: t("gate.cancel"),
          ackLabel: t("gate.ack", { doctor: doctorLabel }),
        }}
        onConfirm={start}
      />
    </div>
  );
}
