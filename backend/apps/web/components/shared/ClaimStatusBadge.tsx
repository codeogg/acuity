"use client";

import { Badge } from "@/components/ui/badge";
import type { ClaimStatus } from "@/lib/api/types";
import { useI18n } from "@/lib/i18n/I18nProvider";

const MAP: Record<
  ClaimStatus,
  { key: string; variant: "default" | "secondary" | "success" | "warning" | "destructive" }
> = {
  DRAFT: { key: "claim.status.DRAFT", variant: "secondary" },
  AI_FILLED: { key: "claim.status.AI_FILLED", variant: "warning" },
  CONFIRMED: { key: "claim.status.CONFIRMED", variant: "default" },
  PRINTED: { key: "claim.status.PRINTED", variant: "success" },
  CANCELLED: { key: "claim.status.CANCELLED", variant: "destructive" },
};

export function ClaimStatusBadge({ status }: { status: ClaimStatus }) {
  const { t } = useI18n();
  const m = MAP[status];
  return <Badge variant={m.variant}>{t(m.key)}</Badge>;
}
