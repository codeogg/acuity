import { cn } from "../lib/cn";
import type { HTMLAttributes } from "react";

// Corrected Table (shadows the design-kit base via explicit re-export
// precedence): the scroll container is keyboard-reachable. The base renders a
// bare overflow-x-auto div, which WCAG 2.1.1 / axe (scrollable-region-
// focusable) fails whenever a wide grid actually scrolls — keyboard users
// could never reach the clipped columns. The container is a region with a
// tab stop (the axe-recommended pattern); the sr-only caption inside the
// table names it for AT. Stays server-safe (no hooks) like the rest of this
// module.
export function Table({
  className,
  ...props
}: HTMLAttributes<HTMLTableElement>) {
  return (
    <div
      data-slot="table-container"
      role="region"
      tabIndex={0}
      className="relative w-full overflow-x-auto rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <table
        data-slot="table"
        className={cn("w-full caption-bottom text-sm", className)}
        {...props}
      />
    </div>
  );
}
