"use client";

import { useLocale, useTranslations } from "next-intl";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  ShieldIcon,
} from "@acuity/ui";
import { formatDateTime } from "@acuity/i18n/format";
import type { Locale } from "@/i18n/routing";

// Post-session transparency notice (design 5.6 / PDPO DPP6): one dialog per
// ended support session; doctor acknowledges with a single OK.

export function SupportAccessDialog({
  accessedAt,
  operator,
  mode,
  reason,
  onAck,
}: {
  accessedAt: string;
  operator?: string;
  mode?: "view" | "proxy";
  reason?: string | null;
  onAck: () => void;
}) {
  const t = useTranslations("system");
  const locale = useLocale() as Locale;
  const modeLabel =
    mode === "proxy"
      ? t("support-access-mode-proxy")
      : t("support-access-mode-view");
  return (
    <Dialog open onOpenChange={(open) => !open && onAck()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <ShieldIcon size={22} className="text-[var(--tone-info)]" aria-hidden />
            {t("support-access-title")}
          </DialogTitle>
          <DialogDescription>
            {t("support-access-body", {
              operator: operator?.trim() || t("impersonation-operator-fallback"),
              mode: modeLabel,
              when: formatDateTime(accessedAt, locale, { timeZone: "Asia/Hong_Kong" }),
              reason: reason?.trim() || t("support-access-reason-fallback"),
            })}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button onClick={onAck}>{t("support-access-ack")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
