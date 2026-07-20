"use client";

// Client bridge for the shared ops-grid grammar. The vendored design-kit
// bundle is client-only ("use client" banner), so the shared OpsDataTable /
// CountTabs cannot execute inside a server component (their cn() calls are
// client references). Server pages keep owning the data: they fetch, filter,
// sort and prerender every CELL as a serialisable ReactNode; this bridge
// reassembles them into OpsDataTable columns on the client. Upstream ask
// (foundation lane): a server-safe utility entry in @component-core/ui, at
// which point this bridge dissolves.
//
// Keyboard layer: the wrapper rides the shared useOpsGridKeyboardNav hook
// (WAI-ARIA APG grid-lite row traversal, defined with the ops-grid client
// primitives in @acuity/ui).

import { useRef, type ReactNode } from "react";
import {
  BulkSelectAllCheckbox,
  BulkSelectCheckbox,
  OpsDataTable,
  useOpsGridKeyboardNav,
  type OpsColumn,
  type OpsSortDirection,
} from "@acuity/ui";

export interface BridgeColumn {
  header: string;
  /** Header text is for AT only (per-row action columns): rendered sr-only. */
  headerVisuallyHidden?: boolean;
  align?: "left" | "right";
  width?: string;
  sort?: { direction: OpsSortDirection | null; href: string } | undefined;
}

export interface BridgeRow {
  key: string;
  href?: string;
  cells: ReactNode[];
  /** Present = row is bulk-selectable under this id. */
  selectId?: string;
  selectLabel?: string;
}

export function OpsGridBridge({
  columns,
  rows,
  caption,
  openLabel,
  selectAllLabel,
}: {
  columns: BridgeColumn[];
  rows: BridgeRow[];
  caption: string;
  openLabel?: string;
  /** Enables the selection islands when rows carry selectId. */
  selectAllLabel?: string;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const selectable = Boolean(selectAllLabel) && rows.some((r) => r.selectId);
  useOpsGridKeyboardNav(wrapRef);

  const opsColumns: OpsColumn<BridgeRow>[] = columns.map((c, i) => ({
    key: String(i),
    header: c.header,
    headerVisuallyHidden: c.headerVisuallyHidden,
    align: c.align,
    width: c.width,
    sort: c.sort,
    cell: (row) => row.cells[i],
  }));
  return (
    <div ref={wrapRef}>
      <OpsDataTable
        columns={opsColumns}
        rows={rows}
        rowKey={(r) => r.key}
        rowHref={rows.some((r) => r.href) ? (r) => r.href ?? "" : undefined}
        openLabel={openLabel}
        caption={caption}
        leadingHeader={
          selectable ? (
            <BulkSelectAllCheckbox
              ids={rows.filter((r) => r.selectId).map((r) => r.selectId as string)}
              label={selectAllLabel as string}
            />
          ) : undefined
        }
        leading={
          selectable
            ? (row) =>
                row.selectId ? (
                  <BulkSelectCheckbox id={row.selectId} label={row.selectLabel ?? row.selectId} />
                ) : null
            : undefined
        }
      />
    </div>
  );
}
