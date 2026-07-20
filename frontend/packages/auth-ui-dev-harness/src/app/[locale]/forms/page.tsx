"use client";

/*
 * Protected doctor destination — proves the post-auth handoff, the sign-out
 * wiring, and the session-expiry re-entry journey (expire -> sign-in with the
 * deep link preserved -> back here).
 */

import { use } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@acuity/ui";
import { SignOutButton, useSessionGuard } from "@acuity/auth-ui";

export default function FormsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = use(params);
  const t = useTranslations("harness");
  const { state, recheck } = useSessionGuard({ locale, signInPath: "/sign-in" });

  async function expireSession() {
    // Review affordance: expire the mock session server-side, then let the
    // guard's own detection + deep-link-preserving redirect run. A live
    // deployment reaches the same journey from a 401 interceptor.
    const { authStore } = await import("@acuity/api-client/mocks/stores");
    authStore.expireSession();
    recheck();
  }

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
      <h1 className="auth-heading">{t("formsTitle")}</h1>
      <p className="text-base text-foreground">{t("formsLede")}</p>
      <div className="flex flex-col items-start gap-3 md:flex-row">
        <SignOutButton locale={locale} signInPath="/sign-in">
          {t("signOut")}
        </SignOutButton>
        <Button type="button" variant="ghost" onClick={() => void expireSession()}>
          {t("expireSession")}
        </Button>
      </div>
    </main>
  );
}
