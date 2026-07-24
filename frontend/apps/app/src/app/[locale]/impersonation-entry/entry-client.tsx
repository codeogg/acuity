"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { doctorImpersonation } from "@acuity/api-client";
import { MOCK_SESSION_COOKIE } from "@acuity/auth-ui";
import { AcuityIcon, Spinner } from "@acuity/ui";

// 宽度用 vw 锚定（与 dialog-content 同理）：避免百分比落在不定/极窄
// containing block 上，把标题压成一词一行的竖条。
const PANEL_STYLE = {
  width: "min(24rem, calc(100vw - 3rem))",
} as const;

export default function ImpersonationEntryClient() {
  const t = useTranslations("system");
  const router = useRouter();
  const search = useSearchParams();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = search.get("token")?.trim() ?? "";
    if (!token) {
      setError(t("impersonation-entry-missing"));
      return;
    }
    let cancelled = false;
    doctorImpersonation
      .enterImpersonation({ token })
      .then(() => {
        if (cancelled) return;
        document.cookie = `${MOCK_SESSION_COOKIE}=1; Path=/; SameSite=Lax`;
        router.replace("/");
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const message =
          err && typeof err === "object" && "message" in err
            ? String((err as { message: unknown }).message)
            : t("impersonation-entry-failed");
        setError(message || t("impersonation-entry-failed"));
      });
    return () => {
      cancelled = true;
    };
  }, [search, router, t]);

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-background px-6">
      <div className="text-center" style={PANEL_STYLE}>
        <div className="mb-8 select-none font-title text-2xl font-semibold text-primary">
          Acuity
        </div>
        {error ? (
          <>
            <div className="mx-auto mb-5 flex size-14 items-center justify-center rounded-full border border-border bg-muted">
              <AcuityIcon name="alert" size={26} className="text-destructive" />
            </div>
            <h1 className="font-title text-2xl font-semibold text-foreground">
              {t("impersonation-entry-error-title")}
            </h1>
            <p className="mt-3 text-base leading-relaxed text-muted-foreground">
              {error}
            </p>
          </>
        ) : (
          <>
            <div className="mx-auto mb-5 flex size-14 items-center justify-center rounded-full border border-border bg-muted">
              <Spinner size={26} className="text-primary" />
            </div>
            <h1 className="font-title text-2xl font-semibold text-foreground">
              {t("impersonation-entry-loading")}
            </h1>
            <p className="mt-3 text-base leading-relaxed text-muted-foreground">
              {t("impersonation-entry-loading-body")}
            </p>
          </>
        )}
      </div>
    </div>
  );
}
