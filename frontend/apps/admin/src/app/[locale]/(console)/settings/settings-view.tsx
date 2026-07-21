"use client";

// Preferences client islands: editable profile fields and the internal RBAC
// panel (role change behind an acknowledgement gate — capability changes are
// server-enforced + logged).

import { useTranslations } from "next-intl";
import { Button } from "@acuity/ui";
import { AcuityIcon } from "@acuity/ui";
import { Avatar } from "@acuity/ui";
import { CrmFieldRow } from "@/components/ui/crm-field";
import { GateButton } from "@/components/ui/confirm-gate";
import { changeRoleAction, updateProfileAction } from "@/lib/actions";
import { consoleSignOut } from "@/components/shell/console-sign-out";
import type { OperatorAccount } from "@/lib/ops-model";

export function ProfileFields({ name, email }: { name: string; email: string }) {
  const t = useTranslations("settings");
  return (
    <>
      <CrmFieldRow label={t("display-name")} value={name} commit={(next) => updateProfileAction({ name: next })} />
      <CrmFieldRow label={t("email")} value={email} commit={(next) => updateProfileAction({ email: next })} />
    </>
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
