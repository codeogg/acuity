"use client";

import type { ComponentProps } from "react";
import { SelectContent as BaseSelectContent, cn } from "@component-core/ui";

// Shadows the design-kit SelectContent onto the house floating-menu grammar
// (the DropdownMenuContent one): the list drops BELOW the trigger instead of
// overlaying it (popper, not Radix's item-aligned default), and the panel
// carries the same 4px inner gutter so item washes never kiss the popover
// edges. Triggers, items, and the indicator gutter stay design-kit base.
export function SelectContent({
  position = "popper",
  className,
  ...props
}: ComponentProps<typeof BaseSelectContent>) {
  return (
    <BaseSelectContent position={position} className={cn("p-1", className)} {...props} />
  );
}
