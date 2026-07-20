// Confirmation field-map editor route (the keystone surface) — the split-pane
// editor over a processed template: original PDF with detected-field overlays
// on the left, the editable field map on the right, publish/archive in the
// action footer. Full-width managed exception to the drawer pattern; the
// active nav destination stays Forms.

import Link from "next/link";
import { pickName } from "@acuity/i18n/names";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ApiError } from "@acuity/api-client";
import { StatusBadge } from "@/components/ui/ui-client";
import { AcuityIcon } from "@acuity/ui";
import { MetaBadge } from "@/components/ui/status-badge";
import { FieldMapEditor } from "./field-map-editor";
import { getTemplate, listCompanies, listStandardFields, listTags, listTemplateFields } from "@/lib/data";
import { templateOps, templateOpsStatus } from "@/lib/ops-model";
import { templateOpsStatusMeta } from "@/lib/status";

export default async function FieldMapEditorPage({
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

  const [fields, standardFields, companiesPage, typeTags] = await Promise.all([
    listTemplateFields(templateId).catch(() => []),
    listStandardFields(),
    listCompanies({ page_size: 100 }),
    listTags("type"),
  ]);
  const ops = templateOps(template);
  const opsStatus = templateOpsStatus(template);
  const reversion = opsStatus === "confirmed" || opsStatus === "archived";
  const company = companiesPage.items.find((c) => c.id === template.company_id);
  const typeTag = typeTags.find((x) => x.id === ops.type_tag_id);
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
        {/* Metadata badges yield below md so the back + title + status row
            never overflows a phone viewport; insurer and type stay readable
            inside the editor's field panel. */}
        <div className="hidden shrink-0 items-center gap-4 md:flex">
          {company ? (
            <StatusBadge tone="info" appearance="outline" label={pickName(locale, company.company_name, company.company_name_en)} />
          ) : null}
          {typeTag ? (
            <StatusBadge
              tone="accent"
              appearance="outline"
              label={locale.startsWith("zh") ? typeTag.label_zh : typeTag.label_en}
            />
          ) : null}
          <StatusBadge tone="neutral" appearance="outline" label={template.version} icon={<AcuityIcon name="layers" size={13} />} />
        </div>
        <MetaBadge meta={statusMeta} label={tRoot(statusMeta.key)} />
      </div>
      <FieldMapEditor
        template={{
          id: template.id,
          code: template.template_code,
          name: template.template_name,
          version: template.version,
          page_count: template.page_count,
          page_width: template.page_width ?? 595,
          page_height: template.page_height ?? 842,
          insurer: pickName(locale, company?.company_name, company?.company_name_en),
          type_label: typeTag ? (locale.startsWith("zh") ? typeTag.label_zh : typeTag.label_en) : "",
        }}
        initialFields={fields}
        standardFields={standardFields.map((f) => ({
          id: f.id,
          label: locale.startsWith("zh") ? f.field_name : (f.field_name_en ?? f.field_code),
          code: f.field_code,
        }))}
        conflicts={ops.field_conflicts}
        usageCount={ops.usage_count}
        reversion={reversion}
      />
    </div>
  );
}
