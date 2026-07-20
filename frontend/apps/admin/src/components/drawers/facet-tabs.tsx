"use client";

// Facet tab strip inside a detail drawer — links preserving the grid's search
// params; the active facet is colour + underline (fixed geometry). Hrefs are
// prebuilt by the page. Below sm the strip stays one row and scrolls
// horizontally (scrollbar hidden — the underline + cut-off edge signal the
// overflow), with the active tab kept in view on facet change so a deep link
// to a later facet never opens with its underline off-screen; at sm+ it wraps
// as before.

import { useEffect, useRef } from "react";
import Link from "next/link";

export function FacetTabs({
  facets,
}: {
  facets: { key: string; label: string; href: string; active: boolean }[];
}) {
  const activeRef = useRef<HTMLAnchorElement>(null);
  const activeKey = facets.find((f) => f.active)?.key;

  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [activeKey]);

  return (
    <div
      data-testid="facet-tabs"
      className="-mx-1 mb-4 flex gap-1 overflow-x-auto border-b border-border pb-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:flex-wrap sm:overflow-x-visible"
    >
      {facets.map((f) => (
        <Link
          key={f.key}
          ref={f.active ? activeRef : undefined}
          href={f.href}
          replace
          scroll={false}
          aria-current={f.active ? "page" : undefined}
          className={`relative flex h-9 shrink-0 items-center whitespace-nowrap rounded-t-sm px-3 text-sm transition-colors ${
            f.active
              ? "text-primary after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:rounded-full after:bg-primary"
              : "text-muted-foreground hover:bg-accent hover:text-foreground"
          }`}
        >
          {f.label}
        </Link>
      ))}
    </div>
  );
}
