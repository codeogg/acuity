import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
  {
    variants: {
      variant: {
        default: "bg-[var(--color-primary)] text-[var(--color-primary-foreground)]",
        secondary: "bg-[var(--color-muted)] text-[var(--color-muted-foreground)]",
        success: "bg-[var(--color-success-soft)] text-[var(--color-success)]",
        warning: "bg-[var(--color-warning-soft)] text-[var(--color-warning)]",
        destructive: "bg-[var(--color-danger-soft)] text-[var(--color-destructive)]",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
