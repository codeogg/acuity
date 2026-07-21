// Clinics portfolio — the default operator working grid: saved-view count
// tabs (Needs attention / Provisioning / Active / Overdue payment / All),
// keyword + status filters, URL-driven sortable columns, multi-select bulk
// actions (re-tag / export / deactivate with dry-run + gates), and the
// clinic detail drawer over the grid (?open=<id>&facet=<facet>).

import { Suspense } from "react";
import { pickName } from "@acuity/i18n/names";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { BulkSelectionProvider, Button, type CountTab } from "@acuity/ui";
import { StatusBadge } from "@/components/ui/ui-client";
import { OpsGridBridge, type BridgeColumn, type BridgeRow } from "@/components/grid/ops-grid-bridge";
import Link from "next/link";
import { SectionTopBar } from "@/components/shell/section-top-bar";
import { FilterRow, KeywordSearch, UrlSelect } from "@/components/grid/filter-bar";
import { MetaBadge } from "@/components/ui/status-badge";
import { Empty } from "@/components/ui/empty";
import { AcuityIcon } from "@acuity/ui";
import { GridSkeleton } from "@/components/ui/skeletons";
import { ClinicsBulkBar } from "@/components/grid/bulk-bars";
import { ClinicDrawer } from "@/components/drawers/clinic-drawer";
import {
  CLINIC_TABS,
  clinicMatchesTab,
  CLINIC_BACKEND_SORT_KEYS,
  listClinicRows,
  sortClinicRows,
  type ClinicRow,
  type ClinicTab,
} from "@/lib/data";
import { activationStatus, clinicOpsStatus, paymentStatus } from "@/lib/status";
import { columnSort, parseSort } from "@/lib/table";
import { formatRelative } from "@acuity/i18n/format";

type Search = {
  tab?: string;
  keyword?: string;
  status?: string;
  sort?: string;
  open?: string;
  facet?: string;
  new?: string;
};

export default async function ClinicsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Search>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const sp = await searchParams;
  const t = await getTranslations("clinics");
  const tab: ClinicTab = (CLINIC_TABS as string[]).includes(sp.tab ?? "")
    ? (sp.tab as ClinicTab)
    : "needs-attention";

  const pathname = `/${locale}/clinics`;
  const urlParams = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) if (v) urlParams.set(k, v);

  const tabHref = (next: ClinicTab) => {
    const p = new URLSearchParams(urlParams);
    p.set("tab", next);
    p.delete("open");
    p.delete("facet");
    p.delete("new");
    return `${pathname}?${p.toString()}`;
  };

  return (
    <BulkSelectionProvider>
      <div className="flex h-full flex-col">
        <Suspense
          fallback={
            <>
              <SectionTopBar eyebrow={t("eyebrow")} title={t("title")} />
              <GridSkeleton />
            </>
          }
        >
          <ClinicsGrid locale={locale} sp={sp} tab={tab} tabHref={tabHref} pathname={pathname} urlParams={urlParams} />
        </Suspense>
      </div>
    </BulkSelectionProvider>
  );
}

async function ClinicsGrid({
  locale,
  sp,
  tab,
  tabHref,
  pathname,
  urlParams,
}: {
  locale: string;
  sp: Search;
  tab: ClinicTab;
  tabHref: (t: ClinicTab) => string;
  pathname: string;
  urlParams: URLSearchParams;
}) {
  const [t, tRoot, allRows] = await Promise.all([
    getTranslations("clinics"),
    getTranslations(),
    listClinicRows(
      sp.keyword,
      (() => {
        const parsed = parseSort(sp.sort);
        if (!parsed || !CLINIC_BACKEND_SORT_KEYS.has(parsed.key)) return undefined;
        return parsed.direction === "desc" ? `-${parsed.key}` : parsed.key;
      })(),
    ),
  ]);

  const counts = Object.fromEntries(
    CLINIC_TABS.map((tb) => [tb, allRows.filter((r) => clinicMatchesTab(r, tb)).length]),
  );
  let rows = allRows.filter((r) => clinicMatchesTab(r, tab));
  if (sp.status) rows = rows.filter((r) => r.ops.ops_status === sp.status);
  const sort = parseSort(sp.sort);
  const clientSortOnly = sort && !CLINIC_BACKEND_SORT_KEYS.has(sort.key);
  const applyNeedsFirst = !sort && (tab === "needs-attention" || tab === "all");
  rows = sortClinicRows(rows, clientSortOnly ? sort : null, applyNeedsFirst);

  const tabs: CountTab[] = CLINIC_TABS.map((tb) => ({
    key: tb,
    label: t(`tab.${tb}`),
    href: tabHref(tb),
    active: tb === tab,
    count: counts[tb],
    starred: tb === "needs-attention",
  }));

  const openHref = (r: ClinicRow) => {
    const p = new URLSearchParams(urlParams);
    p.set("open", String(r.clinic.id));
    p.set("facet", "overview");
    return `${pathname}?${p.toString()}`;
  };
  const colSort = (key: string) => columnSort(pathname, urlParams, key, sort);

  const columns: BridgeColumn[] = [
    { header: t("col.clinic"), sort: colSort("name") },
    { header: t("col.id"), width: "7rem", sort: colSort("code") },
    { header: t("col.status"), sort: colSort("status") },
    { header: t("col.doctors"), align: "right", width: "6rem", sort: colSort("doctors") },
    { header: t("col.last-activity"), width: "9rem", sort: colSort("last") },
    { header: t("col.activation") },
    { header: t("col.payment"), sort: colSort("payment") },
    { header: t("col.tags") },
  ];

  const gridRows: BridgeRow[] = rows.map((r) => ({
    key: String(r.clinic.id),
    href: openHref(r),
    selectId: String(r.clinic.id),
    selectLabel: t("select-row", { name: pickName(locale, r.clinic.clinic_name, r.clinic.clinic_name_en) }),
    cells: [
      <div key="name">
        <div className="font-medium text-foreground">{pickName(locale, r.clinic.clinic_name, r.clinic.clinic_name_en)}</div>
        <div className="text-xs text-muted-foreground">
          {locale.startsWith("zh") ? r.ops.district_zh : r.ops.district_en}
        </div>
      </div>,
      <span key="id" className="font-mono text-sm text-muted-foreground">
        {r.clinic.clinic_code}
      </span>,
      <MetaBadge
        key="status"
        meta={clinicOpsStatus(r.ops.ops_status)}
        label={tRoot(clinicOpsStatus(r.ops.ops_status).key)}
      />,
      <span key="doctors" className="tabular-nums">
        {r.doctor_count}
      </span>,
      <span key="last" className="text-muted-foreground">
        {formatRelative(r.ops.last_activity, locale, Date.now())}
      </span>,
      <MetaBadge
        key="activation"
        meta={activationStatus(r.ops.activation)}
        label={tRoot(activationStatus(r.ops.activation).key)}
      />,
      <MetaBadge key="payment" meta={paymentStatus(r.ops.payment)} label={tRoot(paymentStatus(r.ops.payment).key)} />,
      <div key="tags" className="flex gap-1">
        {[
          locale.startsWith("zh") ? r.ops.district_zh : r.ops.district_en,
          tRoot(`clinic-drawer.account.plan-${r.ops.plan}`),
        ].map((tag) => (
          <StatusBadge key={tag} tone="info" appearance="outline" label={tag} />
        ))}
      </div>,
    ],
  }));

  const filtered = Boolean(sp.keyword || sp.status);
  const newHref = () => {
    const p = new URLSearchParams(urlParams);
    p.set("new", "1");
    return `${pathname}?${p.toString()}`;
  };

  const openId = sp.open ? Number(sp.open) : null;

  return (
    <>
      <SectionTopBar
        eyebrow={t("eyebrow")}
        title={t("title")}
        grid="clinics"
        tabs={tabs}
        action={
          <Button asChild>
            <Link href={newHref()} replace scroll={false}>
              <AcuityIcon name="plus" size={18} />
              {t("new")}
            </Link>
          </Button>
        }
        filterRow={
          <FilterRow>
            <KeywordSearch placeholder={t("search-placeholder")} />
            <UrlSelect
              param="status"
              label={t("status-filter")}
              allLabel={t("status-all")}
              options={["active", "onboarding", "provisioning", "needs-attention"].map((v) => ({
                value: v,
                label: tRoot(clinicOpsStatus(v).key),
              }))}
            />
          </FilterRow>
        }
      />
      <div className="slim-scroll min-h-0 flex-1 overflow-y-auto pb-6">
        {rows.length === 0 ? (
          <Empty
            icon="clinic"
            title={filtered ? t("empty.filtered-title") : t("empty.title")}
            description={filtered ? t("empty.filtered-description") : t("empty.description")}
            action={
              filtered ? undefined : (
                <Button asChild>
                  <Link href={newHref()} replace scroll={false}>
                    <AcuityIcon name="plus" size={18} />
                    {t("new")}
                  </Link>
                </Button>
              )
            }
          />
        ) : (
          <OpsGridBridge
            columns={columns}
            rows={gridRows}
            caption={t("title")}
            openLabel={t("open")}
            selectAllLabel={t("select-all")}
          />
        )}
        <ClinicsBulkBar
          rows={rows.map((r) => ({
            id: r.clinic.id,
            code: r.clinic.clinic_code,
            name: pickName(locale, r.clinic.clinic_name, r.clinic.clinic_name_en),
          }))}
        />
      </div>
      {openId != null || sp.new ? (
        <ClinicDrawer
          locale={locale}
          clinicId={openId}
          facet={sp.facet ?? "overview"}
          isNew={Boolean(sp.new)}
          searchParams={urlParams}
        />
      ) : null}
    </>
  );
}
