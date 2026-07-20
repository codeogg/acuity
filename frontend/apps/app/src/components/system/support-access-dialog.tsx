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

// The proactive support-access transparency notice (system-overlays.md, PDPO
// DPP6 / UK GDPR): "your session was accessed by Acuity support on <date>
// for <reason>", acknowledged with a single OK.

export function SupportAccessDialog({
  accessedAt,
  onAck,
}: {
  accessedAt: string;
  onAck: () => void;
}) {
  const t = useTranslations("system");
  const locale = useLocale() as Locale;
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
              when: formatDateTime(accessedAt, locale, { timeZone: "Asia/Hong_Kong" }),
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
