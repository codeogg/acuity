"use client";

import { useTranslations } from "next-intl";
import { AcuityIcon } from "@acuity/ui";

// Shown when window.close() is blocked after exiting an impersonation session
// (design 5.4). Public — no session required.

const PANEL_STYLE = {
  width: "min(24rem, calc(100vw - 3rem))",
} as const;

export default function ImpersonationEndedPage() {
  const t = useTranslations("system");
  return (
    <div className="fixed inset-0 flex items-center justify-center bg-background px-6">
      <div className="text-center" style={PANEL_STYLE}>
        <div className="mb-8 select-none font-title text-2xl font-semibold text-primary">
          Acuity
        </div>
        <div className="mx-auto mb-5 flex size-14 items-center justify-center rounded-full border border-border bg-muted">
          <AcuityIcon name="check" size={26} className="text-primary" />
        </div>
        <h1 className="font-title text-2xl font-semibold text-foreground">
          {t("impersonation-ended-title")}
        </h1>
        <p className="mt-3 text-base leading-relaxed text-muted-foreground">
          {t("impersonation-ended-body")}
        </p>
      </div>
    </div>
  );
}
