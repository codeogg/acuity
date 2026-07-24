"use client";

import { useTranslations } from "next-intl";
import { AcuityIcon, Button } from "@acuity/ui";

// Persistent, non-dismissable operator-impersonation banner (design 5.3).
// Text + icon + tint (view = sky-blue / proxy = mist-lavender). Exit is the
// only doctor-surface action (design 5.4).

export type ImpersonationUiMode = "view" | "proxy";

export function ImpersonationBar({
  mode,
  doctorName,
  exiting,
  onExit,
}: {
  mode: ImpersonationUiMode;
  doctorName: string;
  exiting?: boolean;
  onExit?: () => void;
}) {
  const t = useTranslations("system");
  const isProxy = mode === "proxy";

  return (
    <div
      role="status"
      aria-live="polite"
      className={`flex shrink-0 items-center gap-2.5 border-b border-border px-6 py-2 ${
        isProxy ? "bg-mist-lavender text-foreground" : "bg-sky-blue text-foreground"
      }`}
    >
      <span className="flex shrink-0">
        <AcuityIcon name={isProxy ? "pencil" : "eye"} size={18} />
      </span>
      <span className="flex-1 text-sm font-medium">
        {isProxy
          ? t("impersonation-banner-proxy", { doctor: doctorName })
          : t("impersonation-banner-view", { doctor: doctorName })}
        <span className="ml-2 text-xs opacity-80">
          · {isProxy ? t("impersonation-write") : t("impersonation-read-only")}
        </span>
      </span>
      {onExit ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 shrink-0 bg-background"
          disabled={exiting}
          onClick={onExit}
        >
          <AcuityIcon name="x" size={14} />
          {t("impersonation-exit")}
        </Button>
      ) : null}
    </div>
  );
}
