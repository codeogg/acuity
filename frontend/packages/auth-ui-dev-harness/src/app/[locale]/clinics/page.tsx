"use client";

// Protected operator destination — the console landing (Clinics portfolio).

import { use } from "react";
import { useTranslations } from "next-intl";
import { SignOutButton, useSessionGuard } from "@acuity/auth-ui";

export default function ClinicsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = use(params);
  const t = useTranslations("harness");
  const { state } = useSessionGuard({ locale, signInPath: "/operator/sign-in" });

  if (state !== "authenticated") {
    return (
      <main className="flex min-h-svh items-center justify-center p-8">
        <p role="status" className="text-sm text-foreground">
          {t("checking")}
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-svh max-w-xl flex-col justify-center gap-6 p-8">
      <h1 className="auth-heading">{t("clinicsTitle")}</h1>
      <p className="text-base text-foreground">{t("clinicsLede")}</p>
      <div>
        <SignOutButton locale={locale} signInPath="/operator/sign-in">
          {t("signOut")}
        </SignOutButton>
      </div>
    </main>
  );
}
