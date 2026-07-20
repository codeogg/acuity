// Insurers — contract-real insurance-company registry (a contract addition to
// the reference IA; the reference models insurers as tag children — placement
// is an open product decision). Read grid + create + status wiring.

import { Suspense } from "react";
import { pickName } from "@acuity/i18n/names";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { OpsGridBridge, type BridgeColumn, type BridgeRow } from "@/components/grid/ops-grid-bridge";
import { SectionTopBar } from "@/components/shell/section-top-bar";
import { FilterRow, KeywordSearch } from "@/components/grid/filter-bar";
import { MetaBadge } from "@/components/ui/status-badge";
import { Empty } from "@/components/ui/empty";
import { GridSkeleton } from "@/components/ui/skeletons";
import { PaginationBar } from "@/components/grid/pagination-bar";
import { NewInsurerButton } from "@/components/drawers/new-insurer-button";
import { listCompanies } from "@/lib/data";
import { enabledStatus } from "@/lib/status";

type Search = { keyword?: string; page?: string };

export default async function InsurersPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Search>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const sp = await searchParams;
  const t = await getTranslations("insurers");

  return (
    <div className="flex h-full flex-col">
      <Suspense
        fallback={
          <>
            <SectionTopBar eyebrow={t("eyebrow")} title={t("title")} />
            <GridSkeleton cols={4} />
          </>
        }
      >
        <InsurersGrid locale={locale} sp={sp} />
      </Suspense>
    </div>
  );
}

async function InsurersGrid({ locale, sp }: { locale: string; sp: Search }) {
  const page = Math.max(1, Number(sp.page) || 1);
  const [t, tRoot, result] = await Promise.all([
    getTranslations("insurers"),
    getTranslations(),
    listCompanies({ keyword: sp.keyword, page }),
  ]);

  const columns: BridgeColumn[] = [
    { header: t("col.name") },
    { header: t("col.contact") },
    { header: t("col.status") },
  ];
  const gridRows: BridgeRow[] = result.items.map((r) => ({
    key: String(r.id),
    href: `/${locale}/insurers/${r.id}`,
    cells: [
      <div key="name" className="flex min-w-0 items-center gap-3">
        {r.logo_url ? (
          <img
            src={r.logo_url}
            alt=""
            className="size-9 shrink-0 rounded-lg border border-border bg-background object-contain p-1"
          />
        ) : (
          <div
            aria-hidden
            className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-border bg-muted font-mono text-xs font-medium text-muted-foreground"
          >
            {pickName(locale, r.company_name, r.company_name_en).slice(0, 1)}
          </div>
        )}
        <div className="min-w-0">
          <div className="truncate font-medium text-foreground">
            {pickName(locale, r.company_name, r.company_name_en)}
          </div>
          <div className="font-mono text-xs text-muted-foreground">{r.company_code}</div>
        </div>
      </div>,
      <span key="contact" className="text-muted-foreground">
        {r.contact_info ?? "—"}
      </span>,
      <MetaBadge key="status" meta={enabledStatus(r.status)} label={tRoot(enabledStatus(r.status).key)} />,
    ],
  }));

  return (
    <>
      <SectionTopBar
        eyebrow={t("eyebrow")}
        title={t("title")}
        action={<NewInsurerButton />}
        filterRow={
          <FilterRow>
            <KeywordSearch placeholder={t("search-placeholder")} />
          </FilterRow>
        }
      />
      <div className="slim-scroll min-h-0 flex-1 overflow-y-auto pb-6 pt-2">
        {result.items.length === 0 ? (
          <Empty
            icon="shield-check"
            title={sp.keyword ? t("empty.filtered-title") : t("empty.title")}
            description={t("empty.description")}
          />
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
