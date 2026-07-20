"use client";

import { cn } from "@/lib/utils";

type AiGlowBorderProps = {
  active?: boolean;
  children: React.ReactNode;
  className?: string;
  innerClassName?: string;
};

export function AiGlowBorder({
  active = false,
  children,
  className,
  innerClassName,
}: AiGlowBorderProps) {
  if (!active) {
    return (
      <div
        className={cn(
          "overflow-hidden rounded-md border border-[var(--color-border)] bg-white",
          className,
        )}
      >
        {children}
      </div>
    );
  }

  return (
    <div className={cn("ai-glow-border", className)}>
      <div className="ai-glow-border__glow" aria-hidden />
      <div className="ai-glow-border__shimmer" aria-hidden />
      <div className="ai-glow-border__ring" aria-hidden />
      <div className={cn("ai-glow-border__inner", innerClassName)}>{children}</div>
    </div>
  );
}
