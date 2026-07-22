// Forms — policy-template library: Intake / Library / All saved-view tabs
// with counts, upload dropzone (blank insurer forms only — no PHI), per-row
// retry for failed parses (All tab), intake vs library column sets, pagination,
// bulk re-tag / archive, and row-open into the field-map editor.

import { Suspense } from "react";
import { pickName } from "@acuity/i18n/names";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { BulkSelectionProvider, type CountTab } from "@acuity/ui";
import { StatusBadge } from "@/components/ui/ui-client";
import { OpsGridBridge, type BridgeColumn, type BridgeRow } from "@/components/grid/ops-grid-bridge";
import { SectionTopBar } from "@/components/shell/section-top-bar";
import { FilterRow, KeywordSearch } from "@/components/grid/filter-bar";
import { MetaBadge } from "@/components/ui/status-badge";
import { Empty } from "@/components/ui/empty";
import { GridSkeleton } from "@/components/ui/skeletons";
import { FormsBulkBar } from "@/components/grid/bulk-bars";
import { PaginationBar } from "@/components/grid/pagination-bar";
import { UploadDropzone } from "@/components/ui/upload-dropzone";
import { FormsParsePoller } from "@/components/forms/forms-parse-poller";
import { ActionButton } from "@/components/ui/action-button";
import { reparseTemplateAction } from "@/lib/actions";
import {
  FORMS_TABS,
  listCompanies,
  listTemplateRows,
  sortTemplateRows,
  templateMatchesTab,
  type FormsTab,
  type TemplateRow,
} from "@/lib/data";
import { templateOpsStatusMeta } from "@/lib/status";
import { columnSort, parseSort } from "@/lib/table";
import { formatRelative } from "@acuity/i18n/format";

type Search = { tab?: string; keyword?: string; sort?: string; page?: string };

const PAGE_SIZE = 20;

function Thumb() {
  return (
    <div
      aria-hidden
      className="h-11 w-8 shrink-0 rounded-sm border border-border"
      style={{
        background:
          "repeating-linear-gradient(180deg, var(--caliber-cream-contrast), var(--caliber-cream-contrast) 5px, var(--caliber-cream) 5px, var(--caliber-cream) 7px)",
      }}
    />
  );
}

export default async function FormsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Search>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const sp = await searchParams;
  const t = await getTranslations("forms");

  return (
    <BulkSelectionProvider>
      <div className="flex h-full flex-col">
        <Suspense
          fallback={
            <>
              <SectionTopBar eyebrow={t("eyebrow")} title={t("title")} />
              <GridSkeleton cols={5} />
            </>
          }
        >
          <FormsGrid locale={locale} sp={sp} />
        </Suspense>
      </div>
    </BulkSelectionProvider>
  );
}

async function FormsGrid({ locale, sp }: { locale: string; sp: Search }) {
  const tab: FormsTab = (FORMS_TABS as string[]).includes(sp.tab ?? "") ? (sp.tab as FormsTab) : "intake";
  const pathname = `/${locale}/forms`;
  const urlParams = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) if (v) urlParams.set(k, v);

  const [t, tRoot, allRows, companiesPage] = await Promise.all([
    getTranslations("forms"),
    getTranslations(),
    listTemplateRows(sp.keyword),
    listCompanies({ page_size: 100 }),
  ]);

  const counts = Object.fromEntries(FORMS_TABS.map((tb) => [tb, allRows.filter((r) => templateMatchesTab(r, tb)).length]));
  const sort = parseSort(sp.sort);
  // Intake queue: oldest upload first so nothing starves; explicit column sort overrides.
  const effectiveSort = sort ?? (tab === "intake" ? { key: "uploaded", direction: "asc" as const } : null);
  const filtered = sortTemplateRows(
    allRows.filter((r) => templateMatchesTab(r, tab)),
    effectiveSort,
  );
  const page = Math.max(1, Number(sp.page) || 1);
  const rows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const tabs: CountTab[] = FORMS_TABS.map((tb) => ({
    key: tb,
    label: t(`tab.${tb}`),
    href: `${pathname}?tab=${tb}`,
    active: tb === tab,
    count: counts[tb],
    starred: tb === "intake",
  }));

  const colSort = (key: string) => columnSort(pathname, urlParams, key, sort);

  const nameCell = (r: TemplateRow) => (
    <div key="name" className="flex items-center gap-3">
      <Thumb />
      <div>
        <div className="font-medium text-foreground">{r.template.template_name}</div>
        <div className="t-id text-xs text-muted-foreground">{r.template.template_code}</div>
      </div>
    </div>
  );

  const intakeColumns: BridgeColumn[] = [
    { header: t("col.name"), sort: colSort("name") },
    { header: t("col.status"), sort: colSort("status") },
    { header: t("col.fields"), align: "right", width: "8rem", sort: colSort("fields") },
    { header: t("col.insurer") },
    { header: t("col.uploaded"), width: "8rem", sort: colSort("uploaded") },
    { header: t("col.actions"), headerVisuallyHidden: true, width: "6.5rem" },
  ];
  const libraryColumns: BridgeColumn[] = [
    { header: t("col.name"), sort: colSort("name") },
    { header: t("col.tags") },
    { header: t("col.version"), width: "6rem" },
    { header: t("col.updated"), width: "8rem", sort: colSort("uploaded") },
    { header: t("col.usage"), align: "right", width: "6rem", sort: colSort("usage") },
  ];

  const intakeCells = (r: TemplateRow) => [
    nameCell(r),
    <div key="status">
      <MetaBadge meta={templateOpsStatusMeta(r.ops_status)} label={tRoot(templateOpsStatusMeta(r.ops_status).key)} />
      {r.ops_status === "failed" && r.template.parse_error ? (
        <div className="mt-1 max-w-72 text-xs text-destructive">{r.template.parse_error}</div>
      ) : null}
      {r.ops_status === "processing" ? (
        <div className="mt-1 text-xs text-muted-foreground">{t("progress", { pct: r.template.parse_progress ?? 0 })}</div>
      ) : null}
    </div>,
    <span key="fields" className="tabular-nums">
      {r.field_count || "—"}
    </span>,
    <StatusBadge
      key="insurer"
      tone="info"
      appearance="outline"
      label={locale.startsWith("zh") ? r.company_name_zh : r.company_name}
    />,
    <span key="uploaded" className="text-muted-foreground">
      {formatRelative(r.template.created_at, locale, Date.now())}
    </span>,
    r.ops_status === "failed" ? (
      <ActionButton
        key="retry"
        label={t("retry")}
        icon="retry"
        action={reparseTemplateAction.bind(null, r.template.id)}
        successMessage={t("retrying", { code: r.template.template_code })}
      />
    ) : (
      <span key="retry" />
    ),
  ];
  const libraryCells = (r: TemplateRow) => [
    nameCell(r),
    <StatusBadge
      key="tags"
      tone="info"
      appearance="outline"
      label={locale.startsWith("zh") ? r.company_name_zh : r.company_name}
    />,
    <span key="version" className="t-id text-muted-foreground">
      {r.template.version}
    </span>,
    <span key="updated" className="text-muted-foreground">
      {formatRelative(r.template.created_at, locale, Date.now())}
    </span>,
    <span key="usage" className="tabular-nums">
      {r.ops.usage_count.toLocaleString()}
    </span>,
  ];

  const columns = tab === "library" ? libraryColumns : intakeColumns;
  const gridRows: BridgeRow[] = rows.map((r) => ({
    key: String(r.template.id),
    href: `/${locale}/forms/${r.template.id}`,
    selectId: String(r.template.id),
    selectLabel: t("select-row", { name: r.template.template_name }),
    cells: tab === "library" ? libraryCells(r) : intakeCells(r),
  }));


  return (
    <>
      <FormsParsePoller
        active={allRows.some((r) => r.ops_status === "uploaded" || r.ops_status === "processing")}
      />
      <SectionTopBar
        eyebrow={t("eyebrow")}
        title={t("title")}
        grid="forms"
        tabs={tabs}
        action={
          <UploadDropzone
            companies={companiesPage.items.map((c) => ({ id: c.id, label: pickName(locale, c.company_name, c.company_name_en) }))}
            variant="button"
          />
        }
        filterRow={
          <FilterRow>
            <KeywordSearch placeholder={t("search-placeholder")} />
          </FilterRow>
        }
      />
      {tab !== "library" ? (
        <div className="px-6 pt-4">
          <UploadDropzone
            companies={companiesPage.items.map((c) => ({ id: c.id, label: pickName(locale, c.company_name, c.company_name_en) }))}
            variant="zone"
          />
        </div>
      ) : null}
      <div className="slim-scroll min-h-0 flex-1 overflow-y-auto pb-6 pt-2">
        {filtered.length === 0 ? (
          <Empty
            icon="template"
            title={t(`empty.${tab}-title`)}
            description={t("empty.description")}
          />
        ) : (
          <>
            <OpsGridBridge
              columns={columns}
              rows={gridRows}
              caption={t("title")}
              openLabel={t("open")}
              selectAllLabel={t("select-all")}
            />
            <PaginationBar page={page} pageSize={PAGE_SIZE} total={filtered.length} />
          </>
        )}
        <FormsBulkBar
          rows={rows.map((r) => ({ id: r.template.id, code: r.template.template_code, name: r.template.template_name }))}
          usageTotal={rows.reduce((sum, r) => sum + r.ops.usage_count, 0)}
        />
      </div>
    </>
  );
}
