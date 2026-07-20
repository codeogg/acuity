"use client";

// Preferences client islands: editable profile fields, hardware-key MFA
// device management, and the internal RBAC panel (role change behind an
// acknowledgement gate — capability changes are server-enforced + logged).

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Button, Callout, Input } from "@acuity/ui";
import { formatDate, formatRelative } from "@acuity/i18n/format";
import { AcuityIcon } from "@acuity/ui";
import { Avatar } from "@acuity/ui";
import { MetaBadge } from "@/components/ui/status-badge";
import { CrmFieldRow } from "@/components/ui/crm-field";
import { GateButton } from "@/components/ui/confirm-gate";
import { useToast } from "@acuity/ui";
import {
  changeRoleAction,
  enrolMfaDeviceAction,
  removeMfaDeviceAction,
  updateProfileAction,
} from "@/lib/actions";
import { consoleSignOut } from "@/components/shell/console-sign-out";
import type { MfaDevice, OperatorAccount } from "@/lib/ops-model";

export function ProfileFields({ name, email }: { name: string; email: string }) {
  const t = useTranslations("settings");
  return (
    <>
      <CrmFieldRow label={t("display-name")} value={name} commit={(next) => updateProfileAction({ name: next })} />
      <CrmFieldRow label={t("email")} value={email} commit={(next) => updateProfileAction({ email: next })} />
    </>
  );
}

export function MfaDevices({ devices }: { devices: MfaDevice[] }) {
  const t = useTranslations("settings");
  const locale = useLocale();
  const [enrolling, setEnrolling] = useState(false);
  const [label, setLabel] = useState("");
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const { showToast } = useToast();

  function enrol() {
    if (!label.trim()) return;
    startTransition(async () => {
      const result = await enrolMfaDeviceAction(label.trim());
      if (result.ok) {
        showToast(t("device-enrolled", { label: label.trim() }));
        setEnrolling(false);
        setLabel("");
        router.refresh();
      } else showToast(result.message, "error");
    });
  }

  return (
    <div>
      {devices.map((device) => {
        const last = devices.length === 1;
        return (
          <div key={device.id} className="flex items-center gap-3 border-b border-border py-2.5">
            <span className="flex text-tone-info">
              <AcuityIcon name="key" size={18} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm text-foreground">{device.label}</span>
              <span className="block text-xs text-muted-foreground">
                {t("device-dates", {
                  registered: formatDate(device.enrolled_at, locale),
                  lastUsed: device.last_used_at
                    ? formatRelative(device.last_used_at, locale, Date.now())
                    : t("device-never-used"),
                })}
              </span>
            </span>
            <MetaBadge meta={{ tone: "success", icon: "check", key: "" }} label={t("enrolled")} />
            <GateButton
              buttonLabel={t("remove")}
              buttonVariant="ghost"
              buttonClassName="text-destructive"
              title={t("remove-device-title")}
              description={last ? t("remove-last-feedforward") : t("remove-feedforward")}
              variant="ack"
              destructive={last}
              ackLabel={last ? t("remove-last-ack") : t("remove-ack")}
              confirmLabel={t("remove-confirm")}
              action={() => removeMfaDeviceAction(device.id, device.label)}
              successMessage={t("device-removed")}
            />
          </div>
        );
      })}
      {devices.length === 1 ? (
        <div className="mt-3">
          <Callout tone="info">{t("backup-key-nudge")}</Callout>
        </div>
      ) : null}
      {enrolling ? (
        <div className="mt-3 flex items-center gap-2">
          <Input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder={t("device-label-placeholder")}
            aria-label={t("device-label-placeholder")}
            className="h-9 flex-1"
          />
          <Button type="button" size="sm" onClick={enrol} disabled={pending || !label.trim()}>
            {t("enrol")}
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => setEnrolling(false)}>
            <AcuityIcon name="x" size={14} />
          </Button>
        </div>
      ) : (
        <div className="mt-3">
          <Button type="button" variant="outline" size="sm" onClick={() => setEnrolling(true)}>
            <AcuityIcon name="plus" size={16} />
            {t("enrol-device")}
          </Button>
        </div>
      )}
    </div>
  );
}

export function RbacPanel({ operators }: { operators: OperatorAccount[] }) {
  const t = useTranslations("settings");
  return (
    <div>
      {operators.map((operator) => (
        <div key={operator.email} className="flex items-center gap-3 border-b border-border py-2.5 last:border-0">
          <Avatar name={operator.name} size={28} />
          <span className="flex-1 text-sm text-foreground">{operator.name}</span>
          <span className="font-mono text-sm text-muted-foreground">{operator.role}</span>
          <GateButton
            buttonLabel={t("change-role")}
            buttonVariant="ghost"
            title={t("role-title")}
            description={t("role-feedforward")}
            variant="ack"
            ackLabel={t("role-ack")}
            confirmLabel={t("role-confirm")}
            action={() => changeRoleAction(operator.email)}
            successMessage={t("role-updated")}
          />
        </div>
      ))}
    </div>
  );
}

export function SettingsSignOut({ locale, label }: { locale: string; label: string }) {
  return (
    <Button type="button" variant="outline" onClick={() => consoleSignOut(locale)}>
      <AcuityIcon name="sign-out" size={16} />
      {label}
    </Button>
  );
}
