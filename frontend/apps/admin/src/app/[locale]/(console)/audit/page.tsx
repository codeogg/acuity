// Audit — the read-only, filterable operator trail: Global / This clinic /
// By action-class tabs, operator + action-class filters (every axis is a URL
// param, so any filtered view is a shareable link), the surrogate-only shield
// note in the filter row, expandable per-entry detail with a copyable event
// ID, paginated pages (auditors cite page positions — never infinite scroll),
// and mode chips (view-as / act-as). Unknown action classes render their raw
// code — an audit row is never mislabelled.

import { Suspense } from "react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { type CountTab } from "@acuity/ui";
import { StatusBadge } from "@/components/ui/ui-client";
import { SectionTopBar } from "@/components/shell/section-top-bar";
import { FilterRow, FilterNote, UrlSelect } from "@/components/grid/filter-bar";
import { Empty } from "@/components/ui/empty";
import { AcuityIcon } from "@acuity/ui";
import { GridSkeleton } from "@/components/ui/skeletons";
import { AuditTable } from "@/components/grid/audit-table";
import { PaginationBar } from "@/components/grid/pagination-bar";
import { listAuditLogs, listClinicRows } from "@/lib/data";
import { AUDIT_ACTION } from "@/lib/status";

const TABS = ["global", "clinic", "action"] as const;
type Tab = (typeof TABS)[number];
const PAGE_SIZE = 25;

type Search = {
  tab?: string;
  clinic?: string;
  operator?: string;
  action?: string;
  page?: string;
};

export default async function AuditPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Search>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const sp = await searchParams;
  const t = await getTranslations("audit");

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
        <AuditGrid locale={locale} sp={sp} />
      </Suspense>
    </div>
  );
}

async function AuditGrid({ locale, sp }: { locale: string; sp: Search }) {
  const tab: Tab = (TABS as readonly string[]).includes(sp.tab ?? "")
    ? (sp.tab as Tab)
    : sp.clinic
      ? "clinic"
      : "global";
  const pathname = `/${locale}/audit`;
  const pageNo = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);

  const clinicRows = sp.clinic ? await listClinicRows(sp.clinic) : [];
  const clinicId =
    clinicRows.find((r) => r.clinic.clinic_code === sp.clinic)?.clinic.id ??
    (Number.isFinite(Number(sp.clinic)) ? Number(sp.clinic) : undefined);

  const [t, tRoot, events, allEvents] = await Promise.all([
    getTranslations("audit"),
    getTranslations(),
    listAuditLogs({
      page: pageNo,
      page_size: PAGE_SIZE,
      scope: tab === "clinic" ? "clinic" : undefined,
      operator_id: sp.operator ? Number(sp.operator) || undefined : undefined,
      action_type: sp.action || undefined,
      clinic_id: tab === "clinic" ? clinicId : undefined,
    }),
    listAuditLogs({
      page_size: 100,
      scope: tab === "clinic" ? "clinic" : undefined,
      clinic_id: tab === "clinic" ? clinicId : undefined,
    }),
  ]);

  const clinicCount = clinicId
    ? allEvents.items.filter((e) => e.clinic_id === clinicId).length
    : allEvents.items.filter((e) => e.clinic_id != null).length;

  const tabHref = (tb: Tab) => {
    const p = new URLSearchParams();
    p.set("tab", tb);
    if (sp.clinic) p.set("clinic", sp.clinic);
    if (sp.operator) p.set("operator", sp.operator);
    if (sp.action) p.set("action", sp.action);
    return `${pathname}?${p.toString()}`;
  };
  const tabs: CountTab[] = TABS.map((tb) => ({
    key: tb,
    label: t(`tab.${tb}`),
    href: tabHref(tb),
    active: tb === tab,
    count: tb === "global" ? allEvents.total : tb === "clinic" ? clinicCount : undefined,
    starred: tb === "global",
  }));

  const operators = [
    ...new Map(
      allEvents.items
        .filter((e) => e.operator_name)
        .map((e) => [String(e.operator_id), e.operator_name!] as const),
    ).entries(),
  ].map(([id, name]) => ({ value: id, label: name }));

  return (
    <>
      <SectionTopBar
        eyebrow={t("eyebrow")}
        title={t("title")}
        grid="audit"
        tabs={tabs}
        filterRow={
          <FilterRow>
            {sp.clinic && tab === "clinic" ? (
              <StatusBadge tone="info" appearance="outline" label={sp.clinic} icon={<AcuityIcon name="clinic" size={13} />} />
            ) : null}
            <UrlSelect
              param="operator"
              label={t("operator-filter")}
              allLabel={t("operator-all")}
              options={operators}
            />
            <UrlSelect
              param="action"
              label={t("action-filter")}
              allLabel={t("action-all")}
              width="13rem"
              options={Object.entries(AUDIT_ACTION).map(([code, meta]) => ({
                value: code,
                label: tRoot(meta.key),
              }))}
            />
            <FilterNote icon={<AcuityIcon name="shield" size={13} />}>{t("surrogate-note")}</FilterNote>
          </FilterRow>
        }
      />
      <div className="slim-scroll min-h-0 flex-1 overflow-y-auto pb-8">
        {events.items.length === 0 ? (
          <Empty icon="audit" title={t("empty.title")} description={t("empty.description")} />
        ) : (
          <>
            <AuditTable rows={events.items} locale={locale} />
            <PaginationBar page={pageNo} pageSize={PAGE_SIZE} total={events.total} />
          </>
        )}
      </div>
    </>
  );
}
