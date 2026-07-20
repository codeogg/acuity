import { cn } from "../lib/cn";
import type { HTMLAttributes } from "react";

// Corrected TableRow (shadows the design-kit base via explicit re-export
// precedence): resting rows are FLAT — no default hover wash. The base's
// hover:bg-muted/50 painted a near-invisible flicker on every row (Caliber
// muted ≈ the cream ground) and gave non-interactive rows a false affordance.
// Interactive rows opt in explicitly with `hover:bg-accent` (+ cursor-pointer),
// which is the perceptible Caliber hover step.
export function TableRow({
  className,
  ...props
}: HTMLAttributes<HTMLTableRowElement>) {
  return (
    <tr
      data-slot="table-row"
      className={cn(
        "border-b transition-colors data-[state=selected]:bg-muted",
        className,
      )}
      {...props}
    />
  );
}
