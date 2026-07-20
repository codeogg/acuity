"use client";

import { cn } from "@component-core/ui";
import type { HTMLAttributes } from "react";

// The one Acuity spinner family, shadowing the design-kit Loader /
// CenteredLoading via explicit re-export precedence so every wait state
// animates identically across surfaces. The spinner is a pure-rotation ring:
// a faint currentColor track with a solid currentColor arc, CONSTANT 2px
// stroke at every size, no scale pulse (the house `.acuity-spinner` rule in
// styles.css). Colour rides currentColor; size maps the base's sm/default/lg
// steps. Skeleton placeholders (accent shimmer) remain the right tool for
// content-shaped waits — the spinner is for indeterminate action waits.

const SIZE_PX = { sm: 16, default: 24, lg: 36 } as const;

export function Spinner({
  size = 20,
  className,
}: {
  /** Pixel size (component-level use, e.g. inside a busy button). */
  size?: number;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn("acuity-spinner", className)}
      style={{ width: size, height: size }}
    />
  );
}

export function Loader({
  className,
  size = "default",
  label,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  size?: keyof typeof SIZE_PX;
  variant?: "arc" | "dots";
  label?: string;
}) {
  return (
    <div
      data-slot="loader"
      role="status"
      aria-live="polite"
      aria-busy="true"
      className={cn(
        "flex flex-col items-center justify-center gap-3 text-muted-foreground",
        className,
      )}
      {...props}
    >
      <Spinner size={SIZE_PX[size]} />
      {label ? (
        <span data-slot="loader-label" className="text-sm text-muted-foreground">
          {label}
        </span>
      ) : (
        <span className="sr-only">Loading</span>
      )}
    </div>
  );
}

/**
 * The one skeleton-shimmer primitive (accent tint + slow sweep, the house
 * `.acuity-shimmer` rule in styles.css). Shape compositions (card lists,
 * grids, drawers) stay app-side and size these bars; a wrapping container
 * carries role="status" + the localised label.
 */
export function Shimmer({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn("acuity-shimmer block overflow-hidden rounded-md", className)}
    />
  );
}

export function CenteredLoading({
  className,
  label,
  size = "lg",
  variant,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  size?: keyof typeof SIZE_PX;
  variant?: "arc" | "dots";
  label?: string;
}) {
  return (
    <div
      data-slot="centered-loading"
      className={cn(
        "flex min-h-40 w-full flex-1 items-center justify-center p-6",
        className,
      )}
      {...props}
    >
      <Loader size={size} variant={variant} label={label} />
    </div>
  );
}
