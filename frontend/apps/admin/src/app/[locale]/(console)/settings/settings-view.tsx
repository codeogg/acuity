"use client";

// Preferences client islands: editable profile fields, password change, and the
// internal RBAC panel (role change behind an acknowledgement gate — capability
// changes are server-enforced + logged).

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Button, Input, useToast } from "@acuity/ui";
import { AcuityIcon } from "@acuity/ui";
import { Avatar } from "@acuity/ui";
import { CrmFieldRow } from "@/components/ui/crm-field";
import { GateButton } from "@/components/ui/confirm-gate";
import { changePasswordAction, changeRoleAction, updateProfileAction } from "@/lib/actions";
import { consoleSignOut } from "@/components/shell/console-sign-out";
import type { OperatorAccount } from "@/lib/ops-model";

export function ProfileFields({ name, username }: { name: string; username: string }) {
  const t = useTranslations("settings");
  return (
    <>
      <CrmFieldRow
        label={t("display-name")}
        value={name}
        commit={(next) => updateProfileAction({ name: next })}
        successMessage={t("profile-saved")}
      />
      <KeyValReadonly label={t("username")} value={username} />
    </>
  );
}

function KeyValReadonly({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-border py-2.5 last:border-0">
      <span className="shrink-0 text-sm text-muted-foreground">{label}</span>
      <span className="min-w-0 truncate font-mono text-sm text-foreground">{value}</span>
    </div>
  );
}

export function ChangePasswordForm() {
  const t = useTranslations("settings");
  const { showToast } = useToast();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pending, startTransition] = useTransition();

  function localMessage(code: string | undefined): string {
    switch (code) {
      case "current-required":
        return t("password-current-required");
      case "too-short":
        return t("password-too-short");
      case "mismatch":
        return t("password-mismatch");
      default:
        return code || t("password-failed");
    }
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    startTransition(async () => {
      const result = await changePasswordAction({
        current_password: currentPassword,
        new_password: newPassword,
        confirm_password: confirmPassword,
      });
      if (!result.ok) {
        showToast(localMessage(result.message), "error");
        return;
      }
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      showToast(t("password-changed"));
    });
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="space-y-1.5">
        <label htmlFor="settings-current-password" className="text-sm text-muted-foreground">
          {t("password-current")}
        </label>
        <Input
          id="settings-current-password"
          type="password"
          autoComplete="current-password"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          disabled={pending}
        />
      </div>
      <div className="space-y-1.5">
        <label htmlFor="settings-new-password" className="text-sm text-muted-foreground">
          {t("password-new")}
        </label>
        <Input
          id="settings-new-password"
          type="password"
          autoComplete="new-password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          disabled={pending}
        />
      </div>
      <div className="space-y-1.5">
        <label htmlFor="settings-confirm-password" className="text-sm text-muted-foreground">
          {t("password-confirm")}
        </label>
        <Input
          id="settings-confirm-password"
          type="password"
          autoComplete="new-password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          disabled={pending}
        />
      </div>
      <p className="text-xs text-muted-foreground">{t("password-hint")}</p>
      <Button type="submit" disabled={pending}>
        {pending ? t("password-saving") : t("password-submit")}
      </Button>
    </form>
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
