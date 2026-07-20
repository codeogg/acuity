// Route-transition fallback: an accent-tinted grid skeleton (LD2/LD7 — never
// grey, never blank). Within a page, prefer per-region <Suspense> so the
// top-bar + filter row render immediately and only the data rows skeletonise.

import { Shimmer } from "@acuity/ui";
import { GridSkeleton } from "@/components/ui/skeletons";

export function RouteLoading({ rows = 8 }: { rows?: number }) {
  return (
    <div className="pt-4">
      <div className="px-6 pb-4">
        <Shimmer className="h-8 w-48" />
      </div>
      <GridSkeleton rows={rows} />
    </div>
  );
}
