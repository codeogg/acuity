"use client";

import { useTranslations } from "next-intl";
import { Button, ShieldIcon } from "@acuity/ui";

// The PHI idle-lock overlay (system-overlays.md): a calm high-opacity surface
// veil covering visible PHI after the configured idle threshold. Unlock
// confirms session validity without re-authenticating (passkey-styled, never
// PIN-recall-only). The platform session stays alive; only the surface locks.

export function IdleLock({ onUnlock }: { onUnlock: () => void }) {
  const t = useTranslations("system");
  return (
    <div className="fixed inset-0 z-(--z-overlay) flex items-center justify-center bg-background/95 backdrop-blur-sm">
      <div className="max-w-96 px-6 text-center">
        <div className="mx-auto mb-5 flex size-14 items-center justify-center rounded-full border border-border bg-muted">
          <ShieldIcon size={26} className="text-primary" aria-hidden />
        </div>
        <h2 className="font-title text-2xl font-semibold text-foreground">
          {t("idle-lock-title")}
        </h2>
        <p className="mt-2.5 text-base text-muted-foreground">{t("idle-lock-body")}</p>
        <Button className="mt-6" onClick={onUnlock}>
          <ShieldIcon size={18} aria-hidden />
          {t("idle-lock-unlock")}
        </Button>
      </div>
    </div>
  );
}
