"use client";

import { cn } from "@acuity/ui";
import type { ReactNode } from "react";

/** Rainbow flowing border while AI extraction is running (doctor web parity). */
export function AiGlowBorder({
  active = false,
  children,
  className,
  innerClassName,
}: {
  active?: boolean;
  children: ReactNode;
  className?: string;
  innerClassName?: string;
}) {
  if (!active) {
    return (
      <div className={cn("w-full overflow-hidden rounded-md border border-border bg-card", className)}>
        {children}
      </div>
    );
  }

  return (
    <div className={cn("ai-glow-border w-full", className)}>
      <div className="ai-glow-border__glow" aria-hidden />
      <div className="ai-glow-border__shimmer" aria-hidden />
      <div className="ai-glow-border__ring" aria-hidden />
      <div className={cn("ai-glow-border__inner", innerClassName)}>{children}</div>
    </div>
  );
}
