"use client";

// Pagination — page navigation that drives a server re-render via the `page`
// search param. Uses the design-kit Pagination primitives. Only rendered when
// total exceeds one page.

import { usePathname, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@acuity/ui";

export function PaginationBar({
  page,
  pageSize,
  total,
}: {
  page: number;
  pageSize: number;
  total: number;
}) {
  const t = useTranslations("pagination");
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  if (pageCount <= 1) return null;

  function hrefFor(p: number) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("page", String(p));
    return `${pathname}?${params.toString()}`;
  }

  const pages = Array.from({ length: pageCount }, (_, i) => i + 1);

  return (
    <div className="flex items-center justify-between px-6 py-4">
      <span className="text-sm text-muted-foreground">
        {t("summary", { start: (page - 1) * pageSize + 1, end: Math.min(page * pageSize, total), total })}
      </span>
      <Pagination className="mx-0 w-auto justify-end">
        <PaginationContent>
          <PaginationItem>
            <PaginationPrevious
              href={hrefFor(Math.max(1, page - 1))}
              aria-disabled={page <= 1}
              // min-w-7: the icon-only collapsed form is 21px wide, under the
              // 24px WCAG 2.2 target minimum.
              className={`min-w-7 justify-center ${page <= 1 ? "pointer-events-none opacity-40" : ""}`}
            />
          </PaginationItem>
          {pages.map((p) => (
            <PaginationItem key={p}>
              <PaginationLink href={hrefFor(p)} isActive={p === page}>
                {p}
              </PaginationLink>
            </PaginationItem>
          ))}
          <PaginationItem>
            <PaginationNext
              href={hrefFor(Math.min(pageCount, page + 1))}
              aria-disabled={page >= pageCount}
              className={`min-w-7 justify-center ${page >= pageCount ? "pointer-events-none opacity-40" : ""}`}
            />
          </PaginationItem>
        </PaginationContent>
      </Pagination>
    </div>
  );
}
