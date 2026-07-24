// Tickets (operations) — the onboarding queue + issue worklist: tabs
// (Onboarding queue / Open / Mine / All) with counts, the queue's
// continue-walkthrough deep link into the clinic onboarding facet, and the
// ticket drawer (status / owner / resolution notes, open-clinic + view-audit
// links, resolve).

import Link from "next/link";
import { pickName } from "@acuity/i18n/names";
import { Suspense } from "react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Button, type CountTab } from "@acuity/ui";
import { OpsGridBridge, type BridgeColumn, type BridgeRow } from "@/components/grid/ops-grid-bridge";
import { SectionTopBar } from "@/components/shell/section-top-bar";
import { MetaBadge } from "@/components/ui/status-badge";
import { Empty } from "@/components/ui/empty";
import { AcuityIcon } from "@acuity/ui";
import { GridSkeleton } from "@/components/ui/skeletons";
import { TicketDrawer } from "@/components/drawers/ticket-drawer";
import { getCurrentUser, listClinicRows, listOnboardingQueue, listTickets } from "@/lib/data";
import { ticketStatus } from "@/lib/status";
import { formatRelative } from "@acuity/i18n/format";

const TABS = ["queue", "open", "mine", "all"] as const;
type Tab = (typeof TABS)[number];

type Search = { tab?: string; open?: string };

export default async function TicketsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Search>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const sp = await searchParams;
  const t = await getTranslations("tickets");

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
        <TicketsGrid locale={locale} sp={sp} />
      </Suspense>
    </div>
  );
}

async function TicketsGrid({ locale, sp }: { locale: string; sp: Search }) {
  const tab: Tab = (TABS as readonly string[]).includes(sp.tab ?? "") ? (sp.tab as Tab) : "queue";
  const pathname = `/${locale}/tickets`;
  const me = await getCurrentUser().catch(() => null);
  const operatorName = me?.display_name?.trim() || me?.username || "";

  const [t, tRoot, queue, ticketsPage, clinicRows] = await Promise.all([
    getTranslations("tickets"),
    getTranslations(),
    listOnboardingQueue(),
    listTickets({ page_size: 100 }),
    listClinicRows(),
  ]);

  const clinicOf = (id: number) => clinicRows.find((c) => c.clinic.id === id);
  const clinicLabel = (id: number) => {
    const c = clinicOf(id);
    return c ? pickName(locale, c.clinic.clinic_name, c.clinic.clinic_name_en) : `#${id}`;
  };
  const clinicCode = (id: number) => clinicOf(id)?.clinic.clinic_code ?? `#${id}`;

  // Queue-age ordering: the worklists default to waiting-longest first
  // (oldest update at the top) so no clinic or ticket starves in a small
  // queue; ages render as relative time on every row.
  const byAge = <T extends { updated_at: string }>(rows: T[]) =>
    [...rows].sort((a, b) => a.updated_at.localeCompare(b.updated_at));
  const allTickets = byAge(ticketsPage.items);
  const openTickets = allTickets.filter((x) => x.status !== "resolved");
  const mine = allTickets.filter((x) => operatorName && x.owner === operatorName);
  const counts: Record<Tab, number> = {
    queue: queue.length,
    open: openTickets.length,
    mine: mine.length,
    all: ticketsPage.items.length,
  };

  const tabs: CountTab[] = TABS.map((tb) => ({
    key: tb,
    label: t(`tab.${tb}`),
    href: `${pathname}?tab=${tb}`,
    active: tb === tab,
    count: counts[tb],
    starred: tb === "queue",
  }));

  const queueColumns: BridgeColumn[] = [
    { header: t("col.clinic") },
    { header: t("col.next-step") },
    { header: t("col.progress"), width: "8rem" },
    { header: t("col.last-activity"), width: "9rem" },
    { header: t("col.actions"), headerVisuallyHidden: true, width: "13rem" },
  ];
  const queueRows: BridgeRow[] = byAge(queue).map((r) => ({
    key: String(r.clinic_id),
    cells: [
      <div key="clinic">
        <div className="font-medium text-foreground">{clinicLabel(r.clinic_id)}</div>
        <div className="t-id text-xs text-muted-foreground">{clinicCode(r.clinic_id)}</div>
      </div>,
      <span key="step">{locale.startsWith("zh") ? r.next_step_zh : r.next_step_en}</span>,
      <span key="progress" className="tabular-nums">
        {t("progress-of", { step: r.progress_step, total: r.progress_total })}
      </span>,
      <span key="last" className="text-muted-foreground">
        {formatRelative(r.updated_at, locale, Date.now())}
      </span>,
      <Button key="action" asChild variant="outline" size="sm">
        <Link href={`/${locale}/clinics?open=${r.clinic_id}&facet=onboarding`}>
          <AcuityIcon name="arrow-right" size={16} />
          {t("continue-walkthrough")}
        </Link>
      </Button>,
    ],
  }));

  const ticketRows = tab === "open" ? openTickets : tab === "mine" ? mine : allTickets;

  const ticketColumns: BridgeColumn[] = [
    { header: t("col.issue") },
    { header: t("col.clinic"), width: "8rem" },
    { header: t("col.status") },
    { header: t("col.owner"), width: "9rem" },
    { header: t("col.updated"), width: "9rem" },
  ];
  const ticketGridRows: BridgeRow[] = ticketRows.map((r) => ({
    key: r.id,
    href: `${pathname}?tab=${tab}&open=${r.id}`,
    cells: [
      <div key="issue">
        <div className="font-medium text-foreground">{locale.startsWith("zh") ? r.subject_zh : r.subject_en}</div>
        <div className="t-id text-xs text-muted-foreground">{r.id}</div>
      </div>,
      <span key="clinic" className="t-id text-muted-foreground">
        {clinicCode(r.clinic_id)}
      </span>,
      <MetaBadge key="status" meta={ticketStatus(r.status)} label={tRoot(ticketStatus(r.status).key)} />,
      <span key="owner">{r.owner ?? "—"}</span>,
      <span key="updated" className="text-muted-foreground">
        {formatRelative(r.updated_at, locale, Date.now())}
      </span>,
    ],
  }));

  const openTicket = sp.open ? ticketsPage.items.find((x) => x.id === sp.open) : null;

  return (
    <>
      <SectionTopBar eyebrow={t("eyebrow")} title={t("title")} tabs={tabs} />
      <div className="slim-scroll min-h-0 flex-1 overflow-y-auto pb-6 pt-2">
        {tab === "queue" ? (
          queue.length === 0 ? (
            <Empty icon="ticket" title={t("empty.queue-title")} description={t("empty.queue-description")} />
          ) : (
            <OpsGridBridge columns={queueColumns} rows={queueRows} caption={t("tab.queue")} />
          )
        ) : ticketRows.length === 0 ? (
          <Empty icon="ticket" title={t("empty.tickets-title")} description={t("empty.tickets-description")} />
        ) : (
          <OpsGridBridge columns={ticketColumns} rows={ticketGridRows} caption={t("title")} openLabel={t("open-ticket")} />
        )}
      </div>
      {openTicket ? (
        <TicketDrawer
          locale={locale}
          ticket={openTicket}
          clinicName={clinicLabel(openTicket.clinic_id)}
          clinicId={openTicket.clinic_id}
          clinicCode={clinicCode(openTicket.clinic_id)}
        />
      ) : null}
    </>
  );
}
