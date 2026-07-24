import type { ReactNode } from "react";
import Link from "next/link";
import {
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  cn,
} from "@component-core/ui";
// The house shadows (focusable scroll container; flat resting rows) — internal
// modules must import these, not the design-kit base, or the corrections are
// silently bypassed.
import { Table } from "./table";
import { TableRow } from "./table-row";
import { AcuityIcon } from "../icons";

// The console operations-grid grammar, promoted from the operator console so
// every list surface composes one shared family instead of per-app forks:
//   - OpsDataTable: server-rendered semantic table (contrast header ground,
//     hairline separators, hover wash, tabular numerals) with URL-driven
//     sortable columns (sort state + hrefs computed by the caller - sort is a
//     server re-render, never a client sort) and an optional leading cell for
//     the bulk-selection checkbox island.
//   - CountTabs: the count-tab strip above a grid.
//   - DryRunPreview: the per-item preview list a bulk action shows inside the
//     deliberate-confirm gate before executing.
// Interactive pieces (bulk selection, detail drawer, confirm gate) live in
// ops-grid-client.tsx; this module stays server-safe.

export type OpsSortDirection = "asc" | "desc";

export type OpsColumn<Row> = {
  key: string;
  header: string;
  /** Header text is for AT only (per-row action columns): rendered sr-only. */
  headerVisuallyHidden?: boolean;
  align?: "left" | "right";
  width?: string;
  /** URL-driven sort: current direction (null = inactive) + the toggle href. */
  sort?: { direction: OpsSortDirection | null; href: string };
  cell: (row: Row) => ReactNode;
};

export function OpsDataTable<Row>({
  columns,
  rows,
  rowKey,
  rowHref,
  openLabel = "Open",
  caption,
  leading,
  leadingHeader,
}: {
  columns: OpsColumn<Row>[];
  rows: Row[];
  rowKey: (row: Row) => string | number;
  rowHref?: (row: Row) => string;
  openLabel?: string;
  caption?: string;
  /** Leading cell per row (the bulk-selection checkbox island). */
  leading?: (row: Row) => ReactNode;
  /** Leading header cell (the select-all checkbox island). */
  leadingHeader?: ReactNode;
}) {
  const headClass = (align?: "left" | "right") =>
    cn(
      "h-10 bg-muted text-sm font-medium text-foreground",
      align === "right" ? "text-right" : "text-left",
    );
  return (
    <div className="overflow-x-auto">
      <Table>
        {caption ? <caption className="sr-only">{caption}</caption> : null}
        <TableHeader>
          <TableRow className="border-b border-border-strong bg-muted hover:bg-muted">
            {leading ? (
              <TableHead className="h-10 w-10 bg-muted">{leadingHeader}</TableHead>
            ) : null}
            {columns.map((c) => (
              <TableHead
                key={c.key}
                style={c.width ? { width: c.width } : undefined}
                className={headClass(c.align)}
                aria-sort={
                  c.sort?.direction === "asc"
                    ? "ascending"
                    : c.sort?.direction === "desc"
                      ? "descending"
                      : undefined
                }
              >
                {c.sort ? (
                  <Link
                    href={c.sort.href}
                    // py-1: lifts the 20px text row to a ≥24px hit box inside
                    // the 40px header (WCAG 2.2 target size), no layout shift.
                    className="inline-flex items-center gap-1 rounded-sm py-1 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {c.header}
                    <span
                      className={cn(
                        "flex",
                        c.sort.direction ? "text-primary" : "text-muted-foreground",
                      )}
                    >
                      <AcuityIcon
                        name={c.sort.direction === "desc" ? "chevron-down" : "chevron-up"}
                        size={14}
                        className={c.sort.direction ? undefined : "opacity-50"}
                      />
                    </span>
                  </Link>
                ) : c.headerVisuallyHidden ? (
                  <span className="sr-only">{c.header}</span>
                ) : (
                  c.header
                )}
              </TableHead>
            ))}
            {rowHref ? (
              <TableHead className="h-10 w-12 bg-muted text-right">
                <span className="sr-only">{openLabel}</span>
              </TableHead>
            ) : null}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => {
            const href = rowHref?.(row);
            return (
              <TableRow
                key={rowKey(row)}
                className={cn(
                  "border-b border-border transition-colors hover:bg-accent",
                  // Whole-row open: the row is the positioning context for the
                  // open link's stretched overlay below.
                  href && "relative cursor-pointer",
                )}
              >
                {leading ? (
                  // Positioned above the stretched row link so the checkbox
                  // island stays independently clickable.
                  <TableCell className="relative z-10 h-11 w-10 align-middle">
                    {leading(row)}
                  </TableCell>
                ) : null}
                {columns.map((c) => (
                  <TableCell
                    key={c.key}
                    className={cn(
                      "h-11 align-middle text-sm text-foreground",
                      c.align === "right" ? "text-right tabular-nums" : "text-left",
                    )}
                  >
                    {c.cell(row)}
                  </TableCell>
                ))}
                {href ? (
                  <TableCell className="h-11 text-right">
                    {/* One link, stretched across the row (::after overlay) —
                        clicking anywhere on the row opens the record. */}
                    <Link
                      href={href}
                      aria-label={openLabel}
                      className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors after:absolute after:inset-0 hover:text-primary"
                    >
                      <AcuityIcon name="chevron-right" size={16} />
                    </Link>
                  </TableCell>
                ) : null}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

// --- Count tabs --------------------------------------------------------------

export interface CountTab {
  key: string;
  label: string;
  href: string;
  active?: boolean;
  count?: number;
  /** Optional star marker for a preferred tab. */
  starred?: boolean;
}

export function CountTabs({
  tabs,
  action,
  className,
  navLabel,
}: {
  tabs: CountTab[];
  /** Trailing slot for a tab-row action. */
  action?: ReactNode;
  className?: string;
  navLabel?: string;
}) {
  return (
    <nav
      aria-label={navLabel}
      className={cn(
        "flex items-center gap-1 overflow-x-auto border-b border-border px-6 py-2",
        className,
      )}
    >
      {tabs.map((tab) => (
        <Link
          key={tab.key}
          href={tab.href}
          aria-current={tab.active ? "page" : undefined}
          className={cn(
            // The one filter/tab grammar: a coloured BOX (matching the nav
            // active standard), floating clear of the divider line — never an
            // underline touching it. Fixed box, colour-only state change.
            "flex h-8 shrink-0 items-center gap-1.5 rounded-md px-3 text-sm transition-colors duration-[120ms]",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            tab.active
              ? "bg-sky-blue/50 text-navy hover:bg-sky-blue/65"
              : "text-muted-foreground hover:bg-accent hover:text-foreground",
          )}
        >
          {tab.starred ? (
            <span aria-hidden className="text-warning">
              ★
            </span>
          ) : null}
          <span>{tab.label}</span>
          {typeof tab.count === "number" ? (
            <span
              className={cn(
                "rounded-full px-1.5 py-0.5 text-xs tabular-nums",
                tab.active
                  ? "bg-navy/10 text-navy"
                  : "bg-glaucous/15 text-venice",
              )}
            >
              {tab.count}
            </span>
          ) : null}
        </Link>
      ))}
      {action ? <div className="ml-1 flex items-center">{action}</div> : null}
    </nav>
  );
}

// --- Dry-run preview ----------------------------------------------------------

export interface DryRunItem {
  key: string;
  label: string;
  status: "ok" | "warning" | "blocked";
  detail?: string;
}

/**
 * The per-item preview a bulk action shows inside the deliberate-confirm gate
 * before executing: each affected item with its outcome, so the operator sees
 * exactly what the action will do (and what it will skip) before confirming.
 */
export function DryRunPreview({
  items,
  summary,
  className,
}: {
  items: DryRunItem[];
  /** One-line rollup ("8 will archive, 1 skipped"), computed by the caller. */
  summary?: string;
  className?: string;
}) {
  const glyph: Record<DryRunItem["status"], ReactNode> = {
    ok: <AcuityIcon name="check" size={14} className="text-success" />,
    warning: <AcuityIcon name="alert" size={14} style={{ color: "var(--tone-warning-glyph)" }} />,
    blocked: <AcuityIcon name="x" size={14} className="text-destructive" />,
  };
  return (
    <div className={cn("space-y-2", className)}>
      {summary ? <p className="text-sm text-foreground">{summary}</p> : null}
      <ul className="max-h-56 space-y-1 overflow-y-auto rounded-md border border-border bg-muted/50 p-2">
        {items.map((item) => (
          <li key={item.key} className="flex items-start gap-2 px-1 py-0.5 text-sm">
            <span className="mt-0.5 flex shrink-0" aria-hidden>
              {glyph[item.status]}
            </span>
            <span className="min-w-0">
              <span className="text-foreground">{item.label}</span>
              {item.detail ? (
                <span className="block text-xs text-muted-foreground">{item.detail}</span>
              ) : null}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
