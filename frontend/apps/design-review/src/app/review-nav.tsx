"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@acuity/ui";
import { useReview, type Section } from "./review-state";
import { DirtyDot, ChangeBadge, ExportMenu } from "./_components/controls";

const PAGES: { href: string; label: string; section: Section }[] = [
  { href: "/surfaces", label: "Surfaces", section: "surfaces" },
  { href: "/colours", label: "Colour", section: "colours" },
  { href: "/fonts", label: "Fonts", section: "fonts" },
];

export function ReviewNav() {
  const pathname = usePathname();
  const review = useReview();
  return (
    <nav
      aria-label="Review pages"
      className="mx-auto flex max-w-6xl flex-wrap items-center gap-2 rounded-lg bg-card p-1.5 shadow-[var(--elevation-raised)]"
    >
      <span className="px-2.5 font-title text-lg font-semibold text-navy">Acuity</span>
      <span className="pr-1 font-mono text-xs uppercase tracking-widest text-muted-foreground">
        design review
      </span>
      {PAGES.map((p) => {
        const active = pathname.startsWith(p.href);
        return (
          <Link
            key={p.href}
            href={p.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition-colors",
              active
                ? "bg-sky-blue/50 text-navy hover:bg-sky-blue/65"
                : "text-muted-foreground hover:bg-accent hover:text-foreground",
            )}
          >
            {p.label}
            <DirtyDot on={review.sectionDirtyCount(p.section) > 0} />
          </Link>
        );
      })}

      <div className="ml-auto flex items-center gap-2">
        <ChangeBadge count={review.totalDirtyCount} label="total" />
        <button
          type="button"
          onClick={review.resetAll}
          disabled={review.totalDirtyCount === 0}
          className="rounded-md border border-border bg-card px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
        >
          Reset all
        </button>
        <ExportMenu scope="all" label="Export all" />
      </div>
    </nav>
  );
}
