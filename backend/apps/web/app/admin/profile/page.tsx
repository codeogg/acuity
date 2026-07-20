"use client";

import { useMutation } from "@tanstack/react-query";
import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Toast } from "@/components/ui/toast";
import { apiFetch, ApiRequestError } from "@/lib/api/client";
import { useI18n } from "@/lib/i18n/I18nProvider";

export default function AdminProfilePage() {
  const { t } = useI18n();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState<{
    text: string;
    variant: "success" | "error";
  } | null>(null);

  const changePassword = useMutation({
    mutationFn: () =>
      apiFetch("/api/auth/change-password", {
        method: "POST",
        body: {
          current_password: currentPassword,
          new_password: newPassword,
        },
      }),
    onSuccess: () => {
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setMessage({ text: t("admin.profile.success"), variant: "success" });
    },
    onError: (error) => {
      setMessage({
        text: error instanceof ApiRequestError ? error.message : t("admin.profile.failed"),
        variant: "error",
      });
    },
  });

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!currentPassword) {
      setMessage({ text: t("admin.profile.currentRequired"), variant: "error" });
      return;
    }
    if (newPassword.length < 6) {
      setMessage({ text: t("admin.profile.tooShort"), variant: "error" });
      return;
    }
    if (newPassword !== confirmPassword) {
      setMessage({ text: t("admin.profile.mismatch"), variant: "error" });
      return;
    }
    changePassword.mutate();
  }

  return (
    <div className="mx-auto max-w-3xl">
      {message && (
        <Toast
          message={message.text}
          variant={message.variant}
          duration={2500}
          onDismiss={() => setMessage(null)}
        />
      )}

      <Link
        href="/admin/clinics"
        className="mb-4 inline-flex items-center gap-1 text-sm text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]"
      >
        <ChevronLeft className="h-4 w-4" />
        {t("admin.profile.back")}
      </Link>

      <h1 className="text-xl font-semibold">{t("admin.profile.title")}</h1>
      <p className="mt-1 text-sm text-[var(--color-muted-foreground)]">
        {t("admin.profile.description")}
      </p>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-base">{t("admin.profile.changePassword")}</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="current-password">{t("admin.profile.currentPassword")}</Label>
              <Input
                id="current-password"
                type="password"
                autoComplete="current-password"
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="new-password">{t("admin.profile.newPassword")}</Label>
              <Input
                id="new-password"
                type="password"
                autoComplete="new-password"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="confirm-password">{t("admin.profile.confirmPassword")}</Label>
              <Input
                id="confirm-password"
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
              />
            </div>
            <Button type="submit" disabled={changePassword.isPending}>
              {changePassword.isPending ? t("admin.profile.saving") : t("admin.profile.save")}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
