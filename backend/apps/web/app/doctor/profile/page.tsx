"use client";

import Link from "next/link";
import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ChevronLeft } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Toast } from "@/components/ui/toast";
import { apiFetch, ApiRequestError } from "@/lib/api/client";
import type { MeResponse } from "@/lib/api/types";
import { useI18n } from "@/lib/i18n/I18nProvider";

export default function ProfilePage() {
  const { t } = useI18n();
  const me = useQuery({
    queryKey: ["me"],
    queryFn: () => apiFetch<MeResponse>("/api/auth/me"),
  });

  const [currentPwd, setCurrentPwd] = useState("");
  const [newPwd, setNewPwd] = useState("");
  const [confirmPwd, setConfirmPwd] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);
  const [showSuccess, setShowSuccess] = useState(false);

  const changePwdMut = useMutation({
    mutationFn: () =>
      apiFetch("/api/auth/change-password", {
        method: "POST",
        body: { current_password: currentPwd, new_password: newPwd },
      }),
    onSuccess: () => {
      setCurrentPwd("");
      setNewPwd("");
      setConfirmPwd("");
      setLocalError(null);
      setShowSuccess(true);
    },
    onError: (e) => {
      setLocalError(
        e instanceof ApiRequestError ? e.message : t("doctor.profile.failed"),
      );
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLocalError(null);
    if (!currentPwd) return setLocalError(t("doctor.profile.currentRequired"));
    if (newPwd.length < 6) return setLocalError(t("doctor.profile.tooShort"));
    if (newPwd !== confirmPwd) return setLocalError(t("doctor.profile.mismatch"));
    changePwdMut.mutate();
  }

  return (
    <div className="mx-auto max-w-3xl">
      {showSuccess && (
        <Toast
          message={t("doctor.profile.success")}
          variant="success"
          duration={2000}
          onDismiss={() => setShowSuccess(false)}
        />
      )}

      <Link
        href="/doctor"
        className="mb-4 inline-flex items-center gap-1 text-sm text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]"
      >
        <ChevronLeft className="h-4 w-4" />
        {t("doctor.back.dashboard")}
      </Link>
      <h1 className="text-xl font-semibold">{t("doctor.profile.title")}</h1>
      <p className="mt-1 text-sm text-[var(--color-muted-foreground)]">
        {t("doctor.profile.description")}
      </p>

      {/* 基本信息 */}
      <Card className="mt-6 border-[var(--color-border)] bg-[var(--color-surface)]">
        <CardHeader>
          <CardTitle className="text-base">{t("doctor.claim.basicInfo")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="flex justify-between">
            <span className="text-[var(--color-muted-foreground)]">{t("doctor.profile.name")}</span>
            <span>{me.data?.display_name ?? "-"}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-[var(--color-muted-foreground)]">{t("doctor.profile.role")}</span>
            <span>{t("doctor.profile.doctor")}</span>
          </div>
        </CardContent>
      </Card>

      {/* 修改密码 */}
      <Card className="mt-4 border-[var(--color-border)] bg-[var(--color-surface)]">
        <CardHeader>
          <CardTitle className="text-base">{t("doctor.profile.changePassword")}</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="current-pwd">{t("doctor.profile.currentPassword")}</Label>
              <Input
                id="current-pwd"
                type="password"
                autoComplete="current-password"
                value={currentPwd}
                onChange={(e) => setCurrentPwd(e.target.value)}
                placeholder={t("doctor.profile.currentPasswordPlaceholder")}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="new-pwd">{t("doctor.profile.newPassword")}</Label>
              <Input
                id="new-pwd"
                type="password"
                autoComplete="new-password"
                value={newPwd}
                onChange={(e) => setNewPwd(e.target.value)}
                placeholder={t("doctor.profile.newPasswordPlaceholder")}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="confirm-pwd">{t("doctor.profile.confirmPassword")}</Label>
              <Input
                id="confirm-pwd"
                type="password"
                autoComplete="new-password"
                value={confirmPwd}
                onChange={(e) => setConfirmPwd(e.target.value)}
                placeholder={t("doctor.profile.confirmPasswordPlaceholder")}
              />
            </div>

            {localError && (
              <p className="text-sm text-[var(--color-destructive)]">
                {localError}
              </p>
            )}

            <Button
              type="submit"
              className="self-start"
              disabled={changePwdMut.isPending}
            >
              {changePwdMut.isPending ? t("doctor.profile.submitting") : t("doctor.profile.submit")}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
