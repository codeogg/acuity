"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LocaleSwitcher } from "@/components/shared/LocaleSwitcher";
import { apiFetch, ApiRequestError } from "@/lib/api/client";
import type { LoginResponse } from "@/lib/api/types";
import { useI18n } from "@/lib/i18n/I18nProvider";

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const { t } = useI18n();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await apiFetch<LoginResponse>("/api/auth/login", {
        method: "POST",
        body: { username, password },
      });
      const fallback = res.role === "DOCTOR" ? "/doctor" : "/admin/clinics";
      router.push(params.get("redirect") ?? fallback);
      router.refresh();
    } catch (err) {
      setError(
        err instanceof ApiRequestError ? err.message : t("auth.loginFailed"),
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--color-muted)] px-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <div className="-mx-2 -mt-2 mb-2 flex justify-end">
            <LocaleSwitcher compact />
          </div>
          <CardTitle>{t("app.title")}</CardTitle>
          <p className="text-sm text-[var(--color-muted-foreground)]">
            {t("auth.loginHint")}
          </p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="username">{t("auth.username")}</Label>
              <Input
                id="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                required
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="password">{t("auth.password")}</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
              />
            </div>
            {error && <p className="text-sm text-[var(--color-destructive)]">{error}</p>}
            <Button type="submit" disabled={loading}>
              {loading ? t("auth.loggingIn") : t("auth.login")}
            </Button>
          </form>
          <p className="mt-4 text-xs text-[var(--color-muted-foreground)]">
            {t("auth.demoAccounts")}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
