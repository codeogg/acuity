// Standard fields — the canonical field dictionary the field-map editor binds
// against (contract-real; placement relative to the reference IA is an open
// product decision).

import { Suspense } from "react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { StatusBadge } from "@/components/ui/ui-client";
import { OpsGridBridge, type BridgeColumn, type BridgeRow } from "@/components/grid/ops-grid-bridge";
import { SectionTopBar } from "@/components/shell/section-top-bar";
import { MetaBadge } from "@/components/ui/status-badge";
import { Empty } from "@/components/ui/empty";
import { GridSkeleton } from "@/components/ui/skeletons";
import { listDomains, listStandardFields } from "@/lib/data";

export default async function StandardFieldsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("standard-fields");

  return (
    <div className="flex h-full flex-col">
      <Suspense
        fallback={
          <>
            <SectionTopBar eyebrow={t("eyebrow")} title={t("title")} />
            <GridSkeleton cols={5} />
          </>
        }
      >
        <StandardFieldsGrid locale={locale} />
      </Suspense>
    </div>
  );
}

async function StandardFieldsGrid({ locale }: { locale: string }) {
  const [t, fields, domains] = await Promise.all([
    getTranslations("standard-fields"),
    listStandardFields(),
    listDomains(),
  ]);
  const domainName = (id: number) => domains.find((d) => d.id === id)?.domain_name ?? `#${id}`;
  const zh = locale.startsWith("zh");

  const columns: BridgeColumn[] = [
    { header: t("col.code") },
    { header: t("col.name") },
    { header: t("col.domain") },
    { header: t("col.type"), width: "8rem" },
    { header: t("col.required"), width: "8rem" },
  ];
  const gridRows: BridgeRow[] = fields.map((r) => ({
    key: String(r.id),
    cells: [
      <span key="code" className="font-mono text-sm">
        {r.field_code}
      </span>,
      <span key="name">{zh ? r.field_name : (r.field_name_en ?? r.field_name)}</span>,
      <StatusBadge key="domain" tone="info" appearance="outline" label={domainName(r.domain_id)} />,
      <span key="type" className="font-mono text-xs">
        {r.data_type}
      </span>,
      r.is_required ? (
        <MetaBadge key="req" meta={{ tone: "warning", icon: "alert", key: "" }} label={t("required")} />
      ) : (
        <span key="req" className="text-muted-foreground">
          {t("optional")}
        </span>
      ),
    ],
  }));

  return (
    <>
      <SectionTopBar eyebrow={t("eyebrow")} title={t("title")} />
      <div className="slim-scroll min-h-0 flex-1 overflow-y-auto pb-6 pt-2">
        {fields.length === 0 ? (
          <Empty icon="field" title={t("empty.title")} description={t("empty.description")} />
        ) : (
          <OpsGridBridge columns={columns} rows={gridRows} caption={t("title")} />
        )}
      </div>
    </>
  );
}
