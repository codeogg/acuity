"use client";

import { useTranslations } from "next-intl";
import { Shimmer } from "@acuity/ui";

// The Caliber loading set (FINAL §8 + components.md §8): shape compositions
// over the shared Shimmer primitive (accent tint + slow sweep, defined once in
// @acuity/ui). Under prefers-reduced-motion the shimmer collapses to a static
// tint and a labelled cue is shown — never a motionless silent blank.

// A skeleton mirroring a card list (work-home, history, patients). `count` cards.
export function CardListSkeleton({
  count = 3,
  label,
}: {
  count?: number;
  label?: string;
}) {
  return (
    <div className="space-y-3" role="status" aria-live="polite">
      {label && <span className="sr-only">{label}</span>}
      {/* Labelled cue for reduced motion (visible only when motion is reduced). */}
      {label && (
        <p className="acuity-reduced-only text-sm text-muted-foreground">{label}</p>
      )}
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="rounded-md border border-border bg-card p-4"
        >
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0 flex-1 space-y-2">
              <Shimmer className="h-4 w-2/5" />
              <Shimmer className="h-3 w-1/4" />
            </div>
            <Shimmer className="h-5 w-20" />
          </div>
        </div>
      ))}
    </div>
  );
}

// A skeleton mirroring the review dual-pane form (right pane field rows). Used
// by the review loading state.
export function ReviewFormSkeleton({ label }: { label?: string }) {
  return (
    <div className="space-y-6" role="status" aria-live="polite">
      {label && <span className="sr-only">{label}</span>}
      {label && (
        <p className="acuity-reduced-only text-sm text-muted-foreground">{label}</p>
      )}
      {[0, 1].map((group) => (
        <div key={group} className="space-y-3">
          <Shimmer className="h-6 w-1/3" />
          {[0, 1, 2].map((row) => (
            <div
              key={row}
              className="rounded-md border border-border bg-card p-3"
            >
              <Shimmer className="mb-2 h-3 w-1/4" />
              <Shimmer className="h-9 w-full" />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

// The full review-surface skeleton (extraction + review loading): preview pane
// on the left, summary bar + filter chips + field rows on the right — mirrors
// the populated review so arrival causes no layout shift.
export function ReviewSurfaceSkeleton({ label }: { label?: string }) {
  return (
    <div className="grid gap-6 lg:grid-cols-12" role="status" aria-live="polite">
      {label && <span className="sr-only">{label}</span>}
      {label && (
        <p className="acuity-reduced-only text-sm text-muted-foreground lg:col-span-12">
          {label}
        </p>
      )}
      <div className="hidden lg:col-span-5 lg:block">
        <Shimmer className="h-96 rounded-md" />
      </div>
      <div className="lg:col-span-7">
        {/* summary bar */}
        <div className="mb-3 rounded-md border border-border bg-card p-4">
          <Shimmer className="h-5 w-2/3" />
        </div>
        {/* filter chips */}
        <div className="mb-6 flex gap-2">
          {[0, 1, 2, 3].map((chip) => (
            <Shimmer key={chip} className="h-9 w-20 rounded-full" />
          ))}
        </div>
        <ReviewFormSkeleton />
      </div>
    </div>
  );
}

// A progress affordance for a known wait (extraction, produce): the slow
// "catch-up" arc + escalating copy, per FINAL §8. Not a fast tight spinner.
// `bare` renders just the arc for inline compositions.
export function CatchUpArc({
  label,
  sublabel,
  bare,
}: {
  label?: string;
  sublabel?: string;
  bare?: boolean;
}) {
  const t = useTranslations();
  const arc = (
    <span
      aria-hidden
      className="acuity-arc size-8 shrink-0 rounded-full border-2 border-[var(--color-loading-placeholder-shimmer)] border-t-primary"
    />
  );
  if (bare) return arc;
  return (
    <div
      className="flex flex-col items-center gap-3 text-center"
      role="status"
      aria-live="polite"
    >
      {arc}
      {label && <p className="text-base text-foreground">{label}</p>}
      {sublabel && <p className="text-sm text-muted-foreground">{sublabel}</p>}
      <span className="sr-only">{t("app.loading")}</span>
    </div>
  );
}
