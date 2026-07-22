"use client";

// Compact star toggle for clinic "needs attention" — sits beside the drawer
// title so flagging stays one click, without the confirm-gate chrome.

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { AcuityIcon, cn, useToast } from "@acuity/ui";
import { setClinicFlagAction } from "@/lib/actions";

export function ClinicFlagStar({
  clinicId,
  code,
  flagged,
}: {
  clinicId: number;
  code: string;
  flagged: boolean;
}) {
  const t = useTranslations("clinic-drawer");
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const { showToast } = useToast();

  function toggle() {
    startTransition(async () => {
      const result = await setClinicFlagAction(clinicId, !flagged, code);
      if (result.ok) {
        showToast(flagged ? t("unflag-done") : t("flag-done"));
        router.refresh();
      } else {
        showToast(result.message, "error");
      }
    });
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={pending}
      aria-pressed={flagged}
      aria-label={flagged ? t("unflag") : t("flag")}
      title={flagged ? t("unflag") : t("flag")}
      className={cn(
        "inline-flex size-8 shrink-0 items-center justify-center rounded-md transition-colors",
        "hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        "disabled:pointer-events-none disabled:opacity-50",
        flagged ? "text-tone-warning-glyph" : "text-muted-foreground hover:text-foreground",
      )}
    >
      <AcuityIcon
        name="star"
        size={18}
        className={flagged ? "fill-current" : undefined}
        strokeWidth={flagged ? 0 : 1.5}
      />
    </button>
  );
}
