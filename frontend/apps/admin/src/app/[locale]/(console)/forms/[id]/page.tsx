// Annotate route — three-column workspace ported from
// backend/apps/web/admin/templates/[id]/annotate, styled with the admin console.

import Link from "next/link";
import { pickName } from "@acuity/i18n/names";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ApiError } from "@acuity/api-client";
import { StatusBadge } from "@/components/ui/ui-client";
import { AcuityIcon } from "@acuity/ui";
import { MetaBadge } from "@/components/ui/status-badge";
import { AnnotateWorkspace } from "./annotate-workspace";
import { getTemplate, listCompanies, listStandardFields, listTemplateFields } from "@/lib/data";
import { templateOpsStatus } from "@/lib/ops-model";
import { templateOpsStatusMeta } from "@/lib/status";

export default async function AnnotatePage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("editor");
  const tRoot = await getTranslations();
  const templateId = Number(id);
  if (!Number.isFinite(templateId)) notFound();

  let template;
  try {
    template = await getTemplate(templateId);
  } catch (err) {
    if (err instanceof ApiError && err.kind === "not_found") notFound();
    throw err;
  }

  const [fields, standardFields, companiesPage] = await Promise.all([
    listTemplateFields(templateId).catch(() => []),
    listStandardFields(),
    listCompanies({ page_size: 100 }),
  ]);
  const opsStatus = templateOpsStatus(template);
  const reversion = opsStatus === "confirmed" || opsStatus === "archived";
  const company = companiesPage.items.find((c) => c.id === template.company_id);
  const statusMeta = templateOpsStatusMeta(opsStatus);

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center gap-4 border-b border-border px-6 py-4">
        <Link
          href={`/${locale}/forms?tab=${reversion ? "library" : "intake"}`}
          aria-label={t("back")}
          className="inline-flex size-10 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-primary"
        >
          <AcuityIcon name="arrow-left" size={20} />
        </Link>
        <div className="min-w-0 flex-1">
          <div className="font-mono text-xs font-medium uppercase tracking-eyebrow text-muted-foreground">
            {t("eyebrow")} · {template.template_code}
          </div>
          <h1 className="truncate font-title text-2xl font-semibold leading-tight text-foreground">
            {template.template_name}
          </h1>
        </div>
        <div className="hidden shrink-0 items-center gap-4 md:flex">
          {company ? (
            <StatusBadge
              tone="info"
              appearance="outline"
              label={pickName(locale, company.company_name, company.company_name_en)}
            />
          ) : null}
          <StatusBadge
            tone="neutral"
            appearance="outline"
            label={template.version}
            icon={<AcuityIcon name="layers" size={13} />}
          />
        </div>
        <MetaBadge meta={statusMeta} label={tRoot(statusMeta.key)} />
      </div>
      <AnnotateWorkspace
        template={{
          id: template.id,
          code: template.template_code,
          name: template.template_name,
          version: template.version,
          page_count: Math.max(template.page_count || 1, 1),
          insurer: pickName(locale, company?.company_name, company?.company_name_en),
          pdf_url: template.original_pdf_url,
        }}
        initialFields={fields}
        standardFields={standardFields.map((f) => ({
          id: f.id,
          field_code: f.field_code,
          field_name: locale.startsWith("zh") ? f.field_name : (f.field_name_en ?? f.field_name),
          data_type: f.data_type,
          is_required: f.is_required,
        }))}
      />
    </div>
  );
}
