"use client";

// Per-surface contextual action bars — appear on multi-select, run every bulk
// action through a dry-run preview + the deliberate-confirm gate, and clear
// the selection on completion (partial failures surface as error toasts).
//
// Selection scope is explicit and never silently stale: the bar states the
// page scope ("N selected on this page"), and any change to the grid's URL
// state (tab, filter, keyword, sort, page) clears the selection with a
// visible notice — a selection made under one filter never carries into the
// rows of another. Drawer navigation (open/facet) is excluded: opening a
// detail drawer over the grid keeps filter, sort and selection intact.

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useTransition } from "react";
import { useTranslations } from "next-intl";
import { BulkActionBar, Button, useBulkSelection, type DryRunItem } from "@acuity/ui";
import { GateButton } from "@/components/ui/confirm-gate";
import { AcuityIcon } from "@acuity/ui";
import { useToast } from "@acuity/ui";
import { bulkClinicsAction, bulkDoctorsAction, bulkTemplatesAction } from "@/lib/actions";

function dryRunItems(rows: { key: string; label: string }[], selected: ReadonlySet<string>): DryRunItem[] {
  return rows
    .filter((r) => selected.has(r.key))
    .map((r) => ({ key: r.key, label: r.label, status: "ok" as const }));
}

// Clears a live selection when the grid's URL state changes, with a visible
// notice. Drawer params (open/facet) are excluded so a detail drawer over the
// grid keeps the selection.
function SelectionFilterSync() {
  const tc = useTranslations("bulk");
  const { selected, clear } = useBulkSelection();
  const searchParams = useSearchParams();
  const { showToast } = useToast();

  const params = new URLSearchParams(searchParams.toString());
  params.delete("open");
  params.delete("facet");
  const signature = params.toString();

  const previous = useRef(signature);
  const size = selected.size;
  useEffect(() => {
    if (previous.current === signature) return;
    previous.current = signature;
    if (size > 0) {
      clear();
      showToast(tc("selection-cleared"));
    }
  }, [signature, size, clear, showToast, tc]);

  return null;
}

export function ClinicsBulkBar({ rows }: { rows: { id: number; code: string; name: string }[] }) {
  const t = useTranslations("clinics.bulk");
  const tc = useTranslations("bulk");
  const { selected, clear } = useBulkSelection();
  const router = useRouter();
  const { showToast } = useToast();
  const [, startTransition] = useTransition();

  const picked = rows.filter((r) => selected.has(String(r.id)));
  const items = () => picked.map((r) => ({ id: r.id, code: r.code }));
  const dryRun = dryRunItems(
    rows.map((r) => ({ key: String(r.id), label: `${r.name} (${r.code})` })),
    selected,
  );

  function exportRows() {
    startTransition(async () => {
      const result = await bulkClinicsAction("export", items());
      if (result.ok) {
        showToast(t("exported", { count: picked.length }));
        clear();
        router.refresh();
      } else showToast(result.message, "error");
    });
  }

  return (
    <>
      <SelectionFilterSync />
      <BulkActionBar selectedLabel={tc("selected")} clearLabel={tc("clear")}>
      <GateButton
        buttonLabel={t("retag")}
        buttonIcon="tag"
        title={t("retag-title", { count: picked.length })}
        description={t("retag-feedforward", { count: picked.length })}
        variant="ack"
        ackLabel={t("retag-ack", { count: picked.length })}
        confirmLabel={t("retag-confirm")}
        dryRun={dryRun}
        dryRunSummary={tc("dry-run-summary", { count: picked.length })}
        action={() => bulkClinicsAction("retag", items())}
        successMessage={t("retagged", { count: picked.length })}
        onDone={clear}
      />
      <Button type="button" variant="outline" size="sm" onClick={exportRows}>
        <AcuityIcon name="download" size={16} />
        {t("export")}
      </Button>
      <GateButton
        buttonLabel={t("deactivate")}
        buttonIcon="alert"
        buttonVariant="destructive"
        title={t("deactivate-title", { count: picked.length })}
        description={t("deactivate-feedforward", { count: picked.length })}
        variant="paste"
        target={picked[0]?.code}
        destructive
        confirmLabel={t("deactivate-confirm")}
        dryRun={dryRun}
        dryRunSummary={tc("dry-run-summary", { count: picked.length })}
        action={() => bulkClinicsAction("deactivate", items())}
        successMessage={t("deactivated", { count: picked.length })}
        onDone={clear}
      />
      </BulkActionBar>
    </>
  );
}

export function DoctorsBulkBar({ rows }: { rows: { id: number; login: string }[] }) {
  const t = useTranslations("doctors.bulk");
  const tc = useTranslations("bulk");
  const { selected, clear } = useBulkSelection();

  const picked = rows.filter((r) => selected.has(String(r.id)));
  const items = () => picked.map((r) => ({ id: r.id, login: r.login }));
  const dryRun = dryRunItems(
    rows.map((r) => ({ key: String(r.id), label: r.login })),
    selected,
  );

  return (
    <>
      <SelectionFilterSync />
      <BulkActionBar selectedLabel={tc("selected")} clearLabel={tc("clear")}>
      <GateButton
        buttonLabel={t("retag")}
        buttonIcon="tag"
        title={t("retag-title", { count: picked.length })}
        description={t("retag-feedforward", { count: picked.length })}
        variant="ack"
        ackLabel={t("retag-ack", { count: picked.length })}
        confirmLabel={t("retag-confirm")}
        dryRun={dryRun}
        dryRunSummary={tc("dry-run-summary", { count: picked.length })}
        action={() => bulkDoctorsAction("retag", items())}
        successMessage={t("retagged", { count: picked.length })}
        onDone={clear}
      />
      <GateButton
        buttonLabel={t("deactivate")}
        buttonIcon="alert"
        buttonVariant="destructive"
        title={t("deactivate-title", { count: picked.length })}
        description={t("deactivate-feedforward", { count: picked.length })}
        variant="paste"
        target={picked[0]?.login}
        destructive
        confirmLabel={t("deactivate-confirm")}
        dryRun={dryRun}
        dryRunSummary={tc("dry-run-summary", { count: picked.length })}
        action={() => bulkDoctorsAction("deactivate", items())}
        successMessage={t("deactivated", { count: picked.length })}
        onDone={clear}
      />
      </BulkActionBar>
    </>
  );
}

export function FormsBulkBar({
  rows,
  usageTotal,
}: {
  rows: { id: number; code: string; name: string }[];
  usageTotal: number;
}) {
  const t = useTranslations("forms.bulk");
  const tc = useTranslations("bulk");
  const { selected, clear } = useBulkSelection();

  const picked = rows.filter((r) => selected.has(String(r.id)));
  const items = () => picked.map((r) => ({ id: r.id, code: r.code }));
  const dryRun = dryRunItems(
    rows.map((r) => ({ key: String(r.id), label: `${r.name} (${r.code})` })),
    selected,
  );

  return (
    <>
      <SelectionFilterSync />
      <BulkActionBar selectedLabel={tc("selected")} clearLabel={tc("clear")}>
      <GateButton
        buttonLabel={t("retag")}
        buttonIcon="tag"
        title={t("retag-title", { count: picked.length })}
        description={t("retag-feedforward", { count: picked.length })}
        variant="ack"
        ackLabel={t("retag-ack", { count: picked.length })}
        confirmLabel={t("retag-confirm")}
        dryRun={dryRun}
        dryRunSummary={tc("dry-run-summary", { count: picked.length })}
        action={() => bulkTemplatesAction("retag", items())}
        successMessage={t("retagged", { count: picked.length })}
        onDone={clear}
      />
      <GateButton
        buttonLabel={t("archive")}
        buttonIcon="layers"
        buttonVariant="destructive"
        title={t("archive-title", { count: picked.length })}
        description={t("archive-feedforward", { count: picked.length, usage: usageTotal })}
        variant="paste"
        target={picked[0]?.code}
        destructive
        confirmLabel={t("archive-confirm")}
        dryRun={dryRun}
        dryRunSummary={tc("dry-run-summary", { count: picked.length })}
        action={() => bulkTemplatesAction("archive", items())}
        successMessage={t("archived", { count: picked.length })}
        onDone={clear}
      />
      </BulkActionBar>
    </>
  );
}
