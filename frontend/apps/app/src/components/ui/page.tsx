import type { ReactNode } from "react";
import { cn } from "@acuity/ui";

// Shared work-area primitives. Every surface's work area shares the
// --container-max (1200px) content cap with the per-breakpoint page padding
// (16 / 32 / 48px) per FINAL / overview.md §Work area. Headings carry the
// Caliber eyebrow register (12px mono uppercase) above the serif title.

export function PageContainer({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "mx-auto w-full max-w-[var(--container-max)] px-4 py-6 md:px-8 md:py-8 lg:px-12 lg:py-10",
        className,
      )}
    >
      {children}
    </div>
  );
}

// The mono uppercase eyebrow register (components.md §5 / reference t-eyebrow).
export function Eyebrow({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <p
      className={cn(
        "t-eyebrow text-muted-foreground",
        className,
      )}
    >
      {children}
    </p>
  );
}

export function PageHeading({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  children?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="space-y-1.5">
        {eyebrow && <Eyebrow className="mb-1">{eyebrow}</Eyebrow>}
        <h1 className="font-title text-3xl font-semibold text-foreground">
          {title}
        </h1>
        {description && <p className="text-base text-muted-foreground">{description}</p>}
      </div>
      {children && <div className="shrink-0">{children}</div>}
    </div>
  );
}
