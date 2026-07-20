"use client";

import { Link } from "@acuity/i18n/navigation";
import { useTranslations } from "next-intl";
import { Button, SearchIcon } from "@acuity/ui";
import { EmptyPanel } from "@/components/ui/states";

// The designed tenant-not-found state (matrix 5.7): cross-clinic access reads
// as not-found (never forbidden), with calm copy and a route home — raw
// backend envelope messages are never surfaced.

export function ClaimNotFound() {
  const t = useTranslations("errors");
  return (
    <EmptyPanel
      icon={<SearchIcon size={40} />}
      title={t("claim-not-found-title")}
      description={t("claim-not-found-body")}
      action={
        <Button asChild variant="outline">
          <Link href="/">{t("claim-not-found-action")}</Link>
        </Button>
      }
    />
  );
}
