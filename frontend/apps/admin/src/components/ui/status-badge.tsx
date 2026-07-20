"use client";

// Status badge adapter — resolves a StatusMeta (tone + icon + i18n key) onto
// the shared StatusBadge (tint ground + tone glyph + ink label; colour never
// the sole channel). The label arrives already translated by the caller.

import { StatusBadge } from "@acuity/ui";
import { AcuityIcon } from "@acuity/ui";
import type { StatusMeta } from "@/lib/status";

export function MetaBadge({ meta, label, className }: { meta: StatusMeta; label: string; className?: string }) {
  return (
    <StatusBadge
      tone={meta.tone}
      label={label}
      icon={<AcuityIcon name={meta.icon} size={13} />}
      className={className}
    />
  );
}
