// Localized not-found body — including the tenant-isolation case, where the
// backend returns 404 (not 403) for cross-tenant access, so a missing record
// and a cross-tenant record are indistinguishable by design. Server component.

import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { EmptyState } from "@acuity/ui";
import { AcuityIcon } from "@acuity/ui";

export async function NotFoundState({
  titleKey,
  descriptionKey,
  backHref,
  backLabelKey,
}: {
  titleKey: string;
  descriptionKey: string;
  backHref: string;
  backLabelKey: string;
}) {
  const t = await getTranslations("not-found");
  return (
    <div className="p-6">
      <EmptyState icon={<AcuityIcon name="search" size={28} />} title={t(titleKey)} description={t(descriptionKey)} />
      <div className="mt-6 flex justify-center">
        <Link
          href={backHref}
          className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-4 py-2 text-sm font-medium text-primary transition-colors hover:bg-accent"
        >
          <AcuityIcon name="arrow-left" size={14} />
          {t(backLabelKey)}
        </Link>
      </div>
    </div>
  );
}
