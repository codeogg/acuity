// Doctors portfolio — cross-clinic grid: saved-view tabs (Active / All),
// keyword + clinic filters, URL-driven sort, bulk re-tag / deactivate, and
// the doctor detail drawer over the grid.

import { Suspense } from "react";
import { pickName } from "@acuity/i18n/names";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { BulkSelectionProvider, type CountTab } from "@acuity/ui";
import { StatusBadge } from "@/components/ui/ui-client";
import { OpsGridBridge, type BridgeColumn, type BridgeRow } from "@/components/grid/ops-grid-bridge";
import { SectionTopBar } from "@/components/shell/section-top-bar";
import { FilterRow, KeywordSearch, UrlSelect } from "@/components/grid/filter-bar";
import { MetaBadge } from "@/components/ui/status-badge";
import { Empty } from "@/components/ui/empty";
import { GridSkeleton } from "@/components/ui/skeletons";
import { DoctorsBulkBar } from "@/components/grid/bulk-bars";
import { DoctorDrawer } from "@/components/drawers/doctor-drawer";
import { NewDoctorButton } from "@/components/drawers/new-doctor-button";
import {
  DOCTOR_TABS,
  doctorMatchesTab,
  listClinicRows,
  listDoctorRows,
  sortDoctorRows,
  type DoctorLinked,
  type DoctorRow,
  type DoctorTab,
} from "@/lib/data";
import { activationStatus } from "@/lib/status";
import { columnSort, parseSort } from "@/lib/table";
import { formatRelative } from "@acuity/i18n/format";

type Search = {
  tab?: string;
  keyword?: string;
  clinic?: string;
  linked?: string;
  sort?: string;
  open?: string;
  facet?: string;
};

export default async function DoctorsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Search>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const sp = await searchParams;
  const t = await getTranslations("doctors");

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
          <DoctorsGrid locale={locale} sp={sp} />
        </Suspense>
      </div>
    </BulkSelectionProvider>
  );
}

async function DoctorsGrid({ locale, sp }: { locale: string; sp: Search }) {
  const tab: DoctorTab = (DOCTOR_TABS as string[]).includes(sp.tab ?? "") ? (sp.tab as DoctorTab) : "all";
  const pathname = `/${locale}/doctors`;
  const urlParams = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) if (v) urlParams.set(k, v);

  const clinicId = sp.clinic ? Number(sp.clinic) : undefined;
  const linked: DoctorLinked | undefined =
    sp.linked === "clinic" || sp.linked === "individual" ? sp.linked : undefined;
  const [t, tRoot, allRows, clinicRows] = await Promise.all([
    getTranslations("doctors"),
    getTranslations(),
    listDoctorRows(sp.keyword, clinicId, linked),
    listClinicRows(),
  ]);

  const counts = Object.fromEntries(
    DOCTOR_TABS.map((tb) => [tb, allRows.filter((r) => doctorMatchesTab(r, tb)).length]),
  );
  const sort = parseSort(sp.sort);
  const rows = sortDoctorRows(
    allRows.filter((r) => doctorMatchesTab(r, tab)),
    sort,
  );

  const tabHref = (next: DoctorTab) => {
    const p = new URLSearchParams(urlParams);
    p.set("tab", next);
    p.delete("open");
    p.delete("facet");
    return `${pathname}?${p.toString()}`;
  };
  const tabs: CountTab[] = DOCTOR_TABS.map((tb) => ({
    key: tb,
    label: t(`tab.${tb}`),
    href: tabHref(tb),
    active: tb === tab,
    count: counts[tb],
  }));

  const openHref = (r: DoctorRow) => {
    const p = new URLSearchParams(urlParams);
    p.set("open", String(r.doctor.id));
    p.set("facet", "overview");
    return `${pathname}?${p.toString()}`;
  };
  const colSort = (key: string) => columnSort(pathname, urlParams, key, sort);

  const columns: BridgeColumn[] = [
    { header: t("col.name"), sort: colSort("name") },
    { header: t("col.id"), width: "7rem", sort: colSort("doctor") },
    { header: t("col.clinic"), sort: colSort("clinic") },
    { header: t("col.activation") },
    { header: t("col.last-activity"), width: "9rem", sort: colSort("last") },
    { header: t("col.tags") },
  ];

  const gridRows: BridgeRow[] = rows.map((r) => ({
    key: String(r.doctor.id),
    href: openHref(r),
    selectId: String(r.doctor.id),
    selectLabel: t("select-row", { login: r.doctor.login_account }),
    cells: [
      <div key="name" className="text-sm font-medium text-foreground">
        {pickName(locale, r.doctor.doctor_name, r.doctor.doctor_name_en)}
      </div>,
      <span key="id" className="font-mono text-sm text-muted-foreground">
        {r.doctor.login_account.toUpperCase()}
      </span>,
      <div key="clinic" className="flex flex-wrap items-center gap-1.5">
        {r.clinics.length === 0 ? (
          <StatusBadge tone="accent" appearance="outline" label={t("individual")} />
        ) : (
          <>
            <span className="text-sm text-foreground">
              {pickName(locale, r.clinics[0]!.clinic_name, r.clinics[0]!.clinic_name_en)}
            </span>
            {r.clinics.length > 1 ? (
              <StatusBadge
                tone="neutral"
                appearance="outline"
                label={t("plus-n", { count: r.clinics.length - 1 })}
              />
            ) : null}
          </>
        )}
      </div>,
      <MetaBadge
        key="activation"
        meta={activationStatus(r.ops.activation)}
        label={tRoot(activationStatus(r.ops.activation).key)}
      />,
      <span key="last" className="text-muted-foreground">
        {formatRelative(r.ops.last_activity, locale, Date.now())}
      </span>,
      <div key="tags" className="flex gap-1">
        <StatusBadge
          tone="accent"
          appearance="outline"
          label={locale.startsWith("zh") ? r.ops.specialty_zh : r.ops.specialty_en}
        />
      </div>,
    ],
  }));

  const filtered = Boolean(sp.keyword || sp.clinic || linked);

  return (
    <>
      <SectionTopBar
        eyebrow={t("eyebrow")}
        title={t("title")}
        grid="doctors"
        tabs={tabs}
        action={<NewDoctorButton clinics={clinicRows.map((c) => ({ id: c.clinic.id, label: pickName(locale, c.clinic.clinic_name, c.clinic.clinic_name_en) }))} />}
        filterRow={
          <FilterRow>
            <KeywordSearch placeholder={t("search-placeholder")} />
            <UrlSelect
              param="clinic"
              label={t("clinic-filter")}
              allLabel={t("clinic-all")}
              width="14rem"
              options={clinicRows.map((c) => ({
                value: String(c.clinic.id),
                label: pickName(locale, c.clinic.clinic_name, c.clinic.clinic_name_en),
              }))}
            />
            <UrlSelect
              param="linked"
              label={t("linked-filter")}
              allLabel={t("linked-all")}
              width="11rem"
              options={[
                { value: "clinic", label: t("linked-clinic") },
                { value: "individual", label: t("linked-individual") },
              ]}
            />
          </FilterRow>
        }
      />
      <div className="slim-scroll min-h-0 flex-1 overflow-y-auto pb-6">
        {rows.length === 0 ? (
          <Empty
            icon="doctor"
            title={filtered ? t("empty.filtered-title") : t("empty.title")}
            description={filtered ? t("empty.filtered-description") : t("empty.description")}
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
        <DoctorsBulkBar rows={rows.map((r) => ({ id: r.doctor.id, login: r.doctor.login_account }))} />
      </div>
      {sp.open ? (
        <DoctorDrawer locale={locale} doctorId={Number(sp.open)} facet={sp.facet ?? "overview"} searchParams={urlParams} />
      ) : null}
    </>
  );
}
