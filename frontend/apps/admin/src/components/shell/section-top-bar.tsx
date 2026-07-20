"use client";

// Section top-bar — the two-row header every destination composes (overview.md
// §Section top-bar): Row 1 eyebrow + serif title with the primary action
// pinned top-right; Row 2 the saved-view count-tab strip (counts, favourite
// star on the active tab, a "+" save-current-view control). Server component;
// tabs arrive as prebuilt CountTab hrefs. Client component: the shared
// CountTabs executes design-kit client-bundle utilities.

import type { ReactNode } from "react";
import { CountTabs, type CountTab } from "@acuity/ui";
import { SaveViewButton } from "@/components/grid/save-view-button";

export function SectionTopBar({
  eyebrow,
  title,
  action,
  tabs,
  grid,
  filterRow,
}: {
  eyebrow: string;
  title: string;
  action?: ReactNode;
  tabs?: CountTab[];
  /** Saved-view grid id — enables the "+" save-current-view control. */
  grid?: string;
  filterRow?: ReactNode;
}) {
  return (
    <div className="shrink-0 border-b border-border bg-background">
      {/* Wraps at phone widths so the pinned action drops below the title
          instead of forcing a horizontal scroll. */}
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 px-6 pt-4">
        <div>
          <div className="mb-1 whitespace-nowrap font-mono text-xs font-medium uppercase tracking-eyebrow text-muted-foreground">
            {eyebrow}
          </div>
          <h1 className="m-0 font-title text-3xl font-semibold leading-tight text-foreground">
            {title}
          </h1>
        </div>
        {action ? <div className="pt-1">{action}</div> : null}
      </div>
      {tabs ? (
        <div className="mt-2">
          <CountTabs
            tabs={tabs}
            className="border-b-0"
            action={grid ? <SaveViewButton grid={grid} /> : undefined}
          />
        </div>
      ) : null}
      {filterRow}
    </div>
  );
}
