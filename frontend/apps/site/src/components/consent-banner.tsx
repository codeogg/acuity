"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@acuity/ui";
import { usePathname } from "@/i18n/navigation";

const STORAGE_KEY = "acuity_consent";
// The Security and Contact pages are cookie-less by design — no prompt there.
const COOKIE_LESS = ["/security", "/contact"];

// Honest cookie-consent prompt (reference site.js maybeConsent()): minimal
// analytics on marketing pages only, accept/decline both remembered locally.
// The privacy page's "limited, consented analytics" copy depends on this
// mechanism existing.
export function ConsentBanner() {
  const t = useTranslations("consent");
  const pathname = usePathname();
  const [show, setShow] = useState(false);

  const suppressed = COOKIE_LESS.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );

  useEffect(() => {
    if (suppressed) return;
    if (localStorage.getItem(STORAGE_KEY)) return;
    setShow(true);
  }, [suppressed]);

  if (!show || suppressed) return null;

  function decide(value: "accept" | "decline") {
    localStorage.setItem(STORAGE_KEY, value);
    setShow(false);
  }

  return (
    <div
      role="dialog"
      aria-label={t("aria-label")}
      className="fixed bottom-4 left-4 right-4 z-(--z-toast) max-w-120 rounded-md border border-border bg-card p-6 shadow-md"
    >
      <p className="text-sm text-ink-muted">{t("body")}</p>
      <div className="mt-4 flex flex-wrap gap-3">
        <Button className="h-11 gap-2 px-4 text-sm" onClick={() => decide("accept")}>
          {t("accept")}
        </Button>
        <Button
          variant="outline"
          className="h-11 gap-2 px-4 text-sm text-navy hover:border-border-strong hover:bg-accent hover:text-navy"
          onClick={() => decide("decline")}
        >
          {t("decline")}
        </Button>
      </div>
    </div>
  );
}
