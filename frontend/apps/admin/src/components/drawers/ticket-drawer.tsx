"use client";

// Ticket drawer — status / owner / resolution-notes editors, open-clinic and
// view-audit deep links, and the Resolve action.

import { Link } from "@acuity/i18n/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@acuity/ui";
import type { frontendOnly } from "@acuity/api-client";
import { RouteDrawer } from "@/components/drawers/drawer-route";
import { KeyVal } from "@/components/ui/detail";
import { CrmFieldRow } from "@/components/ui/crm-field";
import { ActionButton } from "@/components/ui/action-button";
import { AcuityIcon } from "@acuity/ui";
import { resolveTicketAction, updateTicketAction } from "@/lib/actions";

type Ticket = frontendOnly.adminTickets.Ticket;

export function TicketDrawer({
  locale,
  ticket,
  clinicId,
  clinicName,
  clinicCode,
}: {
  locale: string;
  ticket: Ticket;
  clinicId: number;
  clinicName: string;
  clinicCode: string;
}) {
  const t = useTranslations("tickets.drawer");

  return (
    <RouteDrawer
      title={locale.startsWith("zh") ? ticket.subject_zh : ticket.subject_en}
      description={`${t("eyebrow")} ${ticket.id}`}
      footer={
        <div className="flex justify-end">
          <ActionButton
            label={t("resolve")}
            icon="check"
            variant="default"
            size="default"
            action={() => resolveTicketAction(ticket.id)}
            successMessage={t("resolved")}
          />
        </div>
      }
    >
      <KeyVal label={t("clinic")}>{clinicName}</KeyVal>
      <div className="mt-4">
        <CrmFieldRow
          label={t("status")}
          value={ticket.status}
          options={["open", "in-progress", "resolved"].map((v) => ({ value: v, label: t(`status-${v}`) }))}
          commit={(next) =>
            updateTicketAction(ticket.id, { status: next as "open" | "in-progress" | "resolved" })
          }
          successMessage={t("status-updated")}
        />
        <CrmFieldRow
          label={t("owner")}
          value={ticket.owner ?? "none"}
          options={[
            { value: "none", label: "—" },
            { value: "A. Founder", label: "A. Founder" },
            { value: "M. Cheng", label: "M. Cheng" },
          ]}
          commit={(next) => updateTicketAction(ticket.id, { owner: next === "none" ? null : next })}
          successMessage={t("owner-updated")}
        />
        <CrmFieldRow
          label={t("notes")}
          value=""
          multiline
          commit={(next) => updateTicketAction(ticket.id, { add_note: next })}
          successMessage={t("note-added")}
        />
      </div>
      {ticket.notes.length ? (
        <div className="mb-4">
          <div className="mb-1.5 font-mono text-xs font-medium uppercase tracking-eyebrow text-muted-foreground">
            {t("history")}
          </div>
          {ticket.notes.map((note, i) => (
            <div key={i} className="border-b border-border py-2 text-sm text-foreground">
              {note}
            </div>
          ))}
        </div>
      ) : null}
      <div className="mt-2 flex flex-wrap gap-2">
        <Button asChild variant="outline" size="sm">
          <Link href={`/clinics?open=${clinicId}&facet=overview`}>
            <AcuityIcon name="clinic" size={16} />
            {t("open-clinic")}
          </Link>
        </Button>
        <Button asChild variant="outline" size="sm">
          <Link href={`/audit?clinic=${clinicCode}&tab=clinic`}>
            <AcuityIcon name="audit" size={16} />
            {t("view-audit")}
          </Link>
        </Button>
      </div>
    </RouteDrawer>
  );
}
