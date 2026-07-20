// Claim oversight detail — PHI discipline at console level: patient identity
// and AI raw output are withheld by the admin-scoped read, and the final
// field values render MASKED; revealing them is an explicit, audited action.

import Link from "next/link";
import { pickName } from "@acuity/i18n/names";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ApiError } from "@acuity/api-client";
import { SectionTopBar } from "@/components/shell/section-top-bar";
import { MetaBadge } from "@/components/ui/status-badge";
import { KeyVal, FacetSection } from "@/components/ui/detail";
import { AcuityIcon } from "@acuity/ui";
import { MaskedFieldValues } from "@/components/ui/masked-field-values";
import { getClaimOversight, getClinic, listCompanies } from "@/lib/data";
import { claimStatus } from "@/lib/status";
import { formatDateTime } from "@acuity/i18n/format";

export default async function ClaimDetailPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("claim-detail");
  const tRoot = await getTranslations();

  let claim;
  try {
    claim = await getClaimOversight(Number(id));
  } catch (err) {
    if (err instanceof ApiError && err.kind === "not_found") notFound();
    throw err;
  }

  const [clinic, companiesPage] = await Promise.all([
    getClinic(claim.clinic_id).catch(() => null),
    listCompanies({ page_size: 100 }),
  ]);
  const company = companiesPage.items.find((c) => c.id === claim.company_id);
  const meta = claimStatus(claim.status);

  return (
    <div className="flex h-full flex-col">
      <SectionTopBar eyebrow={`${t("eyebrow")} · ${claim.submission_no}`} title={t("title")} />
      <div className="slim-scroll min-h-0 flex-1 overflow-y-auto px-6 py-6">
        <Link
          href={`/${locale}/claims`}
          className="-my-1 mb-3 inline-flex items-center gap-1 py-1 text-sm text-muted-foreground transition-colors hover:text-primary"
        >
          <AcuityIcon name="arrow-left" size={14} />
          {t("back")}
        </Link>
        <div className="grid max-w-5xl grid-cols-1 gap-6 lg:grid-cols-2">
          <section className="rounded-lg border border-border bg-card p-6">
            <FacetSection title={t("record")}>
              <KeyVal label={t("submission")}>
                <span className="font-mono">{claim.submission_no}</span>
              </KeyVal>
              <KeyVal label={t("status")}>
                <MetaBadge meta={meta} label={tRoot(meta.key)} />
              </KeyVal>
              <KeyVal label={t("clinic")}>
                {clinic ? pickName(locale, clinic.clinic_name, clinic.clinic_name_en) : `#${claim.clinic_id}`}
              </KeyVal>
              <KeyVal label={t("insurer")}>
                {company ? pickName(locale, company.company_name, company.company_name_en) : `#${claim.company_id}`}
              </KeyVal>
              <KeyVal label={t("template")}>
                <span className="font-mono">
                  #{claim.template_id} {claim.template_version ?? ""}
                </span>
              </KeyVal>
              <KeyVal label={t("created")}>{formatDateTime(claim.created_at, locale)}</KeyVal>
              <KeyVal label={t("patient")}>
                <span className="text-muted-foreground">{t("patient-redacted")}</span>
              </KeyVal>
            </FacetSection>
          </section>
          <section className="rounded-lg border border-border bg-card p-6">
            <MaskedFieldValues
              submissionNo={claim.submission_no}
              values={(claim.final_field_values ?? {}) as Record<string, unknown>}
            />
          </section>
        </div>
      </div>
    </div>
  );
}
