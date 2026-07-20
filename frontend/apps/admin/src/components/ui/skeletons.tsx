// Loading vocabulary (LD1–LD8): accent-tinted, shape-mirroring compositions
// over the shared @acuity/ui Shimmer primitive. The top-bar + filter row
// render immediately server-side; only the data region skeletonises
// (per-region on dashboard/drawer). Server components; the status label is
// localised here (next-intl serves useTranslations in server components).

import { useTranslations } from "next-intl";
import { Shimmer } from "@acuity/ui";

export function GridSkeleton({ rows = 8, cols = 6 }: { rows?: number; cols?: number }) {
  const t = useTranslations("common");
  return (
    <div className="px-6 pt-4" role="status" aria-label={t("loading")}>
      <div className="mb-3 flex gap-4 border-b border-border-strong pb-2">
        {Array.from({ length: cols }).map((_, i) => (
          <Shimmer key={i} className="h-3 flex-1" />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex h-11 items-center gap-4 border-b border-border">
          {Array.from({ length: cols }).map((_, c) => (
            <Shimmer key={c} className="h-3 flex-1" />
          ))}
        </div>
      ))}
    </div>
  );
}

export function CardSkeleton({ height = 140 }: { height?: number }) {
  const t = useTranslations("common");
  return (
    <div
      className="rounded-lg border border-border bg-card p-6"
      role="status"
      aria-label={t("loading")}
      style={{ height }}
    >
      <Shimmer className="mb-4 h-3 w-2/5" />
      <Shimmer className="h-8 w-3/5" />
    </div>
  );
}

export function DrawerSkeleton() {
  const t = useTranslations("common");
  return (
    <div className="space-y-4 py-2" role="status" aria-label={t("loading")}>
      <Shimmer className="h-6 w-1/2" />
      <Shimmer className="h-3 w-full" />
      <Shimmer className="h-3 w-4/5" />
      <Shimmer className="h-3 w-3/5" />
      <Shimmer className="h-24 w-full" />
    </div>
  );
}
