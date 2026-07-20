// Claims oversight — admin-scoped, PHI-redacted portfolio over the claims
// store (backend gap: the console never rides doctor-scoped routes). Patient
// identity is withheld at list level; the detail's final field values render
// masked with an explicit, audited reveal.

import { Suspense } from "react";
import type { ClaimStatus } from "@acuity/types";
import { pickName } from "@acuity/i18n/names";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { OpsGridBridge, type BridgeColumn, type BridgeRow } from "@/components/grid/ops-grid-bridge";
import { SectionTopBar } from "@/components/shell/section-top-bar";
import { FilterRow, UrlSelect } from "@/components/grid/filter-bar";
import { MetaBadge } from "@/components/ui/status-badge";
import { Empty } from "@/components/ui/empty";
import { GridSkeleton } from "@/components/ui/skeletons";
import { PaginationBar } from "@/components/grid/pagination-bar";
import { listClaimsOversight, listCompanies } from "@/lib/data";
import { claimStatus, CLAIM_STATUS } from "@/lib/status";
import { formatDateTime } from "@acuity/i18n/format";

type Search = { status?: string; page?: string };

export default async function ClaimsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Search>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const sp = await searchParams;
  const t = await getTranslations("claims");

  return (
    <div className="flex h-full flex-col">
      <Suspense
        fallback={
          <>
            <SectionTopBar eyebrow={t("eyebrow")} title={t("title")} />
            <GridSkeleton cols={6} />
          </>
        }
      >
        <ClaimsGrid locale={locale} sp={sp} />
      </Suspense>
    </div>
  );
}

async function ClaimsGrid({ locale, sp }: { locale: string; sp: Search }) {
  const page = Math.max(1, Number(sp.page) || 1);
  // URL param → closed contract enum; unknown values fall back to unfiltered.
  const status =
    sp.status && sp.status in CLAIM_STATUS ? (sp.status as ClaimStatus) : undefined;
  const [t, tRoot, result, companiesPage] = await Promise.all([
    getTranslations("claims"),
    getTranslations(),
    listClaimsOversight({ status, page }),
    listCompanies({ page_size: 100 }),
  ]);

  const companyName = (id: number) => {
    const c = companiesPage.items.find((x) => x.id === id);
    return c ? pickName(locale, c.company_name, c.company_name_en) : `#${id}`;
  };

  const columns: BridgeColumn[] = [
    { header: t("col.submission") },
    { header: t("col.patient") },
    { header: t("col.insurer") },
    { header: t("col.status") },
    { header: t("col.created"), width: "12rem" },
  ];
  const gridRows: BridgeRow[] = result.items.map((r) => ({
    key: String(r.id),
    href: `/${locale}/claims/${r.id}`,
    cells: [
      <span key="sub" className="font-mono text-sm">
        {r.submission_no}
      </span>,
      <span key="patient" className="text-muted-foreground">
        {t("patient-redacted")}
      </span>,
      <span key="insurer">{companyName(r.company_id)}</span>,
      <MetaBadge key="status" meta={claimStatus(r.status)} label={tRoot(claimStatus(r.status).key)} />,
      <span key="created" className="text-muted-foreground">
        {formatDateTime(r.created_at, locale)}
      </span>,
    ],
  }));

  return (
    <>
      <SectionTopBar
        eyebrow={t("eyebrow")}
        title={t("title")}
        filterRow={
          <FilterRow>
            <UrlSelect
              param="status"
              label={t("status-filter")}
              allLabel={t("status-all")}
              options={Object.entries(CLAIM_STATUS).map(([code, meta]) => ({
                value: code,
                label: tRoot(meta.key),
              }))}
            />
          </FilterRow>
        }
      />
      <div className="slim-scroll min-h-0 flex-1 overflow-y-auto pb-6 pt-2">
        {result.items.length === 0 ? (
          <Empty icon="claim" title={t("empty.title")} description={t("empty.description")} />
        ) : (
          <>
            <OpsGridBridge columns={columns} rows={gridRows} caption={t("title")} openLabel={t("open")} />
            <PaginationBar page={result.page} pageSize={result.page_size} total={result.total} />
          </>
        )}
      </div>
    </>
  );
}
