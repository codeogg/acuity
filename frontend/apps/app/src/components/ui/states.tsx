import type { ReactNode } from "react";
import { Callout, EmptyState, cn } from "@acuity/ui";

// Shared state presentation. Empty states are informative and point to the next
// action (never a bare "no data"); error states are inline, specific, recoverable
// (never a stack trace). Both are colour + icon + text.

// The one empty-state grammar: the design-kit EmptyState base (the console
// wraps the same base); copy stays with the caller, the action slot takes any
// node (link buttons, not just onClick handlers).
export function EmptyPanel({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("py-4", className)}>
      <EmptyState icon={icon} title={title} description={description} />
      {action && <div className="mt-5 flex justify-center">{action}</div>}
    </div>
  );
}

export function ErrorPanel({
  title,
  description,
  action,
  className,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <Callout tone="danger">
        <div className="flex flex-col gap-3">
          <div>
            <p className="font-medium text-foreground">{title}</p>
            {description && (
              <p className="mt-1 text-sm text-muted-foreground">{description}</p>
            )}
          </div>
          {action}
        </div>
      </Callout>
    </div>
  );
}

// A calm contextual banner (needs-sign-off, manual-mode, self-verification). A
// contained wide inset card (never edge-to-edge). Wraps the design-kit Callout.
export function InsetBanner({
  tone,
  children,
  className,
}: {
  tone: "info" | "warning" | "danger" | "success";
  children: ReactNode;
  className?: string;
}) {
  return (
    <Callout tone={tone} className={cn("rounded-md", className)}>
      {children}
    </Callout>
  );
}
