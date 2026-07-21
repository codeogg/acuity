"use client";

// URL-bound detail drawer — the console's drawer-over-the-grid pattern. The
// open record and facet live in search params (?open=<id>&facet=<facet>), so
// the grid's filter/sort/selection context survives underneath, the facet
// switch is a server re-render, and closing simply strips the params
// (close via the header button only — outside click and Escape do not dismiss).

import type { ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { usePathname, useRouter } from "@acuity/i18n/navigation";
import { DetailDrawer } from "@acuity/ui";

const DRAWER_PARAMS = ["open", "facet", "new"];

export function RouteDrawer({
  title,
  description,
  footer,
  wide = false,
  children,
}: {
  title: string;
  description?: string;
  footer?: ReactNode;
  wide?: boolean;
  children: ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function close() {
    const params = new URLSearchParams(searchParams.toString());
    for (const p of DRAWER_PARAMS) params.delete(p);
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  return (
    <DetailDrawer
      open
      onOpenChange={(open) => {
        if (!open) close();
      }}
      title={title}
      description={description}
      footer={footer}
      // The data-[side=right] overrides replace the design-kit sheet's own
      // side-variant width classes (its max-w-sm resolves against the theme's
      // --space-sm — a foundation token-mapping defect reported upstream).
      className={
        wide
          ? // token-exempt: spec-derived 860px wide-facet drawer width (managed exception)
            "data-[side=right]:w-full data-[side=right]:sm:w-[860px] data-[side=right]:sm:max-w-[860px]"
          : // token-exempt: spec-derived 560px drawer width (overview.md ops-grid drawer)
            "data-[side=right]:w-full data-[side=right]:sm:w-[560px] data-[side=right]:sm:max-w-[560px]"
      }
    >
      {children}
    </DetailDrawer>
  );
}
