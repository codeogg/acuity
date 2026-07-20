"use client";

// Locale-level 404: unmatched paths inside a valid locale segment render
// localised (via the [...rest] catch-all) with a route back to the workspace.

import { Link } from "@acuity/i18n/navigation";
import { useTranslations } from "next-intl";
import { Button, SearchIcon } from "@acuity/ui";
import { EmptyPanel } from "@/components/ui/states";

export default function NotFound() {
  const t = useTranslations("not-found");
  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <EmptyPanel
        icon={<SearchIcon size={40} />}
        title={t("title")}
        description={t("body")}
        action={
          <Button asChild variant="outline">
            <Link href="/">{t("action")}</Link>
          </Button>
        }
      />
    </main>
  );
}
