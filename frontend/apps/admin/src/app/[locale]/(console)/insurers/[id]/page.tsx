// Insurer detail — company record + its templates, with status wiring.

import Link from "next/link";
import { pickName } from "@acuity/i18n/names";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ApiError } from "@acuity/api-client";
import { SectionTopBar } from "@/components/shell/section-top-bar";
import { KeyVal, FacetSection } from "@/components/ui/detail";
import { MetaBadge } from "@/components/ui/status-badge";
import { AcuityIcon } from "@acuity/ui";
import { ActionButton } from "@/components/ui/action-button";
import { EditInsurerButton } from "@/components/drawers/edit-insurer-button";
import { setCompanyStatusAction } from "@/lib/actions";
import { getCompany, listTemplateRows } from "@/lib/data";
import { enabledStatus, templateOpsStatusMeta } from "@/lib/status";

export default async function InsurerDetailPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("insurer-detail");
  const tRoot = await getTranslations();

  let company;
  try {
    company = await getCompany(Number(id));
  } catch (err) {
    if (err instanceof ApiError && err.kind === "not_found") notFound();
    throw err;
  }
  const templates = (await listTemplateRows()).filter((r) => r.template.company_id === company.id);

  return (
    <div className="flex h-full flex-col">
      <SectionTopBar eyebrow={`${t("eyebrow")} · ${company.company_code}`} title={pickName(locale, company.company_name, company.company_name_en)} />
      <div className="slim-scroll min-h-0 flex-1 overflow-y-auto px-6 py-6">
        <Link
          href={`/${locale}/insurers`}
          className="-my-1 mb-3 inline-flex items-center gap-1 py-1 text-sm text-muted-foreground transition-colors hover:text-primary"
        >
          <AcuityIcon name="arrow-left" size={14} />
          {t("back")}
        </Link>
        <div className="grid max-w-5xl grid-cols-1 gap-6 lg:grid-cols-2">
          <section className="rounded-lg border border-border bg-card p-6">
            <FacetSection title={t("record")}>
              {company.logo_url ? (
                <img
                  src={company.logo_url}
                  alt={pickName(locale, company.company_name, company.company_name_en)}
                  className="mb-4 h-16 w-28 rounded-lg border border-border bg-background object-contain p-2"
                />
              ) : null}
              <KeyVal label={t("name-zh")}>{company.company_name}</KeyVal>
              <KeyVal label={t("name-en")}>{company.company_name_en ?? "—"}</KeyVal>
              <KeyVal label={t("contact")}>{company.contact_info ?? "—"}</KeyVal>
              <KeyVal label={t("status")}>
                <MetaBadge meta={enabledStatus(company.status)} label={tRoot(enabledStatus(company.status).key)} />
              </KeyVal>
            </FacetSection>
            <div className="flex flex-wrap gap-2">
              {company.status === 1 ? <EditInsurerButton company={company} /> : null}
              <ActionButton
                label={company.status === 1 ? t("disable") : t("enable")}
                icon={company.status === 1 ? "dash" : "check"}
                action={setCompanyStatusAction.bind(null, company.id, company.status === 1 ? 0 : 1)}
                successMessage={t("status-updated")}
              />
            </div>
          </section>
          <section className="rounded-lg border border-border bg-card p-6">
            <FacetSection title={t("templates", { count: templates.length })}>
              {templates.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("no-templates")}</p>
              ) : (
                templates.map((r) => (
                  <div key={r.template.id} className="flex items-center gap-3 border-b border-border py-2.5 last:border-0">
                    <Link
                      href={`/${locale}/forms/${r.template.id}`}
                      className="-my-1 flex flex-1 items-center py-1 text-sm text-foreground hover:text-primary"
                    >
                      {r.template.template_name}
                    </Link>
                    <span className="font-mono text-xs text-muted-foreground">{r.template.version}</span>
                    <MetaBadge
                      meta={templateOpsStatusMeta(r.ops_status)}
                      label={tRoot(templateOpsStatusMeta(r.ops_status).key)}
                    />
                  </div>
                ))
              )}
            </FacetSection>
          </section>
        </div>
      </div>
    </div>
  );
}
