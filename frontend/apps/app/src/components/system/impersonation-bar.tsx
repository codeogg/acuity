"use client";

import { useTranslations } from "next-intl";
import { EyeIcon } from "@acuity/ui";

// The persistent, non-dismissable operator-impersonation signal
// (system-overlays.md): a full-width coloured bar pinned above the shell,
// text + icon (never colour alone), role="status". No doctor-facing action.

export function ImpersonationBar({ mode }: { mode: "view-as" | "act-as" }) {
  const t = useTranslations("system");
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex shrink-0 items-center justify-center gap-2.5 border-b border-border bg-[var(--tone-info)] px-6 py-2 text-[var(--color-on-navy)]"
    >
      <EyeIcon size={18} aria-hidden />
      <span className="text-sm font-medium">
        {mode === "act-as" ? t("impersonation-acting") : t("impersonation-viewing")}
      </span>
      <span className="text-xs opacity-80">
        · {mode === "act-as" ? t("impersonation-write") : t("impersonation-read-only")}
      </span>
    </div>
  );
}
